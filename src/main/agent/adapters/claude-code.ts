/**
 * Claude Code adapter — Tier-1, full capability support.
 *
 * Encapsulates all Claude Code CLI specifics:
 * - Launch via `claude`, with free-text start parameters from agent.startArgs (see
 *   AgentConfigReader below) prepended to the flags this adapter builds itself
 * - MCP injection via direct `settings.local.json` write AND `claude mcp add-json`
 *   (two paths — see postLaunchInjection's doc comment for why a third, once here, was
 *   removed rather than fixed)
 * - StatusLine hook for context usage reporting
 * - CLAUDE.md as project marker
 *
 * Ported from cipher-mux 0.9.x (CK-INF-003).
 */

import * as fs from 'fs'
import * as path from 'path'
import { SITZUNG_FREMDES_CLI } from '../agent-adapter'
import type {
  CliSitzungsAdapter,
  LaunchCommand,
  LaunchOpts,
  AdapterContext,
  ProjectInstructions,
  SendOpts,
  OutputEvent,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { CapabilityNiveau } from '../../preset/niveau'
import { runCommand, isCommandOnPath } from '../../util/exec-util'
import { formatShellCommand } from '../../util/shell-quote'
import { describeMissingTool } from '../../util/missing-tool'

/** Minimal interface for reading the agent config section. */
export interface AgentConfigReader {
  /** Extra launch parameters for this adapter, already split into argv. */
  getStartArgs(adapterId: string): string[]
}

export class ClaudeCodeAdapter implements CliSitzungsAdapter {
  readonly id = 'claude-code'
  readonly displayName = 'Claude Code'
  readonly tier = 'tier-1' as const
  readonly niveau = CapabilityNiveau.A
  readonly sitzungsart = SITZUNG_FREMDES_CLI
  readonly appGesteuerteParameter = [
    '--resume', '--fork-session', '--model', '--append-system-prompt-file',
  ] as const

  private readonly configReader: AgentConfigReader

  constructor(configReader: AgentConfigReader) {
    this.configReader = configReader
  }

  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    // User parameters first, app-driven flags after: with the migrated default this
    // produces a byte-identical command line to the pre-startArgs behaviour.
    const args: string[] = [...this.configReader.getStartArgs(this.id)]
    if (opts.resume) {
      args.push('--resume')
    }
    if (opts.forkFromClaudeSessionId) {
      args.push('--fork-session', opts.forkFromClaudeSessionId)
    }
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.appendSystemPromptFile !== undefined) {
      if (!opts.appendSystemPromptFile) {
        // Starting without the entity prompt looks like a working session but is not one.
        throw new Error(
          '[ClaudeCodeAdapter] --append-system-prompt-file was set but empty — ' +
          'refusing to launch without the entity prompt'
        )
      }
      args.push('--append-system-prompt-file', opts.appendSystemPromptFile)
    }
    return { cmd: 'claude', args }
  }

  /**
   * Registers the MCP server in Claude Code's settings, so a session started by
   * SESSION_CREATE (ipc-handlers.ts) can reach the ten MCP tools. Despite the method name
   * (kept for the `CliSitzungsAdapter` interface, and because it does run once per launch),
   * this now runs *before* `tmux.createSession` spawns the `claude` process, not after —
   * see the call site's comment for why: `claude` reads its MCP config once, at its own
   * start, so writing it after the process already exists was a race this could only
   * sometimes win (security review finding I-1, 2026-08-30). Nothing here needs a live
   * session — `ctx.sessionId` is not read below at all.
   *
   * Uses TWO paths, not three:
   * 1. Direct write to `<project>/.claude/settings.local.json` — the path Claude Code
   *    actually reads a project's local MCP config from.
   * 2. `claude mcp add-json` — the CLI's own registration command. Its bearer key argument
   *    is visible in the process table for the command's short lifetime and is persisted by
   *    Claude Code itself into `~/.claude.json`; that disclosure is inherent to using the
   *    CLI's own command, not something this file adds independently.
   *
   * A third path — writing `~/.claude/projects/<hash>/settings.json` — existed here until
   * the same review found it: that directory holds session transcripts (`*.jsonl`), and
   * Claude Code does not read settings from it at all. It was a secret written to disk for
   * no reader — removed outright, not "fixed", because there was nothing to fix it into.
   *
   * Return value (added for the I-1 follow-up, security review 2026-08-30): moving this call
   * ahead of `tmux.createSession` closed the race but opened a narrower gap the review
   * caught — if `createSession` now fails *after* this succeeds, a live bearer is left behind
   * for a session that never came to exist. The returned closure undoes exactly what path 1
   * wrote, and only that: it restores `settings.local.json` to whatever it held immediately
   * before this call (deletes the `cipher-keel` entry if there was none, restores the prior
   * entry if there was one) — never a blind delete, because this method merges into a file
   * that may already carry another session's still-valid registration for the same project
   * (one key for the whole app instance, see B5 — so a second session in the same project
   * would otherwise be "restoring" a value that is, byte for byte, what a still-running first
   * session also depends on). Path 2 is deliberately NOT undone: reversing a `claude mcp`
   * CLI registration would mean either parsing `~/.claude.json` ourselves (a format this file
   * intentionally does not touch directly, see path 2 above) or running `claude mcp remove`
   * again — which would remove the one local entry for this project outright, the exact same
   * collision risk path 1's undo avoids, since another session in the same project may depend
   * on it. That residual is named to the caller instead (ipc-handlers.ts surfaces it in the
   * thrown error's message) — it is self-limiting even so: rewritten by the next successful
   * injection for this project, and moot entirely once the app restarts (B2's key rotates).
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<() => void> {
    const mcpServerConfig = {
      type: 'http',
      url: ctx.mcpUrl,
      headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
    }

    // Path 1: Direct write to local settings.local.json — tracked so undoSettingsWrite can
    // put back exactly what was here before, not just delete what this call added.
    let undoSettingsWrite: (() => void) | null = null
    try {
      const claudeDir = path.join(ctx.projectPath, '.claude')
      const localSettingsPath = path.join(claudeDir, 'settings.local.json')

      fs.mkdirSync(claudeDir, { recursive: true })

      let settings: Record<string, unknown> = {}
      try {
        settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
      } catch {
        // File doesn't exist or invalid JSON — start fresh
      }

      if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
        settings.mcpServers = {}
      }
      const mcpServers = settings.mcpServers as Record<string, unknown>
      const hadEntryBefore = Object.prototype.hasOwnProperty.call(mcpServers, 'cipher-keel')
      const previousEntry = mcpServers['cipher-keel']

      mcpServers['cipher-keel'] = mcpServerConfig
      fs.writeFileSync(localSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')

      undoSettingsWrite = () => {
        // Re-read rather than reuse the `settings` object above: something else may have
        // written to this file between the write and the undo (however unlikely in the
        // narrow window this covers) — undoing against a stale in-memory copy could clobber
        // that change. A missing/unreadable file means there is nothing left to undo.
        let current: Record<string, unknown>
        try {
          current = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
        } catch {
          return
        }
        if (!current.mcpServers || typeof current.mcpServers !== 'object') return
        const currentServers = current.mcpServers as Record<string, unknown>
        if (hadEntryBefore) {
          currentServers['cipher-keel'] = previousEntry
        } else {
          delete currentServers['cipher-keel']
        }
        fs.writeFileSync(localSettingsPath, JSON.stringify(current, null, 2), 'utf-8')
      }
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] Local settings.local.json write failed:', err)
    }

    // Path 2: CLI command — not undone on rollback, see the doc comment above.
    try {
      const serverJson = JSON.stringify(mcpServerConfig)

      await runCommand('claude', [
        'mcp', 'remove', '-s', 'local', 'cipher-keel',
      ], { cwd: ctx.projectPath, timeout: 10_000 }).catch(() => {})

      await runCommand('claude', [
        'mcp', 'add-json', '-s', 'local', 'cipher-keel', serverJson,
      ], { cwd: ctx.projectPath, timeout: 15_000 })
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] CLI MCP registration failed:', err)
    }

    return () => {
      if (undoSettingsWrite) undoSettingsWrite()
    }
  }

  getProjectMarkers(): string[] {
    return ['CLAUDE.md', '.claude']
  }

  async readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null> {
    const filePath = path.join(projectPath, 'CLAUDE.md')
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content, filePath }
    } catch {
      return null
    }
  }

  supports(_feature: AdapterFeature): boolean {
    return true // Claude Code supports all features
  }

  getCapabilities(): AdapterCapabilities {
    return {
      'mcp-injection': true,
      'status-line': true,
      'skip-permissions': true,
      'sub-agents': true,
      'project-instructions': true,
      'message-bus-participant': true,
      'companion-mcp': true,
    }
  }

  async attachStatusHook(projectPath: string): Promise<void> {
    const { injectStatusLineHook } = await import('../../monitoring/statusline-hook')
    injectStatusLineHook(projectPath)
  }

  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    // Claude Code accepts plain text via tmux send-keys.
    // SessionManager handles the actual send — this method exists for adapters
    // that need custom prompt framing (e.g. JSON-RPC).
    throw new Error('sendPrompt should be called via SessionManager.sendKeys')
  }

  // --- ENT-026: runtime interface ---

  /**
   * Return true if the `claude` binary is reachable on PATH.
   * Synchronous, no side effects. CK-ENT-026
   */
  isAvailable(): boolean {
    return isCommandOnPath('claude')
  }

  /**
   * The reason now lives on the adapter instead of SESSION_CREATE. Until this fix round
   * the handler assembled it itself with
   * `adapter.id === 'claude-code' ? describeMissingTool('claude') : …` — a special case
   * in the one place that had the least information about it.
   */
  nichtVerfuegbarGrund(): string | null {
    return this.isAvailable() ? null : describeMissingTool('claude')
  }

  /**
   * ClaudeCodeAdapter delivers commands via tmux / SessionManager.
   * Callers must use SessionManager.sendKeys instead. CK-ENT-026
   */
  async executeCommand(_command: string): Promise<string> {
    throw new Error(
      '[ClaudeCodeAdapter] executeCommand must be called via SessionManager — ' +
      'tmux-based delivery is handled there, not on the adapter directly.'
    )
  }

  /**
   * ClaudeCodeAdapter captures output via tmux pane buffers.
   * Callers must use the tmux output-batcher instead. CK-ENT-026
   */
  async *streamOutput(_sessionId: string): AsyncGenerator<OutputEvent> {
    throw new Error(
      '[ClaudeCodeAdapter] streamOutput must be called via the tmux output-batcher — ' +
      'tmux-based output capture is handled there, not on the adapter directly.'
    )
  }

  /** The launch line as a human reads it — one source with buildLaunchCommand's argv. */
  private startBefehl(): string {
    return formatShellCommand('claude', this.configReader.getStartArgs(this.id))
  }

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (Claude Code)

