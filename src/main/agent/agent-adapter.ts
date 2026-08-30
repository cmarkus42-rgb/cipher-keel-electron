/**
 * AgentAdapter — abstraction over Coding-Agent CLIs.
 *
 * Every agent is represented by an adapter that knows:
 *   - how to spawn a session in a tmux pane
 *   - whether and how it supports MCP configuration injection
 *   - whether and how it reports context/token usage
 *   - which project-marker file it recognizes
 *
 * Adapters declare their capabilities via `supports(...)`. The UI and
 * orchestration layers MUST check capabilities before using optional
 * features.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-004).
 *
 * As of the harness stretch (2026-08-23) `AgentAdapter` is no longer a single interface: it
 * is a union of `CliSitzungsAdapter` (a tmux pane and a command line — Claude Code today) and
 * `SchleifenSitzungsAdapter` (keel's own in-process loop — built in this same stretch as the
 * `keel-harness` adapter, agent/adapters/keel-harness.ts). Both grew
 * out of the same tmux-shaped interface, which is why every field that once lived on it now
 * has to justify which side it belongs to: `buildLaunchCommand`/`executeCommand`/`streamOutput`
 * describe a pane, `starteAuftrag`/`brichAb` describe a loop with no pane at all. Folding both
 * into one interface again would let a caller invoke a pane-only method on a loop-only adapter
 * and find out at runtime instead of at compile time — the split exists so that mistake cannot
 * compile.
 */

import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../shared/types'
import type { CapabilityNiveau } from '../preset/niveau'
import type { Laeufer } from '../model/eignung'

export type { AdapterFeature, AdapterCapabilities }

export interface LaunchCommand {
  /** Executable name, e.g. 'claude' */
  cmd: string
  /** Arguments array — NOT a shell string. Prevents shell injection. */
  args: string[]
  /** Extra env vars to set for this session */
  envOverrides?: Record<string, string>
  /**
   * Sentences about THIS launch that a human should see — not errors, not log lines: things
   * the adapter decided or knows about the session it is about to hand back, which nobody
   * else can know. `KimiCodeAdapter` uses it for the two cases its harness has and Claude
   * Code does not: a resolved `opts.model` it deliberately does not pass on, and the trust
   * prompt a project-local MCP server triggers.
   *
   * It rides on `LaunchCommand` rather than on a channel of its own because
   * `SESSION_CREATE` (ipc-handlers.ts) already collects exactly such sentences — the tier
   * note and the MCP note — joins them and returns them to the renderer as `hinweis`. A
   * second channel would be a second place a session note can hide.
   *
   * Optional and unset by `ClaudeCodeAdapter`: it has nothing of this kind to say, and an
   * empty array from every adapter that does not use the field would read as if it did.
   */
  hinweise?: readonly string[]
}

export interface LaunchOpts {
  /** Absolute path to the project directory */
  projectPath: string
  /** Session display name */
  sessionName: string
  /** Whether this is a workshop session */
  isWorkshop?: boolean
  /** Whether this is a Cyber Factory session */
  isCyberFactory?: boolean
  /** Fork from an existing Claude session (--fork-session <id>) */
  forkFromClaudeSessionId?: string
  /** Resume the most recent conversation (--resume) */
  resume?: boolean
  /**
   * Resume one NAMED earlier conversation of the harness (Kimi Code: `-S <id>`; Claude
   * Code's counterpart would be `--resume <id>`).
   *
   * Separate from `resume` because that one is a boolean and cannot carry an id, and
   * separate from `forkFromClaudeSessionId` because resuming continues a conversation while
   * forking branches it — Kimi Code has the first and no equivalent of the second.
   * `ClaudeCodeAdapter` does not read this field: its boolean `resume` covers the only case
   * that is wired today, and reading it there would change a launch line no caller asks for.
   */
  resumeSessionId?: string
  /** Model override (e.g. 'haiku', 'sonnet', 'opus') — passed as --model <id> */
  model?: string
  /**
   * Path to a file whose content is appended to the agent's system prompt.
   * Carries the assembled entity prompt. Claude Code: --append-system-prompt-file.
   */
  appendSystemPromptFile?: string
}

export interface AdapterContext {
  /** Absolute path to the project directory */
  projectPath: string
  /** MCP server URL (full, including /mcp path) */
  mcpUrl: string
  /** MCP auth key */
  mcpApiKey: string
  /**
   * The session's chosen name. Not a runtime-assigned id and not a ULID (nothing in this
   * codebase mints one for a session) — `postLaunchInjection` runs before
   * `tmux.createSession` returns one (security review finding I-1, 2026-08-30), so this is
   * whatever the caller already knows at that point. `ClaudeCodeAdapter.postLaunchInjection`,
   * the sole implementation today, does not read this field at all; kept on the contract in
   * case a future write path needs to key by session.
   */
  sessionId: string
}

export interface ProjectInstructions {
  /** Raw content of the project instructions file */
  content: string
  /** Absolute path to the file */
  filePath: string
}

export interface SendOpts {
  /** Whether to append a newline */
  newline?: boolean
}

