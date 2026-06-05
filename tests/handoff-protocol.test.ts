/**
 * Handoff protocol tests — Task 4 (PROC-011).
 * Tests: handoff_completeness query template.
 * A handoff is complete when the predecessor phase has:
 *   - at least one phasenoutput artefakt (traegt_phase + phasenoutput:true)
 *   - at least one anlass node (traegt_phase with kind=anlass)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery, QUERY_TEMPLATES } from '../src/main/graph/query'

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db?.open && db.close()
})

function makePhase(name: string, position: number) {
  return writer.upsertNode({
    kind: 'phase', title: name, path: `/phases/${name}`,
    frontmatter: { name, position, phase_status: 'ausstehend' }
  })
}

function linkPhases(srcUid: string, dstUid: string) {
  writer.linkEdge({ src: srcUid, dst: dstUid, type: 'naechste_phase', source: 'inferred' })
}

describe('handoff_completeness template (PROC-011)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('handoff_completeness')
  })

  it('reports complete when predecessor has phasenoutput artefakt and anlass', () => {
    const req = makePhase('requirements', 2)
    const arch = makePhase('architecture', 3)
    linkPhases(req.uid, arch.uid)

    const spec = writer.upsertNode({
      kind: 'artefakt', title: 'spec.md', path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })
    writer.linkEdge({ src: spec.uid, dst: req.uid, type: 'traegt_phase', source: 'inferred' })

    const session = writer.upsertNode({
      kind: 'anlass', title: 'Handoff Session', path: '/sessions/handoff.md',
      frontmatter: { session: 'sess-01', zeitpunkt: '2026-06-05T10:00:00Z' }
    })
    writer.linkEdge({ src: session.uid, dst: req.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, {
      template: 'handoff_completeness',
      params: { phase_name: 'architecture' }
    })

    expect(result.count).toBe(1)
    const row = result.rows[0]
    expect(row.predecessor_name).toBe('requirements')
    expect(Number(row.artefakt_count)).toBeGreaterThanOrEqual(1)
    expect(Number(row.anlass_count)).toBeGreaterThanOrEqual(1)
    expect(Number(row.is_complete)).toBe(1)
  })

  it('reports incomplete when predecessor has no phasenoutput artefakt', () => {
    const req = makePhase('requirements', 2)
    const arch = makePhase('architecture', 3)
    linkPhases(req.uid, arch.uid)

    // Only an anlass, no phasenoutput artefakt
    const session = writer.upsertNode({
      kind: 'anlass', title: 'Session', path: '/sessions/s1.md',
      frontmatter: { session: 'sess-01', zeitpunkt: '2026-06-05T10:00:00Z' }
    })
    writer.linkEdge({ src: session.uid, dst: req.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, {
      template: 'handoff_completeness',
      params: { phase_name: 'architecture' }
    })

    expect(result.count).toBe(1)
    expect(Number(result.rows[0].artefakt_count)).toBe(0)
    expect(Number(result.rows[0].is_complete)).toBe(0)
  })

  it('reports incomplete when predecessor has no anlass', () => {
    const req = makePhase('requirements', 2)
    const arch = makePhase('architecture', 3)
    linkPhases(req.uid, arch.uid)

    // Only a phasenoutput artefakt, no anlass
    const spec = writer.upsertNode({
      kind: 'artefakt', title: 'spec.md', path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })
    writer.linkEdge({ src: spec.uid, dst: req.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, {
      template: 'handoff_completeness',
      params: { phase_name: 'architecture' }
    })

    expect(result.count).toBe(1)
    expect(Number(result.rows[0].anlass_count)).toBe(0)
    expect(Number(result.rows[0].is_complete)).toBe(0)
  })

  it('returns empty rows for first phase (no predecessor)', () => {
    makePhase('ideation', 1)
    makePhase('requirements', 2)

    const result = graphQuery(db, {
      template: 'handoff_completeness',
      params: { phase_name: 'ideation' }
    })

    expect(result.count).toBe(0)
  })

  it('throws when phase_name is missing', () => {
    expect(() => graphQuery(db, {
      template: 'handoff_completeness',
      params: {}
    })).toThrow()
  })
})