Starte Worker mit: \`${this.startBefehl()}\`
MCP-Tools stehen einer Sitzung zur Verfuegung, die gestartet wurde, waehrend diese
App-Instanz laeuft. Eine Sitzung, die einen Neustart der App ueberlebt hat, verliert sie,
bis sie zerstoert und neu angelegt wird (siehe docs/anpassbare-flaechen.md, Abschnitt
"Was fehlt").
Instruktionen DIREKT via tmux send-keys in den Pane schicken.
`
    }
    return `### Worker Session Startup (Claude Code)

Start workers with: \`${this.startBefehl()}\`
MCP tools are available to a session that was started while this app instance is
running. A session that survived an app restart loses them until it is destroyed and
recreated (see docs/anpassbare-flaechen.md, "Was fehlt" section).
Send instructions DIRECTLY via tmux send-keys into the pane.
`
  }

  buildLauncherPromptFragment(_lang: 'de' | 'en'): string {
    return '/launch'
  }

  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (Claude Code)

Starte Worker mit: \`${this.startBefehl()}\`
MCP-Tools stehen einer Sitzung zur Verfuegung, die gestartet wurde, waehrend diese
App-Instanz laeuft. Eine Sitzung, die einen Neustart der App ueberlebt hat, verliert sie,
bis sie zerstoert und neu angelegt wird (siehe docs/anpassbare-flaechen.md, Abschnitt
"Was fehlt").
Instruktionen DIREKT via tmux send-keys in den Pane schicken.
Session-Prefix fuer Cyber-Factory-Worker: \`ckeel-cf-\`
`
    }
    return `### Worker Session Startup (Claude Code)

Start workers with: \`${this.startBefehl()}\`
MCP tools are available to a session that was started while this app instance is
running. A session that survived an app restart loses them until it is destroyed and
recreated (see docs/anpassbare-flaechen.md, "Was fehlt" section).
Send instructions DIRECTLY via tmux send-keys into the pane.
Session prefix for Cyber Factory workers: \`ckeel-cf-\`
`
  }
}
