/**
 * Claude Code adapter — Tier-1, full capability support.
 *
 * Encapsulates all Claude Code CLI specifics:
 * - Launch via `claude`, with free-text start parameters from agent.startArgs (see
 *   AgentConfigReader below) prepended to the flags this adapter builds itself
 * - MCP injection via a direct `settings.local.json` write — EIN Weg, seit Paket D. Zwei
 *   weitere standen hier einmal (`claude mcp add-json`, und davor ein Schreibvorgang nach
 *   `~/.claude/projects/<hash>/settings.json`); beide wurden ersatzlos entfernt, nicht
 *   repariert. Siehe den Doc-Kommentar an postLaunchInjection.
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
  McpEinspritzungsBeschreibung,
  ProjectInstructions,
  SendOpts,
  OutputEvent,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { CapabilityNiveau } from '../../preset/niveau'
// `runCommand` stand hier fuer den zweiten Einspritzungsweg (`claude mcp add-json`), den
// Paket D ersatzlos gestrichen hat. Dieser Adapter ruft seither keinen externen Befehl mehr.
import { isCommandOnPath } from '../../util/exec-util'
import { formatShellCommand } from '../../util/shell-quote'
import { describeMissingTool } from '../../util/missing-tool'
import { writeEntityPromptFile } from '../../session/prompt-file'

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
   * Claude Code reads the file behind `--append-system-prompt-file` as plain text and appends
   * it — no frontmatter, no placeholders, nothing to compose. So this is `writeEntityPromptFile`
   * and deliberately nothing else: the same call SESSION_CREATE made itself until 2026-08-30,
   * with the same arguments, writing the same bytes to the same path. The method exists so the
   * decision has an owner (see the contract in agent-adapter.ts), not because Claude's answer
   * to it changed.
   */
  schreibeEntitaetsPromptDatei(
    userDataPath: string,
    sessionName: string,
    prompt: string,
  ): string {
    return writeEntityPromptFile(userDataPath, sessionName, prompt)
  }

  /**
   * Der eine Ort der postLaunchInjection in den Worten, die ein Mensch zu sehen bekommt — und
   * `McpEinspritzungsBeschreibung` fuer den Grund, warum das am Adapter haengt und nicht in
   * SESSION_CREATE, wo der Dateiname einmal fest eingetragen war.
   *
   * `nichtZuruecknehmbarerRest` bleibt seit Paket D **leer**, und das ist eine Aussage: es gab
   * hier einen zweiten Weg (`claude mcp add-json`), den `claude mcp remove` nur loeschen und
   * nie wiederherstellen konnte — dieser Rest musste dem Menschen genannt werden. Den Weg gibt
   * es nicht mehr, also gibt es den Rest nicht mehr, und ein Feld, das trotzdem etwas nennte,
   * waere eine Warnung vor nichts.
   */
  readonly mcpEinspritzung: McpEinspritzungsBeschreibung = {
    ort: '.claude/settings.local.json',
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
   * **Ein Weg, nicht mehr zwei** (Paket D): der direkte Schreibvorgang nach
   * `<project>/.claude/settings.local.json`, die Datei, aus der Claude Code die
   * projektlokale MCP-Konfiguration wirklich liest.
   *
   * Zwei weitere Wege standen hier einmal und stehen es nicht mehr, beide aus demselben
   * Grund — ein Geheimnis an einen Ort schreiben, der es nicht braucht:
   * - `claude mcp add-json` (bis Paket D): die Serverkonfiguration ging als
   *   Kommandozeilenargument mit, also in die Prozesstabelle, und Claude Code schrieb sie
   *   zusaetzlich in `~/.claude.json`. Solange sie einen Bearer trug, war das ein dritter
   *   Ort — und der einzige, den keine Ruecknahme erreichen konnte.
   * - `~/.claude/projects/<hash>/settings.json` (bis zum Sicherheitsreview 2026-08-30): dort
   *   liegen Sitzungsmitschriften, Claude Code liest von da gar keine Einstellungen. Ein
   *   Geheimnis auf Platte ohne jeden Leser.
   *
   * Seit Paket D ist ohnehin kein Geheimnis mehr im Spiel: der Eintrag nennt einen
   * Startbefehl fuer die stdio-Bruecke (`ctx.mcpBruecke`), keinen Bearer. Was diese Funktion
   * offenlegt, ist ein Pfad — und wer den erreichen darf, entscheidet das Sandkastenprofil.
   *
   * Return value (added for the I-1 follow-up, security review 2026-08-30; widened from
   * `void` to `boolean` in the follow-up review of 4358cac): moving this call ahead of
   * `tmux.createSession` closed the race but opened a narrower gap the review caught — if
   * `createSession` now fails *after* this succeeds, an entry is left behind for a session
   * that never came to exist. The returned closure undoes exactly what the write above did,
   * and only that: it brings the `cipher-keel` ENTRY back to the state it had before this
   * call (deletes it if there was none, restores the prior value if there was one) — never a
   * blind delete. Seit Paket D deckt die Ruecknahme damit ALLES ab, was diese Funktion
   * geschrieben hat; solange es Pfad 2 gab, konnte sie das nicht behaupten.
   *
   * The entry, not the file. Three cases where the file does not return to its prior state:
   * it did not exist before (a `.claude/` directory and a `settings.local.json` holding
   * `{"mcpServers": {}}` stay behind); it held broken JSON (the injection write already
   * destroyed that content, and no rollback can bring it back); `mcpServers` was present but
   * not an object (replaced by `{}`, and `{}` is what stays). Keiner der drei Faelle laesst
   * etwas Vertrauliches zurueck — seit Paket D gilt das trivial, davor war es die Eigenschaft,
   * auf die es ankam — aber die Zusage dieser Closure gilt dem Eintrag.
   *
   * Why it reports a `boolean`: a rollback that quietly did nothing used to reach the user as
   * a rollback that worked. The return value means exactly one sentence and nothing wider:
   * **"settings.local.json traegt keinen Eintrag aus diesem Versuch mehr."** `true` when the
   * prior state was restored, when path 1 never wrote at all (then the sentence is trivially
   * true), or when the file is gone by the time the rollback runs. `false`, with a
   * `console.warn` naming the reason, when the file is no longer readable or no longer
   * carries an `mcpServers` object — in those cases the entry may still be sitting there and
   * nobody knows. A throwing `writeFileSync` propagates; the caller treats a throw as `false`.
   *
   * Why restore rather than delete: one socket is opened per app start and shared by every
   * session of a project, so the entry this call overwrote may be a sibling's, byte for byte
   * — bis Paket D galt derselbe Satz ueber einen Bearer je App-Start (B5), und er galt aus
   * demselben Grund. A blind delete would hit a sibling that has been injected but whose
   * `claude` process has NOT yet read the config (a concurrent `SESSION_CREATE`), and any
   * later restart of `claude` in an already-open pane. It would NOT hit an already-running
   * session: that process read its MCP config once, at its own start, and does not reload it —
   * the same fact the I-1 note above rests on.
   *
   * That fact is INFERRED, not observed, and it now carries weight in five files: it comes
   * from the CLI's documented behaviour and from the I-1 race (a late `add-json` never
   * surfaced in an already-open pane), but no run has yet changed the config under a live
   * session to watch it not react. Nothing load-bearing rests on the inference ALONE: reasons
   * 1 and 3 below stand without it, and the I-1 reordering is safe either way, because
   * injecting early is harmless if the CLI does reload. Measuring it is still owed.
   *
   * Hier stand bis Paket D ein langer Absatz darueber, warum Pfad 2 (`claude mcp add-json`)
   * bewusst NICHT zurueckgenommen wird — `claude mcp remove` kann nur loeschen, nie
   * wiederherstellen, und aus einer synchronen Closure heraus war ein sekundenlanger
   * CLI-Aufruf ohnehin nicht ausfuehrbar. Der Absatz ist gegenstandslos: es gibt Pfad 2 nicht
   * mehr, und damit auch keinen Rueckstand, der dem Aufrufer gemeldet werden muesste.
   *
   * Ein veralteter Eintrag ist seither nicht mehr wertlos, weil ein Schluessel rotiert, sondern
   * weil der Socketpfad bei jedem App-Start ein anderer ist (mcp-socket-pfad.ts). Die Wirkung
   * ist dieselbe, der Mechanismus ein anderer — und wer das eine fuer das andere haelt, sucht
   * einen rotierenden Schluessel, den es nicht gibt.
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<() => boolean> {
    // Ein stdio-Eintrag, kein http-Eintrag mit Bearer (Paket D). Warum ueberhaupt eine
    // Bruecke und nicht direkt eine Socket-URL: Claude Codes http-Transport nimmt keine.
    // Am 2026-08-31 gemessen, nicht angenommen — `unix://…` wird von `claude mcp add`
    // klaglos gespeichert und beim Verbinden abgewiesen: `ERR_INVALID_ARG_VALUE: protocol
    // must be http:, https: or s3:`. Der stdio-Transport startet dagegen jedes Programm.
    const mcpServerConfig = { ...ctx.mcpBruecke }

    // Path 1: Direct write to local settings.local.json — tracked so undoSettingsWrite can
    // put back exactly what was here before, not just delete what this call added.
    let undoSettingsWrite: (() => boolean) | null = null
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
        // that change.
        let current: Record<string, unknown>
        try {
          current = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
        } catch (err) {
          // ENOENT is the one read failure where the promised sentence is provably true: a
          // file that does not exist carries no entry from this call. Every other failure —
          // unreadable file, broken JSON, and broken JSON is the dangerous one, because a
          // half-written file can still hold the entry verbatim — leaves the entry possibly
          // in place, and until this fix round it left with a bare `return` that the caller
          // then reported as a successful rollback.
          if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return true
          console.warn(
            '[ClaudeCodeAdapter] rollback could not read settings.local.json — the ' +
            'cipher-keel entry may still be there:',
            err,
          )
          return false
        }
        if (!current.mcpServers || typeof current.mcpServers !== 'object') {
          // The file is readable and does not have the shape this rollback edits. Something
          // else rewrote it; whatever is in there now, this call cannot say the entry is gone.
          console.warn(
            '[ClaudeCodeAdapter] rollback found no mcpServers object in settings.local.json — ' +
            'leaving the file untouched; the cipher-keel entry may still be there',
          )
          return false
        }
        const currentServers = current.mcpServers as Record<string, unknown>
        if (hadEntryBefore) {
          currentServers['cipher-keel'] = previousEntry
        } else {
          delete currentServers['cipher-keel']
        }
        // Throws propagate to the caller, which treats a throw exactly like `false`.
        fs.writeFileSync(localSettingsPath, JSON.stringify(current, null, 2), 'utf-8')
        return true
      }
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] Local settings.local.json write failed:', err)
    }

    // Es gab hier bis Paket D einen zweiten Weg: `claude mcp remove` gefolgt von
    // `claude mcp add-json`, mit der Serverkonfiguration als KOMMANDOZEILENARGUMENT. Solange
    // diese Konfiguration einen Bearer trug, stand er damit in `ps`, sichtbar fuer jeden
    // Prozess desselben Nutzers — ein dritter Ort neben den beiden Dateien, und der einzige,
    // den keine Ruecknahme je erreichen konnte.
    //
    // Er faellt ersatzlos, und das macht die Einspritzung nicht aermer, sondern ehrlicher:
    // es gibt jetzt genau einen Weg, und der ist vollstaendig zuruecknehmbar. Der lange
    // Absatz oben ueber "Pfad 2 wird bewusst NICHT zurueckgenommen" ist damit gegenstandslos
    // und steht nicht mehr da.

    return () => {
      // No path-1 write happened at all (its own catch fired) — then the promised sentence
      // holds trivially: this call left no entry behind to take back.
      if (!undoSettingsWrite) return true
      return undoSettingsWrite()
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
