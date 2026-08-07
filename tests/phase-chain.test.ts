/**
 * phase-chain.test.ts — Phasen-Kette + Phasen-Kontrakt Tests.
 *
 * CK-PROC-001: Acht-Phasen-Kette als Prozess-Grundstruktur
 * CK-PROC-002: Einheitlicher Phasen-Kontrakt
 * CK-PROC-003: phaseninput als getypte Graph-Referenz
 * CK-PROC-013: Kontrakt runtime-agnostisch (harness-agnostisch)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import { resolvePhaseInput, createPhaseContract } from '../src/main/graph/phase-contract'

const PHASE_DEFS = [
  { name: 'ideation', position: 1 },
  { name: 'requirements', position: 2 },
  { name: 'architecture', position: 3 },
  { name: 'development', position: 4 },
  { name: 'testing', position: 5 },
  { name: 'fixing', position: 6 },
  { name: 'audit', position: 7 },
  { name: 'release-management', position: 8 },
] as const

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  if (db?.open) db.close()
})

function createPhase(name: string, position: number) {
  return writer.upsertNode({
    kind: 'phase',
    title: name,
    path: `/phases/${name}`,
    frontmatter: { name, position, phase_status: 'ausstehend' }
  })
}

function buildPhaseChain(): Array<{ name: string; position: number; uid: string }> {
  const nodes = PHASE_DEFS.map(p => ({ ...p, uid: createPhase(p.name, p.position).uid }))
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

// -------------------------------------------------------------------
// CK-PROC-001: Acht-Phasen-Kette als Graph-Knoten mit Reihenfolge
// -------------------------------------------------------------------

describe('phase_chain query (CK-PROC-001)', () => {
  it('returns all 8 phases in position order', () => {
    buildPhaseChain()

    const result = graphQuery(db, { template: 'phase_chain' })

    expect(result.count).toBe(8)
    const names = result.rows.map(r => (JSON.parse(r.frontmatter as string) as { name: string }).name)
    expect(names).toEqual([
      'ideation', 'requirements', 'architecture', 'development',
      'testing', 'fixing', 'audit', 'release-management'
    ])
  })

  it('positions are consecutive 1–8', () => {
    buildPhaseChain()

    const result = graphQuery(db, { template: 'phase_chain' })
    const positions = result.rows.map(r => (JSON.parse(r.frontmatter as string) as { position: number }).position)
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('all phases have kind = phase', () => {
    buildPhaseChain()

    const result = graphQuery(db, { template: 'phase_chain' })
    for (const row of result.rows) {
      expect(row.kind).toBe('phase')
    }
  })
})

// -------------------------------------------------------------------
// CK-PROC-003: phaseninput per Graph-Abfrage aufgeloest
// -------------------------------------------------------------------

describe('phase_input_resolve query (CK-PROC-003)', () => {
  it("'architecture' resolves to spec.md phasenoutput of requirements", async () => {
    const nodes = buildPhaseChain()
    const requirementsUid = nodes.find(n => n.name === 'requirements')!.uid

    const spec = writer.upsertNode({
      kind: 'artefakt',
      title: 'spec.md',
      path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })
    writer.linkEdge({ src: spec.uid, dst: requirementsUid, type: 'traegt_phase', source: 'inferred' })

    const input = await resolvePhaseInput(db, 'architecture')

    expect(input.phase_name).toBe('architecture')
    expect(input.artefakte).toHaveLength(1)
    expect(input.artefakte[0].title).toBe('spec.md')
  })

  it("'ideation' returns empty — first phase has no predecessor", async () => {
    buildPhaseChain()

    const input = await resolvePhaseInput(db, 'ideation')

    expect(input.phase_name).toBe('ideation')
    expect(input.artefakte).toHaveLength(0)
  })

  it('does not include artefakte without phasenoutput: true', async () => {
    const nodes = buildPhaseChain()
    const requirementsUid = nodes.find(n => n.name === 'requirements')!.uid

    const workNote = writer.upsertNode({
      kind: 'artefakt',
      title: 'work-notes.md',
      path: '/artefakte/work-notes.md',
      frontmatter: {}
    })
    writer.linkEdge({ src: workNote.uid, dst: requirementsUid, type: 'traegt_phase', source: 'inferred' })

    const input = await resolvePhaseInput(db, 'architecture')
    expect(input.artefakte).toHaveLength(0)
  })

  it('phaseninput is a graph query, not a hardcoded predecessor reference', async () => {
    // artefakt on requirements (phase 2) is accessible to architecture (phase 3)
    // but NOT to development (phase 4) — only the direct predecessor's output
    const nodes = buildPhaseChain()
    const requirementsUid = nodes.find(n => n.name === 'requirements')!.uid

    const spec = writer.upsertNode({
      kind: 'artefakt',
      title: 'spec.md',
      path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })
    writer.linkEdge({ src: spec.uid, dst: requirementsUid, type: 'traegt_phase', source: 'inferred' })

    // architecture (phase 3) sees spec.md from requirements (phase 2)
    const archInput = await resolvePhaseInput(db, 'architecture')
    expect(archInput.artefakte.map(a => a.title)).toContain('spec.md')

    // development (phase 4) does NOT see spec.md (not linked to architecture via naechste_phase path)
    const devInput = await resolvePhaseInput(db, 'development')
    expect(devInput.artefakte.map(a => a.title)).not.toContain('spec.md')
  })
})

// -------------------------------------------------------------------
// CK-PROC-002 + CK-PROC-013: Phasen-Kontrakt
// -------------------------------------------------------------------

describe('PhaseContract (CK-PROC-002, CK-PROC-013)', () => {
  it('has all three components: phaseninput, phasenartefakte, phasenoutput', () => {
    const nodes = buildPhaseChain()
    const archUid = nodes.find(n => n.name === 'architecture')!.uid

    const contract = createPhaseContract('architecture', archUid, null)

    expect(contract.phase_name).toBe('architecture')
    expect(contract.phase_uid).toBe(archUid)
    expect(typeof contract.phaseninput).toBe('function')
    expect(typeof contract.phasenartefakte).toBe('function')
    expect(contract.phasenoutput).toBeNull()
  })

  it('phaseninput resolves via graph — not a fixed predecessor reference', async () => {
    const nodes = buildPhaseChain()
    const requirementsUid = nodes.find(n => n.name === 'requirements')!.uid
    const archUid = nodes.find(n => n.name === 'architecture')!.uid

    const spec = writer.upsertNode({
      kind: 'artefakt',
      title: 'spec.md',
      path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })
    writer.linkEdge({ src: spec.uid, dst: requirementsUid, type: 'traegt_phase', source: 'inferred' })

    const contract = createPhaseContract('architecture', archUid, null)
    const input = await contract.phaseninput(db)

    expect(input.artefakte).toHaveLength(1)
    expect(input.artefakte[0].title).toBe('spec.md')
  })

  it('same contract structure for any runtime — harness-agnostic (CK-PROC-013)', () => {
    // Both "workshop path" and "cyber-factory path" use identical createPhaseContract
    const nodes = buildPhaseChain()
    const ideationUid = nodes[0].uid

    const workshopContract = createPhaseContract('ideation', ideationUid, null)
    const cfContract = createPhaseContract('ideation', ideationUid, null)

    expect(Object.keys(workshopContract).sort()).toEqual(Object.keys(cfContract).sort())
    expect(workshopContract.phase_name).toBe(cfContract.phase_name)
  })

  it('phasenoutput references a handover document', () => {
    const nodes = buildPhaseChain()
    const requirementsUid = nodes.find(n => n.name === 'requirements')!.uid

    const spec = writer.upsertNode({
      kind: 'artefakt',
      title: 'spec.md',
      path: '/artefakte/spec.md',
      frontmatter: { phasenoutput: true }
    })

    const contract = createPhaseContract('requirements', requirementsUid, {
      uid: spec.uid,
      title: 'spec.md',
      path: '/artefakte/spec.md'
    })

    expect(contract.phasenoutput).not.toBeNull()
    expect(contract.phasenoutput!.title).toBe('spec.md')
    expect(contract.phasenoutput!.uid).toBe(spec.uid)
  })
})
