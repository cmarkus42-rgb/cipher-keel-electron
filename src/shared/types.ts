/**
 * Shared type definitions for cipher-keel-electron.
 *
 * Ported from cipher-mux 0.9.x, extended for cipher-keel-specific concepts.
 */

// --- Agent Adapter -----------------------------------------------------------

export type AdapterFeature =
  | 'mcp-injection'
  | 'status-line'
  | 'skip-permissions'
  | 'sub-agents'
  | 'project-instructions'
  | 'message-bus-participant'
  | 'companion-mcp'

export type AdapterCapabilities = Record<AdapterFeature, boolean>

// --- Context Usage -----------------------------------------------------------

export interface ContextUsage {
  usedPercentage: number
  remainingPercentage: number
  totalInputTokens: number
  totalOutputTokens: number
  contextWindowSize: number
  /** Estimated current context window tokens used (for UI display). */
  used?: number
  /** Context window capacity in tokens (alias for contextWindowSize). */
  total?: number
  modelId: string
  updatedAt: number
}

// --- Session -----------------------------------------------------------------

export interface SessionInfo {
  id: string
  name: string
  projectPath?: string
  tmuxSession?: string
  tmuxPane?: string
  status: 'active' | 'closing' | 'stopped' | 'orphaned'
  createdAt: number
  adapterId?: string
  capabilities?: AdapterCapabilities
  claudeSessionId?: string
}

export interface StartSessionOpts {
  name: string
  projectPath?: string
  command?: string
  env?: Record<string, string>
  autoLaunch?: boolean
  forkFromClaudeSessionId?: string
  model?: string
  width?: number
  height?: number
}

// --- Grid --------------------------------------------------------------------

export interface GridConfig {
  cols: number
  rows: number
}

export interface GridSlot {
  type: 'session' | 'launcher'
  sessionId?: string
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
}

export interface GridState {
  config: GridConfig
  slots: GridSlot[]
}
