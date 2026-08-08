/**
 * seGateUrteil + createTrigger + query templates — Phase 3c Task 3
 * CK-3C-003
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { seGateUrteil } from '../src/main/preset/systems-engineer/se-gate-urteil'
import { createTrigger } from '../src/main/preset/systems-engineer/se-trigger'
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

function seedPhase(name: string, position: number) {
  return writer.upsertNode({
    kind: 'phase',
    title: name,
    path: `/phases/${name}.md`,
    frontmatter: { name, position, phase_status: 'ausstehend' },
  })
}

// ---------------------------------------------------------------------------
// seGateUrteil
// ---------------------------------------------------------------------------

describe('seGateUrteil (CK-3C-003)', () => {
  it('creates a gate_befund node with gewichtung set in DB', async () => {
    const phase = seedPhase('requirements', 2)

    await seGateUrteil(db, phase.uid, 'kritisch fuer Release')

    const row = db.prepare(
      "SELECT frontmatter FROM node WHERE kind = 'gate_befund' LIMIT 1"
    ).get() as { frontmatter: string } | undefined

    expect(row).toBeDefined()
    const fm = JSON.parse(row!.frontmatter)
    expect(fm.gewichtung).toBe('kritisch fuer Release')
  })

  it('returns befund_uid and attrs with gewichtung', async () => {
    const phase = seedPhase('architecture', 3)

    const result = await seGateUrteil(db, phase.uid, 'optional')

    expect(result.befund_uid).toBeTruthy()
    expect(result.attrs.gewichtung).toBe('optional')
    expect(result.attrs.phase_uid).toBe(phase.uid)
  })

  it('attrs.strukturell is gruen when phase has no anforderungen', async () => {
    const phase = seedPhase('ideation', 1)

    const result = await seGateUrteil(db, phase.uid, '')

    expect(result.attrs.strukturell).toBe('gruen')
  })

  it('throws if phase does not exist', async () => {
    await expect(seGateUrteil(db, 'NONEXISTENT-PHASE-UID', 'x')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// createTrigger
// ---------------------------------------------------------------------------

describe('createTrigger (CK-3C-003)', () => {
  it('creates a trigger node in the graph', async () => {
    seedPhase('requirements', 2)

    await createTrigger(db, {
      entitaets_id: 'se-001',
      phasen_ziel: 'requirements',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'spec-v1',
      niveau: 'A',
      gate_befund_id: null,
    })

    const row = db.prepare("SELECT uid FROM node WHERE kind = 'trigger'").get()
    expect(row).toBeDefined()
  })

  it('creates a triggert edge from trigger to target phase', async () => {
    const phase = seedPhase('architecture', 3)

    const result = await createTrigger(db, {
      entitaets_id: 'se-001',
      phasen_ziel: 'architecture',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'arch-paket',
      niveau: 'A',
      gate_befund_id: null,
    })

    const edge = db.prepare(
      "SELECT * FROM edge WHERE src = ? AND type = 'triggert'"
    ).get(result.trigger_uid) as { src: string; dst: string; type: string } | undefined

    expect(edge).toBeDefined()
    expect(edge!.dst).toBe(phase.uid)
  })

  it('returns trigger_uid', async () => {
    seedPhase('development', 4)

    const result = await createTrigger(db, {
      entitaets_id: 'se-002',
      phasen_ziel: 'development',
      subsystem: 'frontend',
      input_quelle: 'gate',
      erwarteter_output: 'build',
      niveau: 'B',
      gate_befund_id: null,
    })

    expect(result.trigger_uid).toBeTruthy()
    expect(typeof result.trigger_uid).toBe('string')
  })

  it('accepts null gate_befund_id without error', async () => {
    seedPhase('testing', 5)

    await expect(createTrigger(db, {
      entitaets_id: 'se-003',
      phasen_ziel: 'testing',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'test-findings',
      niveau: 'A',
      gate_befund_id: null,
    })).resolves.toBeDefined()
  })

  it('throws if gate_befund_id references non-existent befund', async () => {
    seedPhase('requirements', 2)

    await expect(createTrigger(db, {
      entitaets_id: 'se-004',
      phasen_ziel: 'requirements',
      subsystem: 'backend',
      input_quelle: 'gate',
      erwarteter_output: 'spec',
      niveau: 'A',
      gate_befund_id: 'NONEXISTENT-BEFUND-UID',
    })).rejects.toThrow(/NONEXISTENT-BEFUND-UID/)
  })

  it('validates gate_befund_id against a real befund', async () => {
    const phase = seedPhase('requirements', 2)
    const befundResult = await seGateUrteil(db, phase.uid, '')
    seedPhase('architecture', 3)

    await expect(createTrigger(db, {
      entitaets_id: 'se-005',
      phasen_ziel: 'architecture',
      subsystem: 'backend',
      input_quelle: 'gate',
      erwarteter_output: 'arch-paket',
      niveau: 'A',
      gate_befund_id: befundResult.befund_uid,
    })).resolves.toBeDefined()
  })

  it('throws if phasen_ziel phase does not exist in graph', async () => {
    await expect(createTrigger(db, {
      entitaets_id: 'se-006',
      phasen_ziel: 'nonexistent-phase',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'output',
      niveau: 'A',
      gate_befund_id: null,
    })).rejects.toThrow(/nonexistent-phase/)
  })
})

// ---------------------------------------------------------------------------
// Query templates: trigger_history + trigger_for_phase
// ---------------------------------------------------------------------------

describe('trigger_history query template (CK-3C-003)', () => {
  it('trigger_history is in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('trigger_history')
  })

  it('returns empty when no trigger nodes exist', () => {
    const result = graphQuery(db, { template: 'trigger_history' })
    expect(result.template).toBe('trigger_history')
    expect(result.rows).toHaveLength(0)
  })

  it('returns all trigger nodes in chronological order', async () => {
    seedPhase('requirements', 2)
    seedPhase('architecture', 3)

    await createTrigger(db, {
      entitaets_id: 'se-001',
      phasen_ziel: 'requirements',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'spec',
      niveau: 'A',
      gate_befund_id: null,
    })

    await createTrigger(db, {
      entitaets_id: 'se-001',
      phasen_ziel: 'architecture',
      subsystem: 'frontend',
      input_quelle: 'manual',
      erwarteter_output: 'arch-paket',
      niveau: 'A',
      gate_befund_id: null,
    })

    const result = graphQuery(db, { template: 'trigger_history' })
    expect(result.rows).toHaveLength(2)
    // chronological: first created first
    const erstellt0 = result.rows[0].erstellt as string
    const erstellt1 = result.rows[1].erstellt as string
    expect(erstellt0 <= erstellt1).toBe(true)
  })
})

describe('trigger_for_phase query template (CK-3C-003)', () => {
  it('trigger_for_phase is in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('trigger_for_phase')
  })

  it('requires phase_uid parameter', () => {
    expect(() => graphQuery(db, { template: 'trigger_for_phase' })).toThrow(/phase_uid/)
  })

  it('returns empty when phase has no triggers', () => {
    const phase = seedPhase('ideation', 1)
    const result = graphQuery(db, {
      template: 'trigger_for_phase',
      params: { phase_uid: phase.uid },
    })
    expect(result.rows).toHaveLength(0)
  })

  it('returns only triggers targeting the specified phase', async () => {
    const phaseReq = seedPhase('requirements', 2)
    seedPhase('architecture', 3)

    // Trigger for requirements
    await createTrigger(db, {
      entitaets_id: 'se-001',
      phasen_ziel: 'requirements',
      subsystem: 'backend',
      input_quelle: 'manual',
      erwarteter_output: 'spec',
      niveau: 'A',
      gate_befund_id: null,
    })

    // Trigger for architecture
    await createTrigger(db, {
      entitaets_id: 'se-001',
      phasen_ziel: 'architecture',
      subsystem: 'frontend',
      input_quelle: 'manual',
      erwarteter_output: 'arch-paket',
      niveau: 'A',
      gate_befund_id: null,
    })

    const result = graphQuery(db, {
      template: 'trigger_for_phase',
      params: { phase_uid: phaseReq.uid },
    })

    expect(result.rows).toHaveLength(1)
    const fm = JSON.parse(result.rows[0].frontmatter as string)
    expect(fm.phasen_ziel).toBe('requirements')
  })
})
