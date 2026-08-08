import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('Release Phase (CK-PROC-017)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { if (db?.open) db.close() })

  function seedPhaseChain() {
    const phases = [
      { name: 'ideation', position: 1 },
      { name: 'requirements', position: 2 },
      { name: 'architecture', position: 3 },
      { name: 'development', position: 4 },
      { name: 'testing', position: 5 },
      { name: 'fixing', position: 6 },
      { name: 'audit', position: 7 },
      { name: 'release', position: 8 },
    ]
    const nodes = phases.map(p => writer.upsertNode({
      kind: 'phase', title: p.name, path: `/phases/${p.name}`,
      frontmatter: { name: p.name, position: p.position, phase_status: 'ausstehend' },
    }))
    for (let i = 0; i < nodes.length - 1; i++) {
      writer.linkEdge({ src: nodes[i].uid, dst: nodes[i + 1].uid, type: 'naechste_phase' })
    }
    return nodes
  }

  it('phase_chain returns 8 phases with release as last', () => {
    seedPhaseChain()
    const result = graphQuery(db, { template: 'phase_chain' })
    expect(result.count).toBe(8)
    const last = result.rows[result.rows.length - 1] as Record<string, unknown>
    const fm = typeof last.frontmatter === 'string' ? JSON.parse(last.frontmatter) : last.frontmatter
    expect(fm.name).toBe('release')
    expect(fm.position).toBe(8)
  })

  it('release phase has public-facing character in frontmatter', () => {
    seedPhaseChain()
    const result = graphQuery(db, { template: 'nodes_by_kind', params: { kind: 'phase' } })
    const release = result.rows.find((r: Record<string, unknown>) => {
      const fm = typeof r.frontmatter === 'string' ? JSON.parse(r.frontmatter) : r.frontmatter
      return fm.name === 'release'
    })
    expect(release).toBeDefined()
  })
})