/** Output event emitted by streamOutput(). CK-ENT-026 */
export interface OutputEvent {
  type: 'text' | 'error' | 'done'
  content: string
}

/**
 * How a session of this adapter exists — and at the same time the Laeufer from eignung.ts,
 * narrowed to the two values that carry a *whole session*. 'ein-schuss' dispatches a single
 * job and is not a session type.
 *
 * Derived rather than renamed: a second word list ('tmux' next to 'fremdes-cli', which is
 * what this field used to be before it was aligned with Laeufer) would be the same
 * distinction under two names, and nothing would have forced the `sitzung:niveau-b`
 * assignment slot (model/slots.ts) and the adapter serving it to mean the same value.
 * Via `Extract` they do so by type: if a name changes over there, the compiler catches it
 * here.
 */
export type Sitzungsart = Extract<Laeufer, 'fremdes-cli' | 'eigene-schleife'>

/**
 * The two Sitzungsarten as values, so a concrete adapter can **assign** one without writing
 * the Laeufer literal itself.
 *
 * Without them every adapter would have to join the exemption list in
 * tests/model/eignung-einzige-quelle.test.ts — and a list that grows with every new file of
 * its kind stops guarding anything before long. This way the list stays at three entries
 * (eignung.ts, slots.ts, this file) no matter how many adapters still arrive.
 */
export const SITZUNG_FREMDES_CLI = 'fremdes-cli' as const
export const SITZUNG_EIGENE_SCHLEIFE = 'eigene-schleife' as const

/** What every adapter can answer honestly, regardless of how its session runs. */
export interface AgentAdapterBasis {
  readonly id: string
  readonly displayName: string
  readonly tier: 'tier-1' | 'tier-2'

  /**
   * Capability niveau this adapter can serve (M2 section 11.3).
   *
   * Claude Code is the only harness with native SKILL.md lazy-loading, which is what
   * Niveau A assumes; every other adapter in the garden is B. The niveau is a property
   * of the harness, not a user preference — a harness that cannot resolve @-references
   * does not become able to by being asked nicely.
   */
  readonly niveau: CapabilityNiveau

  readonly sitzungsart: Sitzungsart

  // --- project awareness ---
  /** Filenames/dirs this agent recognizes as project markers. */
  getProjectMarkers(): string[]
  /** Read the agent's project instructions file (e.g. CLAUDE.md). */
  readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null>

  // --- runtime signals (capability-gated) ---
  /** Check if the adapter supports a specific feature. */
  supports(feature: AdapterFeature): boolean
  /** Get all capabilities as a record. */
  getCapabilities(): AdapterCapabilities

  /**
   * Check whether this adapter's runtime is reachable.
   * Must return boolean synchronously without changing state or starting I/O.
   * CK-ENT-026
   */
  isAvailable(): boolean

  /**
   * German, non-null exactly when isAvailable() is false: why this adapter cannot run.
   *
   * It lives here because the adapter knows the reason and the caller does not.
   * SESSION_CREATE used to build that text itself with
   * `adapter.id === 'claude-code' ? describeMissingTool('claude') : <generic>` — a special
   * case in the one place that had the least information about it.
   */
  nichtVerfuegbarGrund(): string | null

  // --- prompt fragments for workshop and launcher ---
  /** Agent-specific instructions injected into the workshop template. */
  buildWorkshopPromptFragment(lang: 'de' | 'en'): string
  /** Agent-specific launcher suffix (e.g. '/launch' for Claude Code). */
  buildLauncherPromptFragment(lang: 'de' | 'en'): string
  /** Agent-specific instructions injected into the Cyber Factory template. */
  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string
}

/**
 * A harness that runs as its own process in a tmux pane. Everything here is about a command
 * line and a pane: an in-process loop has no honest answer to any of it.
 *
 * `executeCommand`/`streamOutput` (CK-ENT-026) sit here rather than on the base because both
 * already throw in the only adapter that has them, pointing at SessionManager and the tmux
 * output batcher respectively — they describe exactly the separation this union now carries.
 */
export interface CliSitzungsAdapter extends AgentAdapterBasis {
  readonly sitzungsart: typeof SITZUNG_FREMDES_CLI

  /**
   * Parameters this adapter appends from its own logic. The settings surface warns when a
   * user types one of them into the free-text start parameters, because it would then
   * appear twice on the command line. Named here rather than in the surface so that the
   * adapter which adds them is also the one that names them.
   */
  readonly appGesteuerteParameter?: readonly string[]

