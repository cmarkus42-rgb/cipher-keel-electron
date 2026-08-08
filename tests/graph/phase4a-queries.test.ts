import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphQuery } from '../../src/main/graph/query'
import type Database from 'better-sqlite3'

function seedArchitectGraph(writer: GraphWriter) {
  // Create two subsystems
  const subA = writer.upsertNode({
    kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
    frontmatter: { scope: 'authentication' },
  })
  const subB = writer.upsertNode({
    kind: 'phase_subsystem', title: 'DB', path: '/sub/db',
    frontmatter: { scope: 'database' },
  })

  // ADR linked to Auth
  const adr1 = writer.upsertNode({
    kind: 'adr', title: 'Use JWT', path: '/adrs/jwt.md',
    frontmatter: {
      title: 'Use JWT', context: 'Need tokens', options: 'JWT vs session',
      decision: 'JWT', consequences: 'Stateless', version: 1,
      tiefen: { summary: 'JWT chosen for auth', context: 'ctx', alternatives: 'session', consequences: 'stateless' },
    },
  })
  writer.linkEdge({ src: adr1.uid, dst: subA.uid })

  // Contract between Auth and DB
  const contract = writer.upsertNode({
    kind: 'schnittstellen_vertrag', title: 'Auth-DB', path: '/contracts/auth-db.md',
    frontmatter: {
      subsystem_a: subA.uid, subsystem_b: subB.uid,
      input_schema: '{ userId: string }', output_schema: '{ user: User }',
      fehlerverhalten: '404', template_version: '1.0',
    },
  })
  writer.linkEdge({ src: contract.uid, dst: subA.uid })

  // Anforderungspaket for Auth
  const pkg = writer.upsertNode({
    kind: 'anforderungspaket', title: 'Auth Package', path: '/pkgs/auth.md',
    frontmatter: {
      subsystem: subA.uid, req_ids: ['REQ-001'], code_anker: ['src/auth.ts'],
      akzeptanzkriterium: 'Login works', testcase_verweis: 'T-1',
    },
  })

  // Open question
  const frage = writer.upsertNode({
    kind: 'frage_knoten', title: 'Q1', path: '/coaching/q1.md',
    frontmatter: { subsystem: subA.uid, frage: 'Error format?', worker_id: 'w1', status: 'offen' },
  })

  // Answered question
  const frage2 = writer.upsertNode({
    kind: 'frage_knoten', title: 'Q2', path: '/coaching/q2.md',
    frontmatter: { subsystem: subA.uid, frage: 'Token TTL?', worker_id: 'w2', status: 'beantwortet' },
  })
  const antwort = writer.upsertNode({
    kind: 'antwort_knoten', title: 'A2', path: '/coaching/a2.md',
    frontmatter: { frage_uid: frage2.uid, antwort: '1 hour', architect_session: 'arch-1' },
  })
  writer.linkEdge({ src: antwort.uid, dst: frage2.uid })

  // Risk review (gate_befund with gate_typ='risk-review')
  const phase = writer.upsertNode({
    kind: 'phase', title: 'Development', path: '/phases/dev',
    frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
  })
  writer.upsertNode({
    kind: 'gate_befund', title: 'Risk Review W1', path: '/reviews/w1.md',
    frontmatter: {
      phase_uid: phase.uid, strukturell: 'gruen', gate_typ: 'risk-review',
      risiko: 'Token leak', wahrscheinlichkeit: 'niedrig', impact: 'hoch',
      massnahme: 'Rotate keys', befund_statement: 'Low prob high impact token leak risk',
    },
  })

  return { subA, subB, adr1, contract, pkg, frage, frage2, antwort, phase }
}

describe('Phase 4a Query Templates', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { if (db?.open) db.close() })

  it('adr_list returns all ADR nodes', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'adr_list' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Use JWT')
  })

  it('adr_by_tiefe returns summary-level content', () => {
    const { adr1 } = seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'adr_by_tiefe', params: { adr_uid: adr1.uid, tiefe: 'summary' } })
    expect(result.count).toBe(1)
    const row = result.rows[0] as Record<string, unknown>
    expect(row).toHaveProperty('title')
  })

  it('schnittstellen_vertraege returns contracts', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'schnittstellen_vertraege' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Auth-DB')
  })

  it('schnittstellen_vertraege filters by subsystem_uid', () => {
    const { subA } = seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'schnittstellen_vertraege', params: { subsystem_uid: subA.uid } })
    expect(result.count).toBe(1)
  })

  it('anforderungspakete returns packages', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'anforderungspakete' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Auth Package')
  })

  it('offene_fragen returns only open questions', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'offene_fragen' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Q1')
  })

  it('coaching_historie returns Q+A pairs chronologically', () => {
    const { subA } = seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'coaching_historie', params: { subsystem: subA.uid } })
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('architect_summary aggregates subsystem data', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'architect_summary' })
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('risk_reviews returns gate_befund with gate_typ risk-review', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'risk_reviews' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Risk Review W1')
  })
})
