/**
 * Gate system tests — Tasks 1/2 (PROC-005, PROC-007, PROC-008).
 * Type-level: node/edge type definitions.
 * Query-level: gate_structural_coverage, gate_befunde_fuer_phase, gate_befunde_aggregiert.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery, QUERY_TEMPLATES } from '../src/main/graph/query'
import { autoGateBefund } from '../src/main/graph/phase-contract'
import {
  NODE_KINDS, isValidKind,
  REQUIRED_FRONTMATTER_FIELDS, ALLOWED_FRONTMATTER_FIELDS,
  type GateBefundAttrs
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES, isValidEdgeType, deriveEdgeType, validateEdgeForPair
} from '../src/main/graph/edge-types'

describe('gate_befund node type (PROC-005)', () => {
  it('gate_befund is a valid node kind', () => {
    expect(NODE_KINDS).toContain('gate_befund')
    expect(isValidKind('gate_befund')).toBe(true)
  })
  it('has required frontmatter fields', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS.gate_befund
    expect(req).toContain('phase_uid')
    expect(req).toContain('strukturell')
    expect(req).toContain('gate_typ')
  })
  it('has allowed frontmatter fields', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS.gate_befund
    expect(allowed).toContain('plausibilitaet')
    expect(allowed).toContain('gewichtung')
    expect(allowed).toContain('phase_uid')
    expect(allowed).toContain('strukturell')
    expect(allowed).toContain('gate_typ')
  })
})

describe('gate_fuer edge type (PROC-005)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('gate_fuer')
    expect(isValidEdgeType('gate_fuer')).toBe(true)
  })
  it('gate_befund->phase derives gate_fuer', () => {
    expect(deriveEdgeType('gate_befund', 'phase')).toBe('gate_fuer')
  })
  it('validates for gate_befund->phase', () => {
    expect(validateEdgeForPair('gate_fuer', 'gate_befund', 'phase')).toBeNull()
  })
  it('rejects non-phase destination', () => {
    expect(validateEdgeForPair('gate_fuer', 'gate_befund', 'anforderung')).not.toBeNull()
  })
})

describe('gate signals separate (PROC-007)', () => {
  it('strukturell and plausibilitaet are independent fields', () => {
    const befund: GateBefundAttrs = {
      phase_uid: 'uid', strukturell: 'gruen',
      plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
    }
    expect(befund.strukturell).toBe('gruen')
    expect(befund.plausibilitaet).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Query-level tests (require in-memory DB)
// ---------------------------------------------------------------------------

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

describe('gate_structural_coverage template (PROC-005, PROC-008)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('gate_structural_coverage')
  })

  it('counts covered and uncovered anforderungen for a phase', () => {
    const phase = makePhase('requirements', 2)

    const req1 = writer.upsertNode({
      kind: 'anforderung', title: 'REQ-001', path: '/req/001.md', frontmatter: {}
    })
    const req2 = writer.upsertNode({
      kind: 'anforderung', title: 'REQ-002', path: '/req/002.md', frontmatter: {}
    })
    const artefakt = writer.upsertNode({
      kind: 'artefakt', title: 'impl.ts', path: '/src/impl.ts', frontmatter: {}
    })

    // Both anforderungen belong to the phase
    writer.linkEdge({ src: req1.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })
    writer.linkEdge({ src: req2.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    // Only req1 is covered by a setzt_um edge
    writer.linkEdge({ src: artefakt.uid, dst: req1.uid, type: 'setzt_um', source: 'inferred' })

    const result = graphQuery(db, {
      template: 'gate_structural_coverage',
      params: { edge_type: 'setzt_um', phase_uid: phase.uid }
    })

    expect(result.count).toBe(1)
    const row = result.rows[0]
    expect(Number(row.total)).toBe(2)
    expect(Number(row.covered)).toBe(1)
    expect(Number(row.uncovered)).toBe(1)
  })

  it('returns 0 total when phase has no anforderungen', () => {
    const phase = makePhase('ideation', 1)

    const result = graphQuery(db, {
      template: 'gate_structural_coverage',
      params: { edge_type: 'setzt_um', phase_uid: phase.uid }
    })

    expect(result.count).toBe(1)
    expect(Number(result.rows[0].total)).toBe(0)
    expect(Number(result.rows[0].covered)).toBe(0)
  })

  it('throws when phase_uid is missing', () => {
    expect(() => graphQuery(db, {
      template: 'gate_structural_coverage',
      params: { edge_type: 'setzt_um' }
    })).toThrow()
  })
})

describe('gate_befunde_fuer_phase template (PROC-005)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('gate_befunde_fuer_phase')
  })

  it('returns all gate_befund nodes for a phase', () => {
    const phase = makePhase('requirements', 2)

    const befund = writer.upsertNode({
      kind: 'gate_befund', title: 'Gate REQ', path: '/gates/req.md',
      frontmatter: {
        phase_uid: phase.uid, strukturell: 'gruen',
        plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
      }
    })
    writer.linkEdge({ src: befund.uid, dst: phase.uid, type: 'gate_fuer', source: 'inferred' })

    const result = graphQuery(db, {
      template: 'gate_befunde_fuer_phase',
      params: { phase_uid: phase.uid }
    })

    expect(result.count).toBe(1)
    expect(result.rows[0].uid).toBe(befund.uid)
    const fm = JSON.parse(result.rows[0].frontmatter as string)
    expect(fm.strukturell).toBe('gruen')
  })

  it('returns empty when phase has no gate_befund nodes', () => {
    const phase = makePhase('ideation', 1)

    const result = graphQuery(db, {
      template: 'gate_befunde_fuer_phase',
      params: { phase_uid: phase.uid }
    })

    expect(result.count).toBe(0)
  })

  it('throws when phase_uid is missing', () => {
    expect(() => graphQuery(db, {
      template: 'gate_befunde_fuer_phase',
      params: {}
    })).toThrow()
  })
})

describe('gate_befunde_aggregiert template (PROC-005)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('gate_befunde_aggregiert')
  })

  it('returns one row per phase including phases with no befund', () => {
    makePhase('ideation', 1)
    const req = makePhase('requirements', 2)

    const befund = writer.upsertNode({
      kind: 'gate_befund', title: 'Gate REQ', path: '/gates/req.md',
      frontmatter: {
        phase_uid: req.uid, strukturell: 'gelb',
        plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
      }
    })
    writer.linkEdge({ src: befund.uid, dst: req.uid, type: 'gate_fuer', source: 'inferred' })

    const result = graphQuery(db, { template: 'gate_befunde_aggregiert' })

    expect(result.count).toBe(2)
    // ideation has no befund
    const ideationRow = result.rows.find(r => r.phase_name === 'ideation')
    expect(ideationRow).toBeDefined()
    expect(ideationRow!.befund_uid).toBeNull()

    // requirements has last befund
    const reqRow = result.rows.find(r => r.phase_name === 'requirements')
    expect(reqRow).toBeDefined()
    expect(reqRow!.befund_uid).toBe(befund.uid)
  })

  it('deduplicates: returns exactly one befund per phase when multiple exist', () => {
    const phase = makePhase('requirements', 2)

    const b1 = writer.upsertNode({
      kind: 'gate_befund', title: 'Gate A', path: '/gates/a.md',
      frontmatter: {
        phase_uid: phase.uid, strukturell: 'rot',
        plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
      }
    })
    writer.linkEdge({ src: b1.uid, dst: phase.uid, type: 'gate_fuer', source: 'inferred' })

    const b2 = writer.upsertNode({
      kind: 'gate_befund', title: 'Gate B', path: '/gates/b.md',
      frontmatter: {
        phase_uid: phase.uid, strukturell: 'gruen',
        plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
      }
    })
    writer.linkEdge({ src: b2.uid, dst: phase.uid, type: 'gate_fuer', source: 'inferred' })

    const result = graphQuery(db, { template: 'gate_befunde_aggregiert' })

    // Exactly one row per phase — deduplication is the key invariant
    const phaseRows = result.rows.filter(r => r.phase_name === 'requirements')
    expect(phaseRows).toHaveLength(1)
    // The returned befund is one of the two (not null)
    expect([b1.uid, b2.uid]).toContain(phaseRows[0].befund_uid)
  })
})

// ---------------------------------------------------------------------------
// autoGateBefund (CK-PROC-005)
// ---------------------------------------------------------------------------

describe('autoGateBefund (PROC-005)', () => {
  it('returns strukturell=gruen and writes befund when all anforderungen are covered', async () => {
    const phase = makePhase('requirements', 2)

    const req = writer.upsertNode({
      kind: 'anforderung', title: 'REQ-001', path: '/req/001.md', frontmatter: {}
    })
    writer.linkEdge({ src: req.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    const artefakt = writer.upsertNode({
      kind: 'artefakt', title: 'impl.ts', path: '/src/impl.ts', frontmatter: {}
    })
    writer.linkEdge({ src: artefakt.uid, dst: req.uid, type: 'setzt_um', source: 'inferred' })

    const attrs = await autoGateBefund(db, phase.uid, 'coverage')

    expect(attrs.strukturell).toBe('gruen')
    expect(attrs.gate_typ).toBe('coverage')
    expect(attrs.phase_uid).toBe(phase.uid)
    expect(attrs.plausibilitaet).toBeNull()

    // Verify the node was written to the DB with gate_fuer edge
    const befunde = graphQuery(db, {
      template: 'gate_befunde_fuer_phase',
      params: { phase_uid: phase.uid }
    })
    expect(befunde.count).toBe(1)
    const fm = JSON.parse(befunde.rows[0].frontmatter as string)
    expect(fm.strukturell).toBe('gruen')
    expect(fm.gate_typ).toBe('coverage')
  })

  it('returns strukturell=rot when no anforderungen are covered', async () => {
    const phase = makePhase('requirements', 2)

    const req = writer.upsertNode({
      kind: 'anforderung', title: 'REQ-001', path: '/req/001.md', frontmatter: {}
    })
    writer.linkEdge({ src: req.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })
    // No setzt_um edge — req is uncovered

    const attrs = await autoGateBefund(db, phase.uid, 'coverage')

    expect(attrs.strukturell).toBe('rot')

    const befunde = graphQuery(db, {
      template: 'gate_befunde_fuer_phase',
      params: { phase_uid: phase.uid }
    })
    expect(befunde.count).toBe(1)
  })

  it('returns strukturell=teilweise when some anforderungen are covered', async () => {
    const phase = makePhase('requirements', 2)

    const req1 = writer.upsertNode({
      kind: 'anforderung', title: 'REQ-001', path: '/req/001.md', frontmatter: {}
    })
    const req2 = writer.upsertNode({
      kind: 'anforderung', title: 'REQ-002', path: '/req/002.md', frontmatter: {}
    })
    writer.linkEdge({ src: req1.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })
    writer.linkEdge({ src: req2.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    const artefakt = writer.upsertNode({
      kind: 'artefakt', title: 'impl.ts', path: '/src/impl.ts', frontmatter: {}
    })
    writer.linkEdge({ src: artefakt.uid, dst: req1.uid, type: 'setzt_um', source: 'inferred' })
    // req2 remains uncovered

    const attrs = await autoGateBefund(db, phase.uid, 'coverage')

    expect(attrs.strukturell).toBe('teilweise')
  })

  it('returns strukturell=gruen when phase has no anforderungen', async () => {
    const phase = makePhase('ideation', 1)

    const attrs = await autoGateBefund(db, phase.uid, 'coverage')

    expect(attrs.strukturell).toBe('gruen')

    const befunde = graphQuery(db, {
      template: 'gate_befunde_fuer_phase',
      params: { phase_uid: phase.uid }
    })
    expect(befunde.count).toBe(1)
  })

  it('gate_befunde_aggregiert picks up the auto-written befund', async () => {
    makePhase('ideation', 1)
    const req = makePhase('requirements', 2)

    await autoGateBefund(db, req.uid, 'coverage')

    const result = graphQuery(db, { template: 'gate_befunde_aggregiert' })
    const reqRow = result.rows.find(r => r.phase_name === 'requirements')!
    expect(reqRow.befund_uid).not.toBeNull()
  })
})
