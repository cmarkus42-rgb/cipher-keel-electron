/**
 * steuer_ueberblick + vault_index query template tests — Task 6 (Wave 2 Teil 2).
 *
 * steuer_ueberblick: one row per (phase_subsystem, phase) pair via traegt_phase,
 *   latest gate_befund per phase via gate_fuer ROW_NUMBER.
 * vault_index: all note and uebergabedokument nodes with notetyp/dokumentTyp.
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
  if (db?.open) db.close()
})

function makePhase(name: string, position: number) {
  return writer.upsertNode({
    kind: 'phase', title: name, path: `/phases/${name}`,
    frontmatter: { name, position, phase_status: 'ausstehend' }
  })
}

function makeSubsystem(title: string, opts: { scope?: string; status?: string; blocked_grund?: string } = {}) {
  return writer.upsertNode({
    kind: 'phase_subsystem',
    title,
    path: `/subsystems/${title}`,
    frontmatter: { ebene: 'top', ...opts }
  })
}

function makeBefund(phaseUid: string, strukturell: string) {
  const befund = writer.upsertNode({
    kind: 'gate_befund',
    title: `Gate ${strukturell}`,
    path: `/gates/${strukturell}.md`,
    frontmatter: {
      phase_uid: phaseUid, strukturell,
      plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
    }
  })
  writer.linkEdge({ src: befund.uid, dst: phaseUid, type: 'gate_fuer', source: 'inferred' })
  return befund
}

// ---------------------------------------------------------------------------
// steuer_ueberblick
// ---------------------------------------------------------------------------

describe('steuer_ueberblick template', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('steuer_ueberblick')
  })

  it('returns one row per (subsystem, phase) pair', () => {
    const phase1 = makePhase('requirements', 2)
    const phase2 = makePhase('architecture', 3)
    const sub = makeSubsystem('backend', { scope: 'api' })

    writer.linkEdge({ src: sub.uid, dst: phase1.uid, type: 'traegt_phase', source: 'inferred' })
    writer.linkEdge({ src: sub.uid, dst: phase2.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, { template: 'steuer_ueberblick' })

    expect(result.count).toBe(2)
    const req = result.rows.find(r => r.phase_name === 'requirements')!
    expect(req.subsystem_uid).toBe(sub.uid)
    expect(req.scope).toBe('api')
    const arch = result.rows.find(r => r.phase_name === 'architecture')!
    expect(arch.subsystem_uid).toBe(sub.uid)
  })

  it('befund_uid is null when phase has no gate_befund', () => {
    const phase = makePhase('ideation', 1)
    const sub = makeSubsystem('frontend')
    writer.linkEdge({ src: sub.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, { template: 'steuer_ueberblick' })

    expect(result.count).toBe(1)
    expect(result.rows[0].befund_uid).toBeNull()
  })

  it('befund_uid is set to one of the gate_befunde for the phase (not null)', () => {
    const phase = makePhase('requirements', 2)
    const sub = makeSubsystem('backend')
    writer.linkEdge({ src: sub.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    const b1 = makeBefund(phase.uid, 'rot')
    const b2 = makeBefund(phase.uid, 'gruen')

    const result = graphQuery(db, { template: 'steuer_ueberblick' })

    expect(result.count).toBe(1)
    // Exactly one befund row is returned (the most recent by erstellt/uid DESC tiebreaker)
    expect([b1.uid, b2.uid]).toContain(result.rows[0].befund_uid)
  })

  it('each (subsystem, phase) pair appears exactly once even with multiple befunde', () => {
    const phase = makePhase('requirements', 2)
    const sub = makeSubsystem('backend')
    writer.linkEdge({ src: sub.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    makeBefund(phase.uid, 'rot')
    makeBefund(phase.uid, 'gelb')
    makeBefund(phase.uid, 'gruen')

    const result = graphQuery(db, { template: 'steuer_ueberblick' })
    const pairs = result.rows.filter(r => r.subsystem_uid === sub.uid && r.phase_uid === phase.uid)
    expect(pairs).toHaveLength(1)
  })

  it('includes blocked_grund and sub_status from frontmatter', () => {
    const phase = makePhase('ideation', 1)
    const sub = makeSubsystem('blocked-sub', { status: 'blocked', blocked_grund: 'needs spec' })
    writer.linkEdge({ src: sub.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, { template: 'steuer_ueberblick' })

    expect(result.count).toBe(1)
    expect(result.rows[0].sub_status).toBe('blocked')
    expect(result.rows[0].blocked_grund).toBe('needs spec')
  })

  it('returns empty when no phase_subsystem nodes exist', () => {
    makePhase('ideation', 1)
    const result = graphQuery(db, { template: 'steuer_ueberblick' })
    expect(result.count).toBe(0)
  })

  it('ordered by phase_position then subsystem uid', () => {
    const phase1 = makePhase('ideation', 1)
    const phase2 = makePhase('requirements', 2)
    const sub = makeSubsystem('alpha')
    writer.linkEdge({ src: sub.uid, dst: phase1.uid, type: 'traegt_phase', source: 'inferred' })
    writer.linkEdge({ src: sub.uid, dst: phase2.uid, type: 'traegt_phase', source: 'inferred' })

    const result = graphQuery(db, { template: 'steuer_ueberblick' })

    expect(result.count).toBe(2)
    expect(Number(result.rows[0].phase_position)).toBe(1)
    expect(Number(result.rows[1].phase_position)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// vault_index
// ---------------------------------------------------------------------------

describe('vault_index template', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('vault_index')
  })

  it('returns empty when no notes or uebergabedokumente exist', () => {
    const result = graphQuery(db, { template: 'vault_index' })
    expect(result.count).toBe(0)
  })

  it('returns note nodes with notetyp', () => {
    writer.upsertNode({
      kind: 'note', title: 'Meeting Notes', path: '/notes/meeting.md',
      frontmatter: { notetyp: 'protokoll' }
    })

    const result = graphQuery(db, { template: 'vault_index' })

    expect(result.count).toBe(1)
    const row = result.rows[0]
    expect(row.kind).toBe('note')
    expect(row.notetyp).toBe('protokoll')
    expect(row.dokumentTyp).toBeNull()
  })

  it('returns uebergabedokument nodes with dokumentTyp', () => {
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Requirements Doc', path: '/uebergabe/req.md',
      frontmatter: { dokumentTyp: 'anforderungen' }
    })

    const result = graphQuery(db, { template: 'vault_index' })

    expect(result.count).toBe(1)
    const row = result.rows[0]
    expect(row.kind).toBe('uebergabedokument')
    expect(row.dokumentTyp).toBe('anforderungen')
    expect(row.notetyp).toBeNull()
  })

  it('returns both notes and uebergabedokumente together', () => {
    writer.upsertNode({
      kind: 'note', title: 'Note A', path: '/notes/a.md',
      frontmatter: { notetyp: 'idee' }
    })
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Spec Doc', path: '/uebergabe/spec.md',
      frontmatter: { dokumentTyp: 'spec' }
    })

    const result = graphQuery(db, { template: 'vault_index' })

    expect(result.count).toBe(2)
    const kinds = result.rows.map(r => r.kind)
    expect(kinds).toContain('note')
    expect(kinds).toContain('uebergabedokument')
  })

  it('does not return other node kinds (anforderung, artefakt, etc.)', () => {
    writer.upsertNode({
      kind: 'anforderung', title: 'REQ-001', path: '/req/001.md', frontmatter: {}
    })
    writer.upsertNode({
      kind: 'artefakt', title: 'impl.ts', path: '/src/impl.ts', frontmatter: {}
    })
    writer.upsertNode({
      kind: 'note', title: 'Note', path: '/notes/n.md', frontmatter: { notetyp: 'memo' }
    })

    const result = graphQuery(db, { template: 'vault_index' })

    expect(result.count).toBe(1)
    expect(result.rows[0].kind).toBe('note')
  })

  it('returns all required fields on each row', () => {
    writer.upsertNode({
      kind: 'note', title: 'Test Note', path: '/notes/test.md',
      frontmatter: { notetyp: 'todo' }
    })

    const result = graphQuery(db, { template: 'vault_index' })
    const row = result.rows[0]

    expect(row.uid).toBeDefined()
    expect(row.kind).toBe('note')
    expect(row.title).toBe('Test Note')
    expect(row.path).toBe('/notes/test.md')
    expect(row.status).toBeDefined()
    expect(row.frontmatter).toBeDefined()
    expect(row.notetyp).toBe('todo')
    expect(row.erstellt).toBeDefined()
  })
})
