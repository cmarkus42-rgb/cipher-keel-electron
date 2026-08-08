import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphQuery } from '../../src/main/graph/query'
import {
  createSubsystemCycle,
  advanceCyclePhase,
  CYCLE_PHASES,
} from '../../src/main/graph/subsystem-cycle'
import type Database from 'better-sqlite3'

describe('Subsystem Cycle (CK-PROC-016)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { if (db?.open) db.close() })

  it('CYCLE_PHASES has correct order', () => {
    expect(CYCLE_PHASES).toEqual(['development', 'testing', 'fixing', 'audit'])
  })

  it('creates cycle for a subsystem', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    const cycle = createSubsystemCycle(writer, sub.uid, 'Auth')
    expect(cycle.phases).toHaveLength(4)
    expect(cycle.currentPhase).toBe('development')
  })

  it('advances cycle phase', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    const cycle = createSubsystemCycle(writer, sub.uid, 'Auth')
    const next = advanceCyclePhase(writer, cycle)
    expect(next.currentPhase).toBe('testing')
  })

  it('subsystem_cycle_status query returns cycle state', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    createSubsystemCycle(writer, sub.uid, 'Auth')
    const result = graphQuery(db, { template: 'subsystem_cycle_status', params: { subsystem_uid: sub.uid } })
    expect(result.count).toBeGreaterThanOrEqual(1)
  })
})