  // --- lifecycle ---
  /** Build a structured launch command. Never returns a raw shell string. */
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand
  /**
   * Optional post-launch setup (e.g. MCP server registration). Runs before the session's
   * process is spawned, not after — see ClaudeCodeAdapter's doc comment on its own
   * implementation for why (security review finding I-1, 2026-08-30: the process reads its
   * config once, at its own start).
   *
   * Returns an undo closure rather than void (I-1 follow-up, same review): if the caller's
   * next step (spawning the session) fails, whatever this call wrote may now be a live
   * credential with no session behind it. The closure reverts exactly what this call itself
   * changed — never a blind wipe, since a merge-based injection may share state with a
   * sibling session that has been injected but has not yet read the config, or with a later
   * restart of the same process in an existing pane.
   *
   * The closure's `boolean` (widened from `void` in the follow-up review of 4358cac) means
   * exactly one sentence and nothing wider: **"die von dieser Methode geschriebene
   * Konfiguration traegt keinen Eintrag aus diesem Versuch mehr."** `true` also covers the
   * trivial cases — nothing was written, or the target is gone. `false` means the closure
   * could not establish that, and something may still be lying there; it must say why on the
   * console. A throw counts as `false` for the caller. An adapter with nothing to undo may
   * return a no-op that returns `true`.
   */
  postLaunchInjection?(ctx: AdapterContext): Promise<() => boolean>
  /** Read context usage for a session. Only call if supports('status-line'). */
  getContextUsage?(sessionId: string): Promise<ContextUsage | null>
  /** Inject status reporting hook into project. Only call if supports('status-line'). */
  attachStatusHook?(projectPath: string): Promise<void>

  // --- prompt delivery ---
  /** Send a prompt into the agent's tmux pane. */
  sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void>

  /**
   * Send a command to the runtime and return the response as a string.
   * Adapters that use a separate delivery mechanism (e.g. SessionManager)
   * should throw a descriptive error here. CK-ENT-026
   */
  executeCommand(command: string): Promise<string>

  /**
   * Yield output events from the runtime for the given session.
   * Adapters that capture output via other means (e.g. tmux) should throw. CK-ENT-026
   */
  streamOutput(sessionId: string): AsyncIterable<OutputEvent>
}

/** The parts of the stable prefix that come from the preset layer (harness-praefix-quelle.ts). */
export interface EntitaetsTeile {
  body: string
  persona: string
  capabilities: string
  globaleRegeln: string
}

export interface SchleifenStartOpts {
  /** Project root — also the boundary of the run's path guard. */
  wurzel: string
  sitzungsname: string
  auftragstext: string
  /** The registry entry from the `sitzung:niveau-b` assignment slot. */
  eintragId: string
  praefix: EntitaetsTeile
  /**
   * The most recent run in this cell, or null on the first assignment. Whether this
   * becomes a follow-up job is decided by `weiterOderFrisch` (harness/fortsetzbarkeit.ts)
   * — not the caller: that decision needs the run log, which only the run machinery knows.
   */
  letzteLaufId: string | null

  /**
   * Called once the laufId is fixed and **before** the loop's first turn actually starts,
   * with no `await` between this call and the call that starts the loop. This is how the
   * caller records the laufId in its own registry before anything could end the run.
   *
   * **What this does not guarantee: the same tick as the laufId being decided.** In
   * `beauftrageSchleife`'s follow-up-job branch (harness-sitzung.ts) the laufId is fixed
   * before `await baueLaufUmgebung(...)`, and `beiStart` only fires after that await
   * resolves — a real await sits between "laufId known" and "caller told". An earlier version
   * of this comment claimed "synchronously, in the same tick" for both; that was the reason a
   * TOCTOU gap in the `frisch` branch (no guard analogous to the `weiter` branch's
   * `pruefeLaufLaeuftNicht`) was plausible to miss on read. See the open finding in
   * `docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md`
   * ("Offener Befund aus dem Lesen des Codes — ausdruecklich ohne Feldbeleg").
   *
   * It exists because the obvious ordering is a race: `starteAuftrag` returns home as soon
   * as the first `run.started` is written, and the rest of the run continues in the
   * background. Whoever only wrote the laufId into their registry from the return value
   * would lose against a very short run — its `beiEnde` would flip the cell to
   * `leerlaufend` before it had ever been `laeuft`, and the subsequent `setzeLauf` would
   * leave it stuck on `laeuft` forever.
   */
  beiStart?: (laufId: string) => void

  /**
   * Called when the run ends — success, failure, or abort. The laufId comes along so the
   * caller can check whether it is still the current one, instead of flipping a stale cell.
   *
   * This is how the caller flips the cell state: the main process drives it, not the renderer.
   */
  beiEnde?: (laufId: string) => void
}

export interface SchleifenStartErgebnis {
  laufId: string
  /** True if the job continued in `letzteLaufId` instead of opening a new run. */
  fortgesetzt: boolean
}

/** keel's own loop in the main process. No pane, no command-line invocation. */
export interface SchleifenSitzungsAdapter extends AgentAdapterBasis {
  readonly sitzungsart: typeof SITZUNG_EIGENE_SCHLEIFE
  starteAuftrag(opts: SchleifenStartOpts): Promise<SchleifenStartErgebnis>
  /** Sets the abort flag. The run ends at the next turn boundary, not immediately. */
  brichAb(laufId: string): void
}

export type AgentAdapter = CliSitzungsAdapter | SchleifenSitzungsAdapter

export function istSchleifenAdapter(a: AgentAdapter): a is SchleifenSitzungsAdapter {
  return a.sitzungsart === SITZUNG_EIGENE_SCHLEIFE
}
