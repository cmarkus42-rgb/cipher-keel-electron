/**
 * tests/service-status.test.ts — Statustypen und typisierter Subsystem-Fehler.
 *
 * Loest Befund 2: Ein nicht initialisiertes Subsystem muss von einem leeren
 * Ergebnis unterscheidbar sein.
 */
import { describe, it, expect } from 'vitest'
import {
  SUBSYSTEM_IDS,
  SUBSYSTEM_UNAVAILABLE,
  subsystemError,
  isSubsystemError,
  type ServiceStatusMap,
} from '../src/shared/service-status'

describe('SUBSYSTEM_IDS', () => {
  it('covers exactly the six subsystems the lifecycle initializes', () => {
    expect([...SUBSYSTEM_IDS]).toEqual(['tmux', 'nanoclaw', 'voice', 'graph', 'kanban', 'notes'])
  })

  it('has no duplicates', () => {
    expect(new Set(SUBSYSTEM_IDS).size).toBe(SUBSYSTEM_IDS.length)
  })
})

describe('subsystemError', () => {
  it('carries the code, the subsystem and the reason', () => {
    const err = subsystemError('graph', 'Graph not initialized')

    expect(err.code).toBe(SUBSYSTEM_UNAVAILABLE)
    expect(err.subsystem).toBe('graph')
    expect(err.message).toBe('Graph not initialized')
  })
})

describe('isSubsystemError', () => {
  it('accepts a value built by subsystemError', () => {
    expect(isSubsystemError(subsystemError('kanban', 'Kanban not initialized'))).toBe(true)
  })

  it('rejects a plain empty array — the old silent-degradation shape', () => {
    expect(isSubsystemError([])).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isSubsystemError(null)).toBe(false)
    expect(isSubsystemError(undefined)).toBe(false)
  })

  it('rejects an object with a different code', () => {
    expect(isSubsystemError({ code: 'SOMETHING_ELSE', subsystem: 'graph', message: 'x' })).toBe(false)
  })
})

describe('ServiceStatusMap', () => {
  it('types a full map keyed by subsystem id', () => {
    const map: ServiceStatusMap = {
      tmux:     { id: 'tmux',     state: 'ready',    reason: null },
      nanoclaw: { id: 'nanoclaw', state: 'degraded', reason: 'socket not reachable' },
      voice:    { id: 'voice',    state: 'disabled', reason: 'disabled in config' },
      graph:    { id: 'graph',    state: 'ready',    reason: null },
      kanban:   { id: 'kanban',   state: 'ready',    reason: null },
      notes:    { id: 'notes',    state: 'ready',    reason: null },
    }

    expect(map.nanoclaw.state).toBe('degraded')
    expect(map.voice.reason).toBe('disabled in config')
  })
})
