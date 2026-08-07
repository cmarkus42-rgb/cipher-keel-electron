/**
 * tests/project-view-degradation.test.ts — degradation banner text for ProjectView (F-1).
 *
 * Befund (F-1): ProjectView destructured neither useKanban().error nor
 * useTimeline().error, and the project window rendered no StatusBar — so with the
 * graph degraded, the user saw an empty Timeline and an empty KanbanBoard with no
 * indication. degradationBanner is the pure text-building piece of that fix; no
 * React rendering, no IPC — same style as tests/status-bar-degradation.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { degradationBanner } from '../src/renderer/components/ProjectView'
import { subsystemError } from '../src/shared/service-status'

describe('degradationBanner', () => {
  it('returns null when there is no error', () => {
    expect(degradationBanner('Kanban nicht verfügbar', null)).toBeNull()
  })

  it('formats a plain string error', () => {
    expect(degradationBanner('Zeitstrahl nicht verfügbar', 'Graph not initialized'))
      .toBe('Zeitstrahl nicht verfügbar: Graph not initialized')
  })

  it('formats a SubsystemError via errorMessage', () => {
    const err = subsystemError('kanban', 'Kanban store not initialized')
    expect(degradationBanner('Kanban nicht verfügbar', err))
      .toBe('Kanban nicht verfügbar: Kanban store not initialized')
  })

  it('falls back to a sensible default for an error without a usable message', () => {
    expect(degradationBanner('Kanban nicht verfügbar', { foo: 'bar' }))
      .toBe('Kanban nicht verfügbar: Unbekannter Fehler')
  })

  it('does not render for an empty string (falsy) error', () => {
    // Distinguishes "no error" from "an error occurred but had nothing to say" —
    // the latter cannot happen upstream today, but the guard exists so a banner
    // is never rendered with an empty label-only string.
    expect(degradationBanner('Kanban nicht verfügbar', '')).toBeNull()
  })
})
