// tests/phase4-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import { deriveProfile } from '../src/main/graph/access-profile'
import { ARCHITECT_RAHMEN, createArchitectRahmen } from '../src/main/preset/architect/architect-preset'
import { CF_RAHMEN, createCfRahmen } from '../src/main/preset/cyber-factory/cf-preset'
import { getArchitectCapabilities } from '../src/main/preset/architect/architect-capabilities'
import { getCfCapabilities } from '../src/main/preset/cyber-factory/cf-capabilities'
import { buildWellePlan } from '../src/main/preset/cyber-factory/cf-welle-plan'
import { routeModel } from '../src/main/preset/cyber-factory/cf-model-routing'
import { createRiskReview } from '../src/main/preset/cyber-factory/cf-risk-review'
import { reportArchitekturBruch } from '../src/main/preset/cyber-factory/cf-rueckweg'
import { assembleEntityClaudeMd } from '../src/main/session/assemble-entity'
import { validatePresetRahmen } from '../src/main/preset/schema'
import { CapabilityNiveau } from '../src/main/preset/niveau'
import type Database from 'better-sqlite3'

describe('Phase 4 Integration', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('Architect gets read:wide write:full via graphAnbindung override', () => {
    const profile = deriveProfile(ARCHITECT_RAHMEN)
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })

  it('CF gets read:wide write:full via graphAnbindung override', () => {
    const profile = deriveProfile(CF_RAHMEN)
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })

  it('full Architect-CF workflow: decompose → plan → build → review', () => {
    // Phase
    const phase = writer.upsertNode({
      kind: 'phase', title: 'Development', path: '/phases/dev',
      frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
    })

    // Architect: create subsystems
    const subA = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'authentication', komplexitaet: 'business_logic' },
    })
    const subB = writer.upsertNode({
      kind: 'phase_subsystem', title: 'API', path: '/sub/api',
      frontmatter: { scope: 'api', komplexitaet: 'trivial' },
    })
    writer.linkEdge({ src: subB.uid, dst: subA.uid, type: 'haengt_ab_von' })

    // Architect: create ADR
    writer.upsertNode({
      kind: 'adr', title: 'REST API', path: '/adrs/rest.md',
      frontmatter: {
        title: 'REST', context: 'c', options: 'o', decision: 'd',
        consequences: 'co', version: 1,
        tiefen: { summary: 's', context: 'c', alternatives: 'a', consequences: 'co' },
      },
    })

    // Architect: create packages
    writer.upsertNode({
      kind: 'anforderungspaket', title: 'Auth Pkg', path: '/pkg/auth',
      frontmatter: {
        subsystem: subA.uid, req_ids: ['R-1'], code_anker: ['src/auth.ts'],
        akzeptanzkriterium: 'Login works', testcase_verweis: 'T-1',
      },
    })
    writer.upsertNode({
      kind: 'anforderungspaket', title: 'API Pkg', path: '/pkg/api',
      frontmatter: {
        subsystem: subB.uid, req_ids: ['R-2'], code_anker: ['src/api.ts'],
        akzeptanzkriterium: 'Endpoints respond', testcase_verweis: 'T-2',
      },
    })

    // CF: build wave plan
    const plan = buildWellePlan(db, 5)
    expect(plan.wellen.length).toBeGreaterThanOrEqual(2)

    // CF: model routing
    expect(routeModel('business_logic', CapabilityNiveau.A)).toBe('standard')
    expect(routeModel('trivial', CapabilityNiveau.A)).toBe('light')

    // CF: risk review after wave
    const review = createRiskReview(writer, {
      phaseUid: phase.uid,
      risiko: 'Test coverage gap',
      wahrscheinlichkeit: 'mittel',
      impact: 'mittel',
      massnahme: 'Add integration tests',
      befundStatement: 'Medium risk: test coverage gap in auth module',
    })
    expect(review.uid).toHaveLength(26)

    // Verify queries work end-to-end
    expect(graphQuery(db, { template: 'adr_list' }).count).toBe(1)
    expect(graphQuery(db, { template: 'anforderungspakete' }).count).toBe(2)
    expect(graphQuery(db, { template: 'risk_reviews' }).count).toBe(1)
  })

  it('Coaching loop: CF question → Architect answer', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })

    // CF writes question
    const frage = writer.upsertNode({
      kind: 'frage_knoten', title: 'Error format?', path: '/coaching/q1.md',
      frontmatter: { subsystem: sub.uid, frage: 'JSON or plain text errors?', worker_id: 'w1', status: 'offen' },
    })

    // Verify open question visible
    const open = graphQuery(db, { template: 'offene_fragen' })
    expect(open.count).toBe(1)

    // Architect answers
    const antwort = writer.upsertNode({
      kind: 'antwort_knoten', title: 'Error answer', path: '/coaching/a1.md',
      frontmatter: { frage_uid: frage.uid, antwort: 'JSON with error code', architect_session: 'arch-1' },
    })
    writer.linkEdge({ src: antwort.uid, dst: frage.uid })

    // Update frage status
    writer.upsertNode({
      kind: 'frage_knoten', title: 'Error format?', path: '/coaching/q1.md',
      frontmatter: { subsystem: sub.uid, frage: 'JSON or plain text errors?', worker_id: 'w1', status: 'beantwortet' },
    })

    // Verify coaching history
    const history = graphQuery(db, { template: 'coaching_historie', params: { subsystem: sub.uid } })
    expect(history.count).toBeGreaterThanOrEqual(1)

    // Verify no more open questions
    const stillOpen = graphQuery(db, { template: 'offene_fragen' })
    expect(stillOpen.count).toBe(0)
  })

  it('all preset configs valid across all niveaus', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      expect(validatePresetRahmen(createArchitectRahmen(n)).valid).toBe(true)
      expect(validatePresetRahmen(createCfRahmen(n)).valid).toBe(true)
    }
  })
})
