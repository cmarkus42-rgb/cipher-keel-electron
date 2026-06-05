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
