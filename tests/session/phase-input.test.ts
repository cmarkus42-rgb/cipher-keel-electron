/**
 * phase-input.test.ts — the context-bearing assembly layer (M2 sections 9.1 and 17.4).
 *
 * CK-PROC-003: phaseninput as a typed graph reference, resolved by query.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { buildPhaseInputSection } from '../../src/main/session/phase-input'

const PHASE_DEFS = [
  { name: 'ideation', position: 1 },
  { name: 'requirements', position: 2 },
  { name: 'architecture', position: 3 },
  { name: 'development', position: 4 },
  { name: 'testing', position: 5 },
  { name: 'fixing', position: 6 },
] as const

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
  const nodes = PHASE_DEFS.map(p => ({
    ...p,
    uid: writer.upsertNode({
      kind: 'phase',
      title: p.name,
      path: `/phases/${p.name}`,
      frontmatter: { name: p.name, position: p.position, phase_status: 'ausstehend' },
    }).uid,
  }))
  for (let i = 0; i < nodes.length - 1; i++) {
    writer.linkEdge({
      src: nodes[i].uid, dst: nodes[i + 1].uid, type: 'naechste_phase', source: 'inferred',
    })
  }
})

afterEach(() => {
  if (db?.open) db.close()
})

/** Attach a phasenoutput artefakt to a phase, so the next phase can resolve it as input. */
function addOutput(phase: string, title: string, path: string | undefined) {
  const phaseUid = db.prepare(
    "SELECT uid FROM node WHERE kind = 'phase' AND json_extract(frontmatter, '$.name') = ?"
  ).get(phase) as { uid: string }
  const node = writer.upsertNode({
    kind: 'artefakt', title, path, frontmatter: { phasenoutput: true },
  })
  writer.linkEdge({ src: node.uid, dst: phaseUid.uid, type: 'traegt_phase', source: 'inferred' })
  return node.uid
}

describe('buildPhaseInputSection', () => {
  it('names the artefakte of the preceding phase with uid and path', async () => {
    const uid = addOutput('requirements', 'spec.md', '/artefakte/spec.md')

    const section = await buildPhaseInputSection(db, ['architecture'])

    expect(section).toContain('spec.md')
    expect(section).toContain(uid)
    expect(section).toContain('/artefakte/spec.md')
  })

  it('emits no @-lines — the pointers are graph uids, not files the harness resolves', async () => {
    addOutput('requirements', 'spec.md', '/artefakte/spec.md')

    const section = await buildPhaseInputSection(db, ['architecture'])

    expect(section).not.toMatch(/^@/m)
  })

  it('covers every bound phase — the Workshop spans fixing and development', async () => {
    addOutput('architecture', 'adr-001.md', '/artefakte/adr-001.md')
    addOutput('testing', 'testbericht.md', '/artefakte/testbericht.md')

    const section = await buildPhaseInputSection(db, ['fixing', 'development'])

    expect(section).toContain('adr-001.md')      // predecessor of development
    expect(section).toContain('testbericht.md')  // predecessor of fixing
    expect(section).toContain('fixing')
    expect(section).toContain('development')
  })

  it('returns undefined for an entity bound to no phase — the SE lies across them', async () => {
    addOutput('requirements', 'spec.md', '/artefakte/spec.md')

    expect(await buildPhaseInputSection(db, [])).toBeUndefined()
  })

  it('returns undefined when no bound phase has any input yet', async () => {
    expect(await buildPhaseInputSection(db, ['architecture'])).toBeUndefined()
  })

  it('returns undefined without a graph — a missing graph must not break the launch', async () => {
    expect(await buildPhaseInputSection(null, ['architecture'])).toBeUndefined()
  })

  // An `artefakt` cannot be pathless — its natural key is the path (uid.ts). An `anlass`
  // can, and the resolve query filters on the phasenoutput flag rather than on kind, so a
  // pathless node can reach this layer. The uid carries it when the path cannot.
  it('keeps a pathless node usable — the uid is the reliable pointer', async () => {
    const phaseUid = db.prepare(
      "SELECT uid FROM node WHERE kind = 'phase' AND json_extract(frontmatter, '$.name') = ?"
    ).get('requirements') as { uid: string }
    const node = writer.upsertNode({
      kind: 'anlass',
      title: 'Übergabe-Sitzung',
      frontmatter: { phasenoutput: true, session: 's-42', zeitpunkt: '2026-08-11T10:00:00Z' },
    })
    writer.linkEdge({ src: node.uid, dst: phaseUid.uid, type: 'traegt_phase', source: 'inferred' })

    const section = await buildPhaseInputSection(db, ['architecture'])

    expect(section).toContain('Übergabe-Sitzung')
    expect(section).toContain(node.uid)
    expect(section).not.toContain('Pfad')
  })
})
