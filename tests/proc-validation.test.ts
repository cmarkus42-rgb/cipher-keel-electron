/**
 * proc-validation.test.ts — Workshop Contract Binding Tests.
 *
 * CK-PROC-002: PhaseContract via toPhaseContracts
 * CK-PROC-004: Workshop skip phases marked as trivial-skip
 * CK-PROC-003: phaseninput as graph-query function
 * CK-PROC-001: phase_chain query returns correct order
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import { toPhaseContracts } from '../src/main/graph/phase-contract'

const PHASE_DEFS = [
  { name: 'ideation',            position: 1 },
  { name: 'requirements',        position: 2 },
  { name: 'architecture',        position: 3 },
  { name: 'development',         position: 4 },
  { name: 'testing',             position: 5 },
  { name: 'fixing',              position: 6 },
  { name: 'audit',               position: 7 },
  { name: 'release-management',  position: 8 },
] as const

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db?.open && db.close()
})

function makeDbWithPhases(): Array<{ name: string; position: number; uid: string }> {
  const nodes = PHASE_DEFS.map(p => ({
    ...p,
    uid: writer.upsertNode({
      kind: 'phase',
      title: p.name,
      path: `/phases/${p.name}`,
      frontmatter: { name: p.name, position: p.position, phase_status: 'ausstehend' }
    }).uid
  }))
  for (let i = 0; i < nodes.length - 1; i++) {
    writer.linkEdge({
      src: nodes[i].uid,
      dst: nodes[i + 1].uid,
      type: 'naechste_phase',
      source: 'inferred'
    })
  }
  return nodes
}

// ---------------------------------------------------------------------------
// toPhaseContracts
// ---------------------------------------------------------------------------

describe('toPhaseContracts', () => {
  it('returns 8 PhaseContracts for a full 8-phase graph', () => {
    makeDbWithPhases()
    const contracts = toPhaseContracts(db)
    expect(contracts).toHaveLength(8)
  })

  it('marks workshop skip phases (ideation, requirements, architecture) with trivial-skip', () => {
    makeDbWithPhases()
    toPhaseContracts(db)

    const skipPhases = ['ideation', 'requirements', 'architecture']
    for (const phaseName of skipPhases) {
      const row = db.prepare(
        `SELECT json_extract(frontmatter, '$.skip_profil') as sp
         FROM node
         WHERE kind = 'phase' AND json_extract(frontmatter, '$.name') = ?`
      ).get(phaseName) as { sp: string | null }

      expect(row?.sp, `${phaseName} should have skip_profil`).not.toBeNull()
      const sp = JSON.parse(row!.sp!) as { tiefe: string }
      expect(sp.tiefe).toBe('trivial-skip')
    }
  })

  it('does not set skip_profil on non-workshop phases', () => {
    makeDbWithPhases()
    toPhaseContracts(db)

    const nonSkipPhases = ['development', 'testing', 'fixing', 'audit', 'release-management']
    for (const phaseName of nonSkipPhases) {
      const row = db.prepare(
        `SELECT json_extract(frontmatter, '$.skip_profil') as sp
         FROM node
         WHERE kind = 'phase' AND json_extract(frontmatter, '$.name') = ?`
      ).get(phaseName) as { sp: string | null }

      expect(row?.sp, `${phaseName} should not have skip_profil`).toBeNull()
    }
  })

  it('each PhaseContract has phaseninput as a function', () => {
    makeDbWithPhases()
    const contracts = toPhaseContracts(db)
    for (const contract of contracts) {
      expect(typeof contract.phaseninput).toBe('function')
    }
  })

  it('contracts are sorted by phase position (1–8)', () => {
    makeDbWithPhases()
    const contracts = toPhaseContracts(db)
    const names = contracts.map(c => c.phase_name)
    expect(names).toEqual([
      'ideation', 'requirements', 'architecture', 'development',
      'testing', 'fixing', 'audit', 'release-management'
    ])
  })
})

// ---------------------------------------------------------------------------
// phase_chain query via makeDbWithPhases
// ---------------------------------------------------------------------------

describe('phase_chain query (via makeDbWithPhases)', () => {
  it('returns 8 phases in correct position order', () => {
    makeDbWithPhases()
    const result = graphQuery(db, { template: 'phase_chain' })
    expect(result.count).toBe(8)
    const names = result.rows.map(r => (JSON.parse(r.frontmatter as string) as { name: string }).name)
    expect(names).toEqual([
      'ideation', 'requirements', 'architecture', 'development',
      'testing', 'fixing', 'audit', 'release-management'
    ])
  })
})
