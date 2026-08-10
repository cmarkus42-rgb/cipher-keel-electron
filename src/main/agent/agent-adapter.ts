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
 */

import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../shared/types'

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

export interface AgentAdapter {
  readonly id: string
  readonly displayName: string
  readonly tier: 'tier-1' | 'tier-2'

  // --- lifecycle ---
  /** Build a structured launch command. Never returns a raw shell string. */
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand
  /** Optional post-launch setup (e.g. MCP server registration). */
  postLaunchInjection?(ctx: AdapterContext): Promise<void>

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
  /** Read context usage for a session. Only call if supports('status-line'). */
  getContextUsage?(sessionId: string): Promise<ContextUsage | null>
  /** Inject status reporting hook into project. Only call if supports('status-line'). */
  attachStatusHook?(projectPath: string): Promise<void>

  // --- prompt delivery ---
  /** Send a prompt into the agent's tmux pane. */
  sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void>

  // --- ENT-026: runtime interface ---
  /**
   * Check whether this adapter's runtime is reachable.
   * Must return boolean synchronously without changing state or starting I/O.
   * CK-ENT-026
   */
  isAvailable(): boolean

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

  // --- prompt fragments for workshop and launcher ---
  /** Agent-specific instructions injected into the workshop template. */
  buildWorkshopPromptFragment(lang: 'de' | 'en'): string
  /** Agent-specific launcher suffix (e.g. '/launch' for Claude Code). */
  buildLauncherPromptFragment(lang: 'de' | 'en'): string
  /** Agent-specific instructions injected into the Cyber Factory template. */
  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string
}
