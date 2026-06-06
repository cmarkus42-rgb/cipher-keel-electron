/**
 * keep-working.ts — Persist and restore "keep-working" session state.
 *
 * CK-UI-032: After app restart, the project window shows a "Weiter arbeiten"
 * button if a previous state exists. This module handles the file-based
 * persistence of that state.
 *
 * Storage: <storeDir>/keep-working.json
 * Errors: corrupt / missing files return null — no crash.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const FILENAME = 'keep-working.json'
const LAYOUT_FILENAME = 'session-layout.json'

export interface KeepWorkingState {
  /** ID of the active project */
  projectId: string
  /** Last persisted timeline split percentage */
  timelinePct: number
  /** Last active kanban filter (serialisable subset of KanbanFilter) */
  kanbanFilter: Record<string, unknown>
  /** ISO timestamp of when this state was saved */
  timestamp: string
}

/**
 * Persists the keep-working state to <dir>/keep-working.json.
 */
export function saveKeepWorkingState(state: KeepWorkingState, dir: string): void {
  writeFileSync(join(dir, FILENAME), JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * Loads the keep-working state from <dir>/keep-working.json.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function loadKeepWorkingState(dir: string): KeepWorkingState | null {
  const path = join(dir, FILENAME)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as KeepWorkingState
  } catch {
    return null
  }
}

/**
 * Returns true if a keep-working state file exists in <dir>.
 * Used to decide whether to show the "Weiter arbeiten" button (CK-UI-032).
 */
export function hasKeepWorkingState(dir: string): boolean {
  return existsSync(join(dir, FILENAME))
}

// ---------------------------------------------------------------------------
// Session layout persistence
// ---------------------------------------------------------------------------

export interface SessionLayout {
  sessions: Array<{
    sessionId: string
    tmuxSession: string
    gridPosition: { col: number; row: number }
    entityId: string | null
  }>
  grid: { cols: number; rows: number }
  savedAt: string
}

/**
 * Persists the session layout to <dir>/session-layout.json.
 */
export function saveSessionLayout(layout: SessionLayout, dir: string): void {
  writeFileSync(join(dir, LAYOUT_FILENAME), JSON.stringify(layout, null, 2), 'utf-8')
}

/**
 * Loads the session layout from <dir>/session-layout.json.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function restoreSessionLayout(dir: string): SessionLayout | null {
  const path = join(dir, LAYOUT_FILENAME)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as SessionLayout
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Session snapshot persistence (CK-UI-032)
// ---------------------------------------------------------------------------

const SNAPSHOT_FILENAME = 'session-snapshot.json'

export interface SessionSnapshot {
  sessions: { presetId: string; name: string; gridPosition: number }[]
  gridConfig: { cols: number; rows: number }
  activeProject: string
}

/**
 * Persists the session snapshot to <dir>/session-snapshot.json.
 */
export function saveSessionSnapshot(snapshot: SessionSnapshot, dir: string): void {
  writeFileSync(join(dir, SNAPSHOT_FILENAME), JSON.stringify(snapshot, null, 2), 'utf-8')
}

/**
 * Loads the session snapshot from <dir>/session-snapshot.json.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function loadSessionSnapshot(dir: string): SessionSnapshot | null {
  const filePath = join(dir, SNAPSHOT_FILENAME)
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as SessionSnapshot
  } catch {
    return null
  }
}
