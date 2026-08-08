// tests/preset/cyber-factory/cf-welle-plan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../../src/main/graph/db'
import { GraphWriter } from '../../../src/main/graph/writer'
import { buildWellePlan } from '../../../src/main/preset/cyber-factory/cf-welle-plan'
import type Database from 'better-sqlite3'

describe('CF Welle Plan (CK-P3CF-002)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { if (db?.open) db.close() })

  function createSubsystem(name: string, path: string) {
    return writer.upsertNode({
      kind: 'phase_subsystem', title: name, path,
      frontmatter: { scope: name.toLowerCase() },
    })
  }

  function createDependency(from: string, to: string) {
    writer.linkEdge({ src: from, dst: to, type: 'haengt_ab_von' })
  }

  function createPackage(subsystemUid: string, title: string, path: string) {
    writer.upsertNode({
      kind: 'anforderungspaket', title, path,
      frontmatter: {
        subsystem: subsystemUid, req_ids: ['R-1'], code_anker: ['src/x.ts'],
        akzeptanzkriterium: 'Works', testcase_verweis: 'T-1',
      },
    })
  }

  it('builds single-wave plan for independent subsystems', () => {
    const a = createSubsystem('Auth', '/sub/auth')
    const b = createSubsystem('DB', '/sub/db')
    createPackage(a.uid, 'Auth Pkg', '/pkg/auth')
    createPackage(b.uid, 'DB Pkg', '/pkg/db')

    const plan = buildWellePlan(db, 5)
    expect(plan.wellen).toHaveLength(1)
    expect(plan.wellen[0].slots).toHaveLength(2)
  })

  it('respects dependencies — dependent subsystem in later wave', () => {
    const a = createSubsystem('Foundation', '/sub/found')
    const b = createSubsystem('Business', '/sub/biz')
    createDependency(b.uid, a.uid)  // Business depends on Foundation
    createPackage(a.uid, 'Found Pkg', '/pkg/found')
    createPackage(b.uid, 'Biz Pkg', '/pkg/biz')

    const plan = buildWellePlan(db, 5)
    expect(plan.wellen).toHaveLength(2)
    // Foundation in wave 1, Business in wave 2
    expect(plan.wellen[0].slots.some(s => s.subsystemTitle === 'Foundation')).toBe(true)
    expect(plan.wellen[1].slots.some(s => s.subsystemTitle === 'Business')).toBe(true)
  })

  it('respects max workers capacity', () => {
    const subs = Array.from({ length: 4 }, (_, i) =>
      createSubsystem(`Sub${i}`, `/sub/s${i}`)
    )
    for (const s of subs) createPackage(s.uid, `Pkg ${s.uid}`, `/pkg/${s.uid}`)

    const plan = buildWellePlan(db, 2)  // max 2 workers
    expect(plan.wellen).toHaveLength(2)
    expect(plan.wellen[0].slots).toHaveLength(2)
    expect(plan.wellen[1].slots).toHaveLength(2)
  })

  it('returns empty plan when no subsystems exist', () => {
    const plan = buildWellePlan(db, 5)
    expect(plan.wellen).toHaveLength(0)
  })

  it('treats maxWorkers <= 0 as 1 (guard against infinite loop)', () => {
    const a = createSubsystem('Auth', '/sub/auth')
    createPackage(a.uid, 'Auth Pkg', '/pkg/auth')

    const plan = buildWellePlan(db, 0)
    expect(plan.wellen).toHaveLength(1)
    expect(plan.wellen[0].slots).toHaveLength(1)
  })
})
