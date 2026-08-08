/**
 * Subsystem edge type + attrs type-level tests — Task 5 (PROC-009).
 * Query tests for subsystem_list, subsystem_dependencies, quereinstieg_eignung — Task 6.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery, QUERY_TEMPLATES } from '../src/main/graph/query'
import {
  ALLOWED_FRONTMATTER_FIELDS,
  type PhaseSubsystemAttrs
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES, isValidEdgeType, validateEdgeForPair
} from '../src/main/graph/edge-types'

describe('subsystem_von edge type (PROC-009)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('subsystem_von')
    expect(isValidEdgeType('subsystem_von')).toBe(true)
  })
  it('validates for phase_subsystem->phase_subsystem', () => {
    expect(validateEdgeForPair('subsystem_von', 'phase_subsystem', 'phase_subsystem')).toBeNull()
  })
  it('rejects non-subsystem destination', () => {
    expect(validateEdgeForPair('subsystem_von', 'phase_subsystem', 'phase')).not.toBeNull()
  })
})

describe('haengt_ab_von edge type (PROC-009)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('haengt_ab_von')
    expect(isValidEdgeType('haengt_ab_von')).toBe(true)
  })
  it('validates for phase_subsystem->phase_subsystem', () => {
    expect(validateEdgeForPair('haengt_ab_von', 'phase_subsystem', 'phase_subsystem')).toBeNull()
  })
  it('rejects non-subsystem destination', () => {
    expect(validateEdgeForPair('haengt_ab_von', 'phase_subsystem', 'phase')).not.toBeNull()
  })
})

describe('PhaseSubsystemAttrs extensions (PROC-009)', () => {
  it('scope, status, blocked_grund are in ALLOWED_FRONTMATTER_FIELDS.phase_subsystem', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS.phase_subsystem
    expect(allowed).toContain('scope')
    expect(allowed).toContain('status')
    expect(allowed).toContain('blocked_grund')
  })

  it('PhaseSubsystemAttrs accepts scope, status, blocked_grund', () => {
    const attrs: PhaseSubsystemAttrs = {
      ebene: 'top',
      scope: 'backend',
      status: 'aktiv',
      blocked_grund: 'missing dependency'
    }
    expect(attrs.scope).toBe('backend')
    expect(attrs.status).toBe('aktiv')
    expect(attrs.blocked_grund).toBe('missing dependency')
  })

  it('PhaseSubsystemAttrs is valid without new optional fields', () => {
    const attrs: PhaseSubsystemAttrs = { ebene: 'component' }
    expect(attrs.scope).toBeUndefined()
    expect(attrs.blocked_grund).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Query-level tests (in-memory DB)
// ---------------------------------------------------------------------------

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  if (db?.open) db.close()
})

function makeSubsystem(title: string, opts: { scope?: string; status?: string; blocked_grund?: string } = {}) {
  return writer.upsertNode({
    kind: 'phase_subsystem',
    title,
    path: `/subsystems/${title}`,
    frontmatter: { ebene: 'top', ...opts }
  })
}

function makePhase(name: string, position: number) {
  return writer.upsertNode({
    kind: 'phase', title: name, path: `/phases/${name}`,
    frontmatter: { name, position, phase_status: 'ausstehend' }
  })
}

describe('subsystem_list template (PROC-009)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('subsystem_list')
  })

  it('returns all phase_subsystem nodes with frontmatter fields', () => {
    makeSubsystem('backend', { scope: 'api', status: 'aktiv', blocked_grund: undefined })
    makeSubsystem('frontend', { scope: 'ui', status: 'blocked', blocked_grund: 'missing design' })

    const result = graphQuery(db, { template: 'subsystem_list' })

    expect(result.count).toBe(2)
    const be = result.rows.find(r => r.title === 'backend')!
    expect(be.scope).toBe('api')
    expect(be.sub_status).toBe('aktiv')
    expect(be.blocked_grund).toBeNull()

    const fe = result.rows.find(r => r.title === 'frontend')!
    expect(fe.scope).toBe('ui')
    expect(fe.sub_status).toBe('blocked')
    expect(fe.blocked_grund).toBe('missing design')
  })

  it('dep_count reflects outgoing haengt_ab_von edges', () => {
    const a = makeSubsystem('A')
    const b = makeSubsystem('B')
    writer.linkEdge({ src: a.uid, dst: b.uid, type: 'haengt_ab_von', source: 'inferred' })

    const result = graphQuery(db, { template: 'subsystem_list' })
    const rowA = result.rows.find(r => r.title === 'A')!
    const rowB = result.rows.find(r => r.title === 'B')!
    expect(Number(rowA.dep_count)).toBe(1)
    expect(Number(rowB.dep_count)).toBe(0)
  })

  it('returns empty when no subsystems exist', () => {
    const result = graphQuery(db, { template: 'subsystem_list' })
    expect(result.count).toBe(0)
  })
})

describe('subsystem_dependencies template (PROC-009)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('subsystem_dependencies')
  })

  it('returns empty when no subsystems exist', () => {
    const result = graphQuery(db, { template: 'subsystem_dependencies' })
    expect(result.count).toBe(0)
  })

  it('isolated subsystem (no edges) appears at topo_order 0', () => {
    makeSubsystem('standalone')
    const result = graphQuery(db, { template: 'subsystem_dependencies' })
    expect(result.count).toBe(1)
    expect(Number(result.rows[0].topo_order)).toBe(0)
  })

  it('root (no incoming haengt_ab_von) appears at topo_order 0', () => {
    const root = makeSubsystem('root')
    const dep = makeSubsystem('dep')
    // root haengt_ab_von dep — root depends on dep
    writer.linkEdge({ src: root.uid, dst: dep.uid, type: 'haengt_ab_von', source: 'inferred' })

    const result = graphQuery(db, { template: 'subsystem_dependencies' })
    // dep has incoming from root => NOT a root, so only 'root' is in BFS start
    const rootRow = result.rows.find(r => r.title === 'root')!
    expect(Number(rootRow.topo_order)).toBe(0)
    // dep is reached at depth 1 from root
    const depRow = result.rows.find(r => r.title === 'dep')!
    expect(Number(depRow.topo_order)).toBe(1)
  })

  it('each subsystem appears exactly once (deduplication via GROUP BY)', () => {
    const a = makeSubsystem('A')
    const b = makeSubsystem('B')
    const c = makeSubsystem('C')
    // A→B, A→C (A depends on B and C)
    writer.linkEdge({ src: a.uid, dst: b.uid, type: 'haengt_ab_von', source: 'inferred' })
    writer.linkEdge({ src: a.uid, dst: c.uid, type: 'haengt_ab_von', source: 'inferred' })

    const result = graphQuery(db, { template: 'subsystem_dependencies' })
    const uids = result.rows.map(r => r.uid)
    // No duplicates
    expect(new Set(uids).size).toBe(uids.length)
    expect(result.count).toBe(3)
  })
})

describe('quereinstieg_eignung template (PROC-009)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('quereinstieg_eignung')
  })

  it('throws when target_phase is missing', () => {
    const sub = makeSubsystem('sub')
    expect(() => graphQuery(db, {
      template: 'quereinstieg_eignung',
      params: { subsystem_uid: sub.uid }
    })).toThrow()
  })

  it('throws when subsystem_uid is missing', () => {
    expect(() => graphQuery(db, {
      template: 'quereinstieg_eignung',
      params: { target_phase: 'architecture' }
    })).toThrow()
  })

  it('returns eignung=1 when predecessor has phasenoutput artefakt', () => {
    const req = makePhase('requirements', 2)
    const arch = makePhase('architecture', 3)
    writer.linkEdge({ src: req.uid, dst: arch.uid, type: 'naechste_phase', source: 'inferred' })

    const spec = writer.upsertNode({
      kind: 'artefakt', title: 'spec.md', path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })
    writer.linkEdge({ src: spec.uid, dst: req.uid, type: 'traegt_phase', source: 'inferred' })

    const sub = makeSubsystem('backend')

    const result = graphQuery(db, {
      template: 'quereinstieg_eignung',
      params: { target_phase: 'architecture', subsystem_uid: sub.uid }
    })

    expect(result.count).toBe(1)
    expect(Number(result.rows[0].input_count)).toBeGreaterThanOrEqual(1)
    expect(Number(result.rows[0].eignung)).toBe(1)
    expect(result.rows[0].predecessor_uid).toBe(req.uid)
  })

  it('returns eignung=0 when predecessor has no phasenoutput artefakt', () => {
    const req = makePhase('requirements', 2)
    const arch = makePhase('architecture', 3)
    writer.linkEdge({ src: req.uid, dst: arch.uid, type: 'naechste_phase', source: 'inferred' })
    // No artefakt linked to req

    const sub = makeSubsystem('backend')

    const result = graphQuery(db, {
      template: 'quereinstieg_eignung',
      params: { target_phase: 'architecture', subsystem_uid: sub.uid }
    })

    expect(result.count).toBe(1)
    expect(Number(result.rows[0].input_count)).toBe(0)
    expect(Number(result.rows[0].eignung)).toBe(0)
  })

  it('returns 0 rows when target phase has no predecessor', () => {
    makePhase('ideation', 1)
    const sub = makeSubsystem('backend')

    const result = graphQuery(db, {
      template: 'quereinstieg_eignung',
      params: { target_phase: 'ideation', subsystem_uid: sub.uid }
    })

    expect(result.count).toBe(0)
  })
})
