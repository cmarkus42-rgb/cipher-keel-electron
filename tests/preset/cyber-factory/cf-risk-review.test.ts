// tests/preset/cyber-factory/cf-risk-review.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../../src/main/graph/db'
import { GraphWriter } from '../../../src/main/graph/writer'
import { createRiskReview } from '../../../src/main/preset/cyber-factory/cf-risk-review'
import { graphQuery } from '../../../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('CF Risk Review (CK-P3CF-005)', () => {
  let db: Database.Database
  let writer: GraphWriter
  let phaseUid: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
    const phase = writer.upsertNode({
      kind: 'phase', title: 'Development', path: '/phases/dev',
      frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
    })
    phaseUid = phase.uid
  })

  afterEach(() => { db?.open && db.close() })

  it('creates gate_befund with gate_typ risk-review', () => {
    const result = createRiskReview(writer, {
      phaseUid,
      risiko: 'Token leak via logs',
      wahrscheinlichkeit: 'niedrig',
      impact: 'hoch',
      massnahme: 'Scrub tokens from log output',
      befundStatement: 'Low probability high impact token leak risk',
    })
    expect(result.uid).toHaveLength(26)

    const reviews = graphQuery(db, { template: 'risk_reviews' })
    expect(reviews.count).toBe(1)
  })

  it('rejects befund_statement over 200 tokens', () => {
    const longStatement = 'word '.repeat(250)
    expect(() => createRiskReview(writer, {
      phaseUid,
      risiko: 'X',
      wahrscheinlichkeit: 'niedrig',
      impact: 'niedrig',
      massnahme: 'Y',
      befundStatement: longStatement,
    })).toThrow(/200/)
  })
})
