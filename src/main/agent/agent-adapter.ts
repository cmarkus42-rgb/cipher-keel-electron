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
 * `SchleifenSitzungsAdapter` (keel's own in-process loop, arriving in a later task). Both grew
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
  /** Session ULID */
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
 * Wie eine Sitzung dieses Adapters existiert — und zugleich der Laeufer aus eignung.ts,
 * eingeengt auf die beiden Werte, die eine *ganze Sitzung* tragen. 'ein-schuss' verteilt
 * einen einzelnen Job und ist kein Sitzungstyp.
 *
 * Abgeleitet statt neu benannt: eine zweite Wortliste ('tmux' neben 'fremdes-cli') waere
 * dieselbe Unterscheidung unter zwei Namen, und nichts haette erzwungen, dass der
 * Zuordnungsplatz `sitzung:niveau-b` (model/slots.ts) und der Adapter, der ihn bedient,
 * denselben Wert meinen. Ueber `Extract` tun sie es per Typ: faellt drueben ein Name, faellt
 * hier der Compiler.
 */
export type Sitzungsart = Extract<Laeufer, 'fremdes-cli' | 'eigene-schleife'>

/** Was jeder Adapter ehrlich beantworten kann — unabhaengig davon, wie seine Sitzung laeuft. */
export interface AgentAdapterBasis {
  readonly id: string
  readonly displayName: string
  readonly tier: 'tier-1' | 'tier-2'

  /**
   * Capability niveau this adapter can serve (M2 section 11.3).
   *
   * Claude Code is the only harness with native SKILL.md lazy-loading, which is what
   * Niveau A assumes; every other adapter in the garden is B. The niveau is a property
   * of the harness, not a user preference.
   */
  readonly niveau: CapabilityNiveau

  readonly sitzungsart: Sitzungsart

  getProjectMarkers(): string[]
  readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null>
  supports(feature: AdapterFeature): boolean
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

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string
  buildLauncherPromptFragment(lang: 'de' | 'en'): string
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
  readonly sitzungsart: 'fremdes-cli'
  readonly appGesteuerteParameter?: readonly string[]
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand
  postLaunchInjection?(ctx: AdapterContext): Promise<void>
  getContextUsage?(sessionId: string): Promise<ContextUsage | null>
  attachStatusHook?(projectPath: string): Promise<void>
  sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void>
  executeCommand(command: string): Promise<string>
  streamOutput(sessionId: string): AsyncIterable<OutputEvent>
}

/** Die Teile des stabilen Praefix, die aus der Preset-Schicht kommen (harness-praefix-quelle.ts). */
export interface EntitaetsTeile {
  body: string
  persona: string
  capabilities: string
  globaleRegeln: string
}

export interface SchleifenStartOpts {
  /** Projektwurzel — zugleich die Grenze der Pfadwache des Laufs. */
  wurzel: string
  sitzungsname: string
  auftragstext: string
  /** Der Registry-Eintrag aus dem Zuordnungsplatz `sitzung:niveau-b`. */
  eintragId: string
  praefix: EntitaetsTeile
  /**
   * Der zuletzt in dieser Zelle gefahrene Lauf, oder null bei der ersten Beauftragung.
   * Ob daraus ein Folgeauftrag wird, entscheidet `weiterOderFrisch` (harness/fortsetzbarkeit.ts)
   * — nicht der Aufrufer: die Entscheidung braucht das Protokoll, und das kennt nur die
   * Lauf-Maschinerie.
   */
  letzteLaufId: string | null

  /**
   * Gerufen, sobald die laufId feststeht und **bevor** die Schleife anlaeuft — synchron, im
   * selben Zug. Der Aufrufer traegt sie damit in sein Register ein.
   *
   * Es gibt sie, weil die naheliegende Reihenfolge ein Rennen ist: `starteAuftrag` kehrt heim,
   * sobald das erste `run.started` geschrieben ist, und der Rest des Laufs faehrt im
   * Hintergrund weiter. Wer die laufId erst aus dem Rueckgabewert ins Register schriebe,
   * verloere gegen einen sehr kurzen Lauf — dessen `beiEnde` kippte die Zelle auf
   * `leerlaufend`, bevor sie je auf `laeuft` stand, und das nachfolgende `setzeLauf` liesse sie
   * fuer immer auf `laeuft` stehen.
   */
  beiStart?: (laufId: string) => void

  /**
   * Gerufen, wenn der Lauf endet — Erfolg, Fehler oder Abbruch. Die laufId kommt mit, damit der
   * Aufrufer pruefen kann, ob sie noch die aktuelle ist, statt eine fremde Zelle zu kippen.
   *
   * Der Aufrufer kippt damit den Zellenzustand: der Hauptprozess fuehrt ihn, nicht der Renderer.
   */
  beiEnde?: (laufId: string) => void
}

export interface SchleifenStartErgebnis {
  laufId: string
  /** Wahr, wenn der Auftrag in `letzteLaufId` weiterlief statt einen neuen Lauf zu oeffnen. */
  fortgesetzt: boolean
}

/** keels eigene Schleife im Hauptprozess. Kein Pane, kein Kommandozeilenaufruf. */
export interface SchleifenSitzungsAdapter extends AgentAdapterBasis {
  readonly sitzungsart: 'eigene-schleife'
  starteAuftrag(opts: SchleifenStartOpts): Promise<SchleifenStartErgebnis>
  /** Setzt die Abbruchmarke. Der Lauf endet am naechsten Zugrand, nicht sofort. */
  brichAb(laufId: string): void
}

export type AgentAdapter = CliSitzungsAdapter | SchleifenSitzungsAdapter

export function istSchleifenAdapter(a: AgentAdapter): a is SchleifenSitzungsAdapter {
  return a.sitzungsart === 'eigene-schleife'
}
