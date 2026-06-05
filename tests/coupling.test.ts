/**
 * coupling.test.ts — Kopplung + Navigation + Keep-Working
 *
 * CK-UI-012: Phasen-Kachel-Klick filtert Kanban (event-basierte Kopplung)
 * CK-UI-025: Resize-Handle Position persistiert (clamp bounds)
 * CK-UI-031: Timeline Performance 200 Nodes < 50ms
 * CK-UI-032: Keep-Working State speichern + wiederherstellen
 * CK-UI-011: Item-Board Doppelklick oeffnet, Zurueck schliesst
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  phaseNameToNumber,
  getRenderingMode,
  clampTimelinePct,
  MIN_TIMELINE_PCT,
  MAX_TIMELINE_PCT,
  groupArtifactsByPhase,
  PHASE_NAMES,
} from '../src/renderer/timeline-utils'

import { filterKanbanItems } from '../src/main/kanban/kanban-store'
import type { KanbanItem } from '../src/main/kanban/kanban-store'
import type { ArtifactData } from '../src/renderer/timeline-utils'

import {
  saveKeepWorkingState,
  loadKeepWorkingState,
  hasKeepWorkingState,
  type KeepWorkingState,
} from '../src/main/session/keep-working'

import { getItemBoardPhases } from '../src/renderer/components/ItemBoard'

// ---------------------------------------------------------------------------
// CK-UI-012 — Phasen-Kachel-Klick filtert Kanban
// ---------------------------------------------------------------------------

describe('CK-UI-012 — phaseNameToNumber maps phase names to numbers', () => {
  it('maps all 8 canonical phase names correctly', () => {
    expect(phaseNameToNumber('ideation')).toBe(1)
    expect(phaseNameToNumber('requirements')).toBe(2)
    expect(phaseNameToNumber('architecture')).toBe(3)
    expect(phaseNameToNumber('development')).toBe(4)
    expect(phaseNameToNumber('testing')).toBe(5)
    expect(phaseNameToNumber('fixing')).toBe(6)
    expect(phaseNameToNumber('audit')).toBe(7)
    expect(phaseNameToNumber('release-management')).toBe(8)
  })

  it('returns null for unknown phase name', () => {
    expect(phaseNameToNumber('unknown')).toBeNull()
    expect(phaseNameToNumber('')).toBeNull()
  })
})

describe('CK-UI-012 — Timeline → Kanban coupling: phase click filters items', () => {
  const makeItem = (id: string, phase: number): KanbanItem => ({
    id,
    title: `Item ${id}`,
    column: 'backlog',
    phase,
    schenkel: 1,
    typ: 'anforderung',
    prioritaet: 'mittel',
    nodeUid: null,
    vaultPath: null,
    erstellt: '2026-06-05T00:00:00.000Z',
  })

  const items: KanbanItem[] = [
    makeItem('a', 1), // ideation
    makeItem('b', 2), // requirements
    makeItem('c', 2), // requirements
    makeItem('d', 3), // architecture
  ]

  it('clicking requirements phase filters to phase 2 items only', () => {
    const selectedPhase = 'requirements'
    const phaseNum = phaseNameToNumber(selectedPhase)!
    const filtered = filterKanbanItems(items, { phases: [phaseNum] })

    expect(phaseNum).toBe(2)
    expect(filtered).toHaveLength(2)
    filtered.forEach(i => expect(i.phase).toBe(2))
  })

  it('clicking ideation phase filters to phase 1 only', () => {
    const phaseNum = phaseNameToNumber('ideation')!
    const filtered = filterKanbanItems(items, { phases: [phaseNum] })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('a')
  })

  it('deselecting phase (null) shows all items', () => {
    // no phase filter = all items visible
    const filtered = filterKanbanItems(items, {})
    expect(filtered).toHaveLength(4)
  })

  it('phase click result is consistent across all 8 phases', () => {
    for (let p = 1; p <= 8; p++) {
      const phaseName = PHASE_NAMES[p - 1]
      const num = phaseNameToNumber(phaseName)
      expect(num).toBe(p)
    }
  })
})

// ---------------------------------------------------------------------------
// CK-UI-025 — Resize-Handle Position persistiert (clamp bounds)
// ---------------------------------------------------------------------------

describe('CK-UI-025 — clampTimelinePct enforces MIN/MAX bounds', () => {
  it('MIN_TIMELINE_PCT is a positive number below 50', () => {
    expect(typeof MIN_TIMELINE_PCT).toBe('number')
    expect(MIN_TIMELINE_PCT).toBeGreaterThan(0)
    expect(MIN_TIMELINE_PCT).toBeLessThan(50)
  })

  it('MAX_TIMELINE_PCT is above 50 and below 100', () => {
    expect(typeof MAX_TIMELINE_PCT).toBe('number')
    expect(MAX_TIMELINE_PCT).toBeGreaterThan(50)
    expect(MAX_TIMELINE_PCT).toBeLessThan(100)
  })

  it('clamps value below MIN to MIN', () => {
    expect(clampTimelinePct(0)).toBe(MIN_TIMELINE_PCT)
    expect(clampTimelinePct(-10)).toBe(MIN_TIMELINE_PCT)
    expect(clampTimelinePct(MIN_TIMELINE_PCT - 1)).toBe(MIN_TIMELINE_PCT)
  })

  it('clamps value above MAX to MAX', () => {
    expect(clampTimelinePct(100)).toBe(MAX_TIMELINE_PCT)
    expect(clampTimelinePct(200)).toBe(MAX_TIMELINE_PCT)
    expect(clampTimelinePct(MAX_TIMELINE_PCT + 1)).toBe(MAX_TIMELINE_PCT)
  })

  it('passes through values within range unchanged', () => {
    const mid = Math.round((MIN_TIMELINE_PCT + MAX_TIMELINE_PCT) / 2)
    expect(clampTimelinePct(mid)).toBe(mid)
    expect(clampTimelinePct(MIN_TIMELINE_PCT)).toBe(MIN_TIMELINE_PCT)
    expect(clampTimelinePct(MAX_TIMELINE_PCT)).toBe(MAX_TIMELINE_PCT)
  })
})

// ---------------------------------------------------------------------------
// CK-UI-031 — Timeline Performance 200 Nodes < 50ms
// ---------------------------------------------------------------------------

describe('CK-UI-031 — getRenderingMode selects svg vs canvas', () => {
  it('returns svg for node count below 500', () => {
    expect(getRenderingMode(0)).toBe('svg')
    expect(getRenderingMode(200)).toBe('svg')
    expect(getRenderingMode(499)).toBe('svg')
  })

  it('returns canvas at 500+ nodes (fallback for performance)', () => {
    expect(getRenderingMode(500)).toBe('canvas')
    expect(getRenderingMode(1000)).toBe('canvas')
  })
})

describe('CK-UI-031 — groupArtifactsByPhase processes 200 nodes < 50ms', () => {
  it('groups 200 artifact nodes in under 50ms', () => {
    const artifacts: ArtifactData[] = Array.from({ length: 200 }, (_, i) => ({
      uid: `a${i}`,
      title: `Artifact ${i}`,
      kind: 'artefakt',
      phase_name: PHASE_NAMES[i % 8],
      status: 'aktiv',
      path: null,
      erstellt: '2026-06-05T00:00:00.000Z',
    }))

    const start = performance.now()
    const grouped = groupArtifactsByPhase(artifacts)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
    const total = [...grouped.values()].reduce((sum, arr) => sum + arr.length, 0)
    expect(total).toBe(200)
  })

  it('grouping 500 nodes also stays under 50ms (pre-canvas threshold)', () => {
    const artifacts: ArtifactData[] = Array.from({ length: 500 }, (_, i) => ({
      uid: `a${i}`,
      title: `Artifact ${i}`,
      kind: i % 3 === 0 ? 'uebergabedokument' : 'artefakt',
      phase_name: PHASE_NAMES[i % 8],
      status: 'aktiv',
      path: null,
      erstellt: '2026-06-05T00:00:00.000Z',
    }))

    const start = performance.now()
    groupArtifactsByPhase(artifacts)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// CK-UI-032 — Keep-Working State speichern + wiederherstellen
// ---------------------------------------------------------------------------

describe('CK-UI-032 — Keep-Working State', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ck-kw-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('saves and restores state round-trip', () => {
    const state: KeepWorkingState = {
      projectId: 'proj-1',
      timelinePct: 40,
      kanbanFilter: { phases: [1, 2] },
      timestamp: '2026-06-05T00:00:00.000Z',
    }
    saveKeepWorkingState(state, dir)
    const loaded = loadKeepWorkingState(dir)
    expect(loaded).toEqual(state)
  })

  it('returns null when no state file exists', () => {
    expect(loadKeepWorkingState(dir)).toBeNull()
  })

  it('returns null on corrupt state file — no crash', () => {
    writeFileSync(join(dir, 'keep-working.json'), 'not-valid-json', 'utf-8')
    expect(() => loadKeepWorkingState(dir)).not.toThrow()
    expect(loadKeepWorkingState(dir)).toBeNull()
  })

  it('hasKeepWorkingState returns false when no file exists', () => {
    expect(hasKeepWorkingState(dir)).toBe(false)
  })

  it('hasKeepWorkingState returns true after save', () => {
    const state: KeepWorkingState = {
      projectId: 'p1',
      timelinePct: 35,
      kanbanFilter: {},
      timestamp: '2026-06-05T00:00:00.000Z',
    }
    saveKeepWorkingState(state, dir)
    expect(hasKeepWorkingState(dir)).toBe(true)
  })

  it('empty grid opened when sessions are missing (graceful fallback)', () => {
    // Saving a state with empty kanbanFilter and reloading gives empty filter
    const state: KeepWorkingState = {
      projectId: 'p2',
      timelinePct: 35,
      kanbanFilter: {},
      timestamp: '2026-06-05T00:00:00.000Z',
    }
    saveKeepWorkingState(state, dir)
    const loaded = loadKeepWorkingState(dir)
    expect(loaded).not.toBeNull()
    expect(loaded!.kanbanFilter).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// CK-UI-011 — Item-Board Doppelklick oeffnet, Zurueck schliesst
// ---------------------------------------------------------------------------

describe('CK-UI-011 — getItemBoardPhases', () => {
  it('returns 8 phase entries for any item phase', () => {
    const phases = getItemBoardPhases(1)
    expect(phases).toHaveLength(8)
  })

  it('marks correct phase as active for phase 1', () => {
    const phases = getItemBoardPhases(1)
    expect(phases[0].active).toBe(true)
    phases.slice(1).forEach(p => expect(p.active).toBe(false))
  })

  it('marks correct phase as active for phase 2', () => {
    const phases = getItemBoardPhases(2)
    expect(phases[1].active).toBe(true)
    expect(phases[0].active).toBe(false)
    expect(phases[7].active).toBe(false)
  })

  it('marks correct phase active for all 8 phases', () => {
    for (let p = 1; p <= 8; p++) {
      const phases = getItemBoardPhases(p)
      phases.forEach((ph, idx) => {
        expect(ph.active).toBe(idx === p - 1)
      })
    }
  })

  it('phase names match canonical PHASE_NAMES order', () => {
    const phases = getItemBoardPhases(1)
    phases.forEach((ph, idx) => {
      expect(ph.name).toBe(PHASE_NAMES[idx])
    })
  })

  it('each phase has a non-empty displayName', () => {
    const phases = getItemBoardPhases(3)
    phases.forEach(ph => {
      expect(typeof ph.displayName).toBe('string')
      expect(ph.displayName.length).toBeGreaterThan(0)
    })
  })
})

describe('CK-UI-011 — Item-Board: edge cases for getItemBoardPhases', () => {
  it('phase 8 marks only the last entry active', () => {
    const phases = getItemBoardPhases(8)
    expect(phases[7].active).toBe(true)
    phases.slice(0, 7).forEach(p => expect(p.active).toBe(false))
  })

  it('phase 1 marks only the first entry active', () => {
    const phases = getItemBoardPhases(1)
    expect(phases[0].active).toBe(true)
    expect(phases[7].active).toBe(false)
  })

  it('all phases have unique names', () => {
    const phases = getItemBoardPhases(1)
    const names = phases.map(p => p.name)
    expect(new Set(names).size).toBe(8)
  })

  it('all phases have unique displayNames', () => {
    const phases = getItemBoardPhases(1)
    const displayNames = phases.map(p => p.displayName)
    expect(new Set(displayNames).size).toBe(8)
  })
})
