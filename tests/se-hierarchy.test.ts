/**
 * SE Hierarchy + Handoff Audit — query template tests.
 * Phase 3c / Task 4: se_hierarchy, handoff_audit, quereinstieg_entscheidungen
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { graphQuery, QUERY_TEMPLATES } from '../src/main/graph/query'

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

describe('QUERY_TEMPLATES registry', () => {
  it('includes se_hierarchy', () => {
    expect(QUERY_TEMPLATES).toContain('se_hierarchy')
  })
  it('includes handoff_audit', () => {
    expect(QUERY_TEMPLATES).toContain('handoff_audit')
  })
  it('includes quereinstieg_entscheidungen', () => {
    expect(QUERY_TEMPLATES).toContain('quereinstieg_entscheidungen')
  })
})

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let db: Database.Database

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
})

afterEach(() => {
  if (db?.open) db.close()
})

// ---------------------------------------------------------------------------
// Helper: write a node directly bypassing writer validation for SE sessions
// which are anlass nodes with session frontmatter in tests
// ---------------------------------------------------------------------------

function writeNode(
  db: Database.Database,
  uid: string,
  kind: string,
  title: string,
  frontmatter: Record<string, unknown> = {}
) {
  db.prepare(`
    INSERT OR REPLACE INTO node
      (uid, kind, title, status, path, frontmatter, body, content_hash, erstellt, natural_key)
    VALUES (?, ?, ?, 'aktiv', NULL, ?, '', '', datetime('now'), NULL)
  `).run(uid, kind, title, JSON.stringify(frontmatter))
}

function writeEdge(
  db: Database.Database,
  src: string,
  dst: string,
  type: string
) {
  db.prepare(`
    INSERT OR REPLACE INTO edge (src, dst, type, source, props, erstellt)
    VALUES (?, ?, ?, 'inferred', '{}', datetime('now'))
  `).run(src, dst, type)
}

// ---------------------------------------------------------------------------
// se_hierarchy: traverse teilprojekt_von from Haupt-SE
// ---------------------------------------------------------------------------

describe('se_hierarchy query', () => {
  it('requires haupt_se_uid parameter', () => {
    expect(() =>
      graphQuery(db, { template: 'se_hierarchy', params: {} })
    ).toThrow(/haupt_se_uid/)
  })

  it('returns only root when no Teilprojekt-SEs exist', () => {
    writeNode(db, 'haupt-01', 'anlass', 'Haupt-SE', { session: 'se-main' })

    const result = graphQuery(db, {
      template: 'se_hierarchy',
      params: { haupt_se_uid: 'haupt-01' }
    })

    expect(result.template).toBe('se_hierarchy')
    expect(result.count).toBe(1)
    expect(result.rows[0]).toMatchObject({ uid: 'haupt-01', depth: 0 })
  })

  it('returns Haupt-SE + 2 Teilprojekt-SEs with correct depth', () => {
    writeNode(db, 'haupt-01', 'anlass', 'Haupt-SE', { session: 'se-main' })
    writeNode(db, 'teil-01', 'anlass', 'Teilprojekt A', { session: 'se-sub-a' })
    writeNode(db, 'teil-02', 'anlass', 'Teilprojekt B', { session: 'se-sub-b' })

    // teil-01 and teil-02 are sub-projects of haupt-01
    writeEdge(db, 'teil-01', 'haupt-01', 'teilprojekt_von')
    writeEdge(db, 'teil-02', 'haupt-01', 'teilprojekt_von')

    const result = graphQuery(db, {
      template: 'se_hierarchy',
      params: { haupt_se_uid: 'haupt-01' }
    })

    expect(result.count).toBe(3)
    const root = result.rows.find(r => r.uid === 'haupt-01')
    const sub1 = result.rows.find(r => r.uid === 'teil-01')
    const sub2 = result.rows.find(r => r.uid === 'teil-02')

    expect(root?.depth).toBe(0)
    expect(sub1?.depth).toBe(1)
    expect(sub2?.depth).toBe(1)
  })

  it('handles nested hierarchy (depth 2)', () => {
    writeNode(db, 'haupt-01', 'anlass', 'Haupt-SE', { session: 'main' })
    writeNode(db, 'teil-01', 'anlass', 'Teilprojekt A', { session: 'sub-a' })
    writeNode(db, 'sub-sub-01', 'anlass', 'Unter-Teilprojekt', { session: 'sub-sub' })

    writeEdge(db, 'teil-01', 'haupt-01', 'teilprojekt_von')
    writeEdge(db, 'sub-sub-01', 'teil-01', 'teilprojekt_von')

    const result = graphQuery(db, {
      template: 'se_hierarchy',
      params: { haupt_se_uid: 'haupt-01' }
    })

    expect(result.count).toBe(3)
    const subSub = result.rows.find(r => r.uid === 'sub-sub-01')
    expect(subSub?.depth).toBe(2)
  })

  it('includes parent_uid for sub-nodes', () => {
    writeNode(db, 'haupt-01', 'anlass', 'Haupt-SE', { session: 'main' })
    writeNode(db, 'teil-01', 'anlass', 'Teilprojekt A', { session: 'sub-a' })
    writeEdge(db, 'teil-01', 'haupt-01', 'teilprojekt_von')

    const result = graphQuery(db, {
      template: 'se_hierarchy',
      params: { haupt_se_uid: 'haupt-01' }
    })

    const sub = result.rows.find(r => r.uid === 'teil-01')
    expect(sub?.parent_uid).toBe('haupt-01')
    const root = result.rows.find(r => r.uid === 'haupt-01')
    expect(root?.parent_uid).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// handoff_audit: every naechste_phase transition → has SE trigger?
// ---------------------------------------------------------------------------

describe('handoff_audit query', () => {
  it('returns empty when no phase transitions exist', () => {
    const result = graphQuery(db, { template: 'handoff_audit' })
    expect(result.template).toBe('handoff_audit')
    expect(result.count).toBe(0)
  })

  it('returns has_trigger=0 for transitions without trigger', () => {
    writeNode(db, 'phase-1', 'phase', 'Ideation', {
      name: 'ideation', position: 1, phase_status: 'abgeschlossen'
    })
    writeNode(db, 'phase-2', 'phase', 'Requirements', {
      name: 'requirements', position: 2, phase_status: 'aktiv'
    })
    writeEdge(db, 'phase-1', 'phase-2', 'naechste_phase')

    const result = graphQuery(db, { template: 'handoff_audit' })

    expect(result.count).toBe(1)
    expect(result.rows[0]).toMatchObject({
      from_phase_uid: 'phase-1',
      to_phase_uid: 'phase-2',
      has_trigger: 0
    })
  })

  it('returns has_trigger=1 when trigger exists for destination phase', () => {
    writeNode(db, 'phase-1', 'phase', 'Ideation', {
      name: 'ideation', position: 1, phase_status: 'abgeschlossen'
    })
    writeNode(db, 'phase-2', 'phase', 'Requirements', {
      name: 'requirements', position: 2, phase_status: 'aktiv'
    })
    writeEdge(db, 'phase-1', 'phase-2', 'naechste_phase')

    // Add a trigger pointing to phase-2
    writeNode(db, 'trig-01', 'trigger', 'SE Trigger Requirements', {
      entitaets_id: 'se-01',
      phasen_ziel: 'requirements',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'spec',
      niveau: 'A',
      gate_befund_id: null
    })
    writeEdge(db, 'trig-01', 'phase-2', 'triggert')

    const result = graphQuery(db, { template: 'handoff_audit' })

    expect(result.count).toBe(1)
    expect(result.rows[0]).toMatchObject({
      from_phase_uid: 'phase-1',
      to_phase_uid: 'phase-2',
      has_trigger: 1
    })
  })

  it('audits multiple transitions independently', () => {
    writeNode(db, 'phase-1', 'phase', 'Ideation', {
      name: 'ideation', position: 1, phase_status: 'abgeschlossen'
    })
    writeNode(db, 'phase-2', 'phase', 'Requirements', {
      name: 'requirements', position: 2, phase_status: 'abgeschlossen'
    })
    writeNode(db, 'phase-3', 'phase', 'Architecture', {
      name: 'architecture', position: 3, phase_status: 'aktiv'
    })
    writeEdge(db, 'phase-1', 'phase-2', 'naechste_phase')
    writeEdge(db, 'phase-2', 'phase-3', 'naechste_phase')

    // Only phase-2 has a trigger
    writeNode(db, 'trig-01', 'trigger', 'SE Trigger Req', {
      entitaets_id: 'se-01', phasen_ziel: 'requirements',
      subsystem: 'all', input_quelle: 'gate', erwarteter_output: 'req-doc',
      niveau: 'A', gate_befund_id: null
    })
    writeEdge(db, 'trig-01', 'phase-2', 'triggert')

    const result = graphQuery(db, { template: 'handoff_audit' })

    expect(result.count).toBe(2)
    const toPhase2 = result.rows.find(r => r.to_phase_uid === 'phase-2')
    const toPhase3 = result.rows.find(r => r.to_phase_uid === 'phase-3')
    expect(toPhase2?.has_trigger).toBe(1)
    expect(toPhase3?.has_trigger).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// quereinstieg_entscheidungen: all quereinstieg (phase-scoped) decisions
// ---------------------------------------------------------------------------

describe('quereinstieg_entscheidungen query', () => {
  it('returns empty when no entscheidungen are phase-scoped', () => {
    const result = graphQuery(db, { template: 'quereinstieg_entscheidungen' })
    expect(result.template).toBe('quereinstieg_entscheidungen')
    expect(result.count).toBe(0)
  })

  it('returns entscheidungen with traegt_phase edges', () => {
    writeNode(db, 'phase-1', 'phase', 'Ideation', {
      name: 'ideation', position: 1, phase_status: 'aktiv'
    })
    writeNode(db, 'ent-01', 'entscheidung', 'Quereinstieg-Entscheidung A', {})
    writeNode(db, 'ent-02', 'entscheidung', 'Unlinked Entscheidung', {})

    writeEdge(db, 'ent-01', 'phase-1', 'traegt_phase')

    const result = graphQuery(db, { template: 'quereinstieg_entscheidungen' })

    expect(result.count).toBe(1)
    expect(result.rows[0]).toMatchObject({
      uid: 'ent-01',
      phase_uid: 'phase-1'
    })
  })

  it('returns phase_name from frontmatter', () => {
    writeNode(db, 'phase-2', 'phase', 'Requirements', {
      name: 'requirements', position: 2, phase_status: 'aktiv'
    })
    writeNode(db, 'ent-03', 'entscheidung', 'Lateral Entry Decision', {})
    writeEdge(db, 'ent-03', 'phase-2', 'traegt_phase')

    const result = graphQuery(db, { template: 'quereinstieg_entscheidungen' })

    expect(result.count).toBe(1)
    expect(result.rows[0]).toMatchObject({
      uid: 'ent-03',
      phase_name: 'requirements'
    })
  })

  it('returns multiple phase-scoped entscheidungen', () => {
    writeNode(db, 'phase-1', 'phase', 'Ideation', {
      name: 'ideation', position: 1, phase_status: 'aktiv'
    })
    writeNode(db, 'phase-2', 'phase', 'Requirements', {
      name: 'requirements', position: 2, phase_status: 'aktiv'
    })
    writeNode(db, 'ent-01', 'entscheidung', 'Decision A', {})
    writeNode(db, 'ent-02', 'entscheidung', 'Decision B', {})
    writeEdge(db, 'ent-01', 'phase-1', 'traegt_phase')
    writeEdge(db, 'ent-02', 'phase-2', 'traegt_phase')

    const result = graphQuery(db, { template: 'quereinstieg_entscheidungen' })

    expect(result.count).toBe(2)
    const uids = result.rows.map(r => r.uid)
    expect(uids).toContain('ent-01')
    expect(uids).toContain('ent-02')
  })
})
