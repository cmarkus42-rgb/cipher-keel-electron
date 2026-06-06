import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphQuery } from '../../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('Phase 5 Query Fixes — project_uid filtering', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  function createProjectWithAdr(projectName: string) {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: `${projectName}-sub`, path: `/sub/${projectName}`,
      frontmatter: { scope: projectName },
    })
    const adr = writer.upsertNode({
      kind: 'adr', title: `ADR for ${projectName}`, path: `/adrs/${projectName}.md`,
      frontmatter: {
        title: `ADR-${projectName}`, context: 'c', options: 'o', decision: 'd',
        consequences: 'co', version: 1,
        tiefen: { summary: 's', context: 'c', alternatives: 'a', consequences: 'co' },
      },
    })
    writer.linkEdge({ src: adr.uid, dst: sub.uid })
    return { sub, adr }
  }

  it('adr_list without project_uid returns all ADRs', () => {
    createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'adr_list' })
    expect(result.count).toBe(2)
  })

  it('adr_list with project_uid filters to that subsystem scope', () => {
    const alpha = createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'adr_list', params: { project_uid: alpha.sub.uid } })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'ADR for alpha')
  })

  it('architect_summary without project_uid counts globally', () => {
    createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'architect_summary' })
    expect(result.rows[0]).toHaveProperty('adr_count', 2)
  })

  it('architect_summary with project_uid filters counts', () => {
    const alpha = createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'architect_summary', params: { project_uid: alpha.sub.uid } })
    expect(result.rows[0]).toHaveProperty('adr_count', 1)
  })
})
