/**
 * tests/status-bar-degradation.test.ts — Degradations-Zusammenfassung fuer die StatusBar.
 *
 * Nur reine Funktionen, kein React-Rendering — Stil wie tests/kickoff-wizard.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { summarizeDegradation } from '../src/renderer/components/StatusBar'
import type { ServiceStatusMap } from '../src/shared/service-status'

function statusMap(overrides: Partial<ServiceStatusMap> = {}): ServiceStatusMap {
  return {
    tmux:      { id: 'tmux',      state: 'ready', reason: null },
    claudeCli: { id: 'claudeCli', state: 'ready', reason: null },
    voice:     { id: 'voice',     state: 'ready', reason: null },
    graph:     { id: 'graph',     state: 'ready', reason: null },
    kanban:    { id: 'kanban',    state: 'ready', reason: null },
    notes:     { id: 'notes',     state: 'ready', reason: null },
    mcp:       { id: 'mcp',       state: 'ready', reason: null },
    ...overrides,
  }
}

describe('summarizeDegradation', () => {
  it('reports healthy when every subsystem is ready', () => {
    const summary = summarizeDegradation(statusMap())

    expect(summary.healthy).toBe(true)
    expect(summary.degraded).toEqual([])
    expect(summary.label).toBe('alle Subsysteme bereit')
  })

  it('lists a degraded subsystem', () => {
    const summary = summarizeDegradation(statusMap({
      graph: { id: 'graph', state: 'degraded', reason: 'ERR_DLOPEN_FAILED' },
    }))

    expect(summary.healthy).toBe(false)
    expect(summary.degraded.map(s => s.id)).toEqual(['graph'])
    expect(summary.label).toBe('1 Subsystem degradiert: graph')
  })

  it('lists several degraded subsystems in SUBSYSTEM_IDS order', () => {
    const summary = summarizeDegradation(statusMap({
      graph:  { id: 'graph',  state: 'degraded', reason: 'x' },
      kanban: { id: 'kanban', state: 'degraded', reason: 'y' },
      tmux:   { id: 'tmux',   state: 'degraded', reason: 'z' },
    }))

    expect(summary.degraded.map(s => s.id)).toEqual(['tmux', 'graph', 'kanban'])
    expect(summary.label).toBe('3 Subsysteme degradiert: tmux, graph, kanban')
  })

  it('does not count a disabled subsystem as degraded', () => {
    const summary = summarizeDegradation(statusMap({
      voice: { id: 'voice', state: 'disabled', reason: 'disabled in config' },
    }))

    expect(summary.healthy).toBe(true)
    expect(summary.degraded).toEqual([])
  })

  it('exposes the reason so it can be shown as a tooltip', () => {
    const summary = summarizeDegradation(statusMap({
      claudeCli: { id: 'claudeCli', state: 'degraded', reason: 'claude not on PATH' },
    }))

    expect(summary.degraded[0].reason).toBe('claude not on PATH')
  })

  it('treats a missing status map as unknown, not as healthy', () => {
    const summary = summarizeDegradation(null)

    expect(summary.healthy).toBe(false)
    expect(summary.label).toBe('Subsystem-Status unbekannt')
  })
})
