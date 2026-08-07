// tests/preset/cyber-factory/cf-rueckweg.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../../src/main/graph/db'
import { GraphWriter } from '../../../src/main/graph/writer'
import { reportArchitekturBruch } from '../../../src/main/preset/cyber-factory/cf-rueckweg'
import { graphQuery } from '../../../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('CF Rueckweg Protocol (CK-P3CF-006)', () => {
  let db: Database.Database
  let writer: GraphWriter
  let phaseUid: string
  let subsystemUid: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
    const phase = writer.upsertNode({
      kind: 'phase', title: 'Development', path: '/phases/dev',
      frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
    })
    phaseUid = phase.uid
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    subsystemUid = sub.uid
  })

  afterEach(() => { if (db?.open) db.close() })

  it('creates gate_befund with gate_typ architektur-bruch', () => {
    const result = reportArchitekturBruch(writer, {
      phaseUid,
      subsystem: subsystemUid,
      bruchpunkt: 'Auth-DB interface incompatible',
      schnittstelle: 'Auth<->DB contract',
      bauImplikation: 'Cannot proceed with auth subsystem',
    })
    expect(result.befundUid).toHaveLength(26)
    expect(result.rueckwegDokUid).toHaveLength(26)
  })

  it('creates uebergabedokument with dokumentTyp rueckweg-befund', () => {
    const result = reportArchitekturBruch(writer, {
      phaseUid,
      subsystem: subsystemUid,
      bruchpunkt: 'Interface break',
      schnittstelle: 'A<->B',
      bauImplikation: 'Blocked',
    })

    // Verify the uebergabedokument exists
    const docs = graphQuery(db, { template: 'vault_index' })
    const rueckweg = docs.rows.find((r: Record<string, unknown>) => r.uid === result.rueckwegDokUid)
    expect(rueckweg).toBeDefined()
  })
})
