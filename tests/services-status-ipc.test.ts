/**
 * tests/services-status-ipc.test.ts — Kanaldeklaration und Antwortformen fuer 6c.
 *
 * Befund 2 (verifiziert 2026-08-06): kanban:list lieferte [] — nicht unterscheidbar
 * von einem leeren Board.
 */
import { describe, it, expect } from 'vitest'
import {
  SERVICES_STATUS,
  SERVICES_STATUS_CHANGED,
  type RendererToMainChannel,
  type MainToRendererChannel,
} from '../src/shared/ipc-channels'
import { subsystemError, isSubsystemError } from '../src/shared/service-status'
import type { KanbanItem } from '../src/shared/kanban-types'

describe('service status channels', () => {
  it('declares services:status as a renderer→main channel', () => {
    const channel: RendererToMainChannel = SERVICES_STATUS
    expect(channel).toBe('services:status')
  })

  it('declares services:status-changed as a main→renderer channel', () => {
    const channel: MainToRendererChannel = SERVICES_STATUS_CHANGED
    expect(channel).toBe('services:status-changed')
  })
})

describe('kanban:list response shape', () => {
  interface KanbanListResult {
    items: KanbanItem[]
    error: ReturnType<typeof subsystemError> | null
  }

  it('distinguishes an empty board from an unavailable subsystem', () => {
    const emptyBoard: KanbanListResult = { items: [], error: null }
    const unavailable: KanbanListResult = {
      items: [],
      error: subsystemError('kanban', 'Kanban not initialized'),
    }

    expect(emptyBoard.items).toHaveLength(0)
    expect(unavailable.items).toHaveLength(0)
    expect(isSubsystemError(emptyBoard.error)).toBe(false)
    expect(isSubsystemError(unavailable.error)).toBe(true)
  })

  it('names the subsystem in the error so the StatusBar can attribute it', () => {
    const result: KanbanListResult = {
      items: [],
      error: subsystemError('kanban', 'graph unavailable'),
    }

    expect(result.error!.subsystem).toBe('kanban')
  })
})
