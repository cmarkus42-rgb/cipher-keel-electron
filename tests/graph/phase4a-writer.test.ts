import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter, SchemaError } from '../../src/main/graph/writer'
import type Database from 'better-sqlite3'

describe('GraphWriter — Phase 4a NodeKinds', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { if (db?.open) db.close() })

  it('creates adr node with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'adr',
      title: 'Use REST over gRPC',
      path: '/adrs/adr-001.md',
      frontmatter: {
        title: 'Use REST over gRPC',
        context: 'We need an API protocol',
        options: 'REST vs gRPC vs GraphQL',
        decision: 'REST for simplicity',
        consequences: 'Slower binary but simpler tooling',
        tiefen: { summary: 'REST chosen', context: 'full ctx', alternatives: 'gRPC, GraphQL', consequences: 'simpler' },
        version: 1,
      },
    })
    expect(result.created).toBe(true)
    expect(result.uid).toHaveLength(26)
  })

  it('rejects adr node missing required field', () => {
    expect(() => writer.upsertNode({
      kind: 'adr',
      title: 'Incomplete',
      path: '/adrs/bad.md',
      frontmatter: { title: 'Incomplete' },
    })).toThrow()
  })

  it('creates schnittstellen_vertrag with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'schnittstellen_vertrag',
      title: 'Auth-DB Contract',
      path: '/contracts/auth-db.md',
      frontmatter: {
        subsystem_a: 'uid-auth',
        subsystem_b: 'uid-db',
        input_schema: '{ userId: string }',
        output_schema: '{ user: User | null }',
        fehlerverhalten: '404 if not found, 500 on DB error',
        template_version: '1.0',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates anforderungspaket with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'anforderungspaket',
      title: 'Auth Subsystem Package',
      path: '/packages/auth.md',
      frontmatter: {
        subsystem: 'uid-auth',
        req_ids: ['REQ-001', 'REQ-002'],
        code_anker: ['src/auth/login.ts:handleLogin'],
        akzeptanzkriterium: 'Login returns JWT on valid credentials',
        testcase_verweis: 'T-AUTH.1',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates anforderungspaket with optional niveau_c_extrakt', () => {
    const result = writer.upsertNode({
      kind: 'anforderungspaket',
      title: 'Auth Package C',
      path: '/packages/auth-c.md',
      frontmatter: {
        subsystem: 'uid-auth',
        req_ids: ['REQ-001'],
        code_anker: ['src/auth/login.ts'],
        akzeptanzkriterium: 'Login works',
        testcase_verweis: 'T-AUTH.1',
        niveau_c_extrakt: 'Implement login endpoint returning JWT',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates frage_knoten with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'frage_knoten',
      title: 'Auth error handling unclear',
      path: '/coaching/q-001.md',
      frontmatter: {
        subsystem: 'uid-auth',
        frage: 'Should auth errors return 401 or 403?',
        worker_id: 'worker-a1',
        status: 'offen',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates antwort_knoten with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'antwort_knoten',
      title: 'Auth error answer',
      path: '/coaching/a-001.md',
      frontmatter: {
        frage_uid: '01ABCDEF',
        antwort: '401 for invalid credentials, 403 for insufficient permissions',
        architect_session: 'session-arch-01',
      },
    })
    expect(result.created).toBe(true)
  })

  it('links adr to subsystem with adr_fuer edge', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem',
      title: 'Auth Subsystem',
      path: '/subsystems/auth',
      frontmatter: {},
    })
    const adr = writer.upsertNode({
      kind: 'adr',
      title: 'REST API',
      path: '/adrs/rest.md',
      frontmatter: {
        title: 'REST', context: 'c', options: 'o', decision: 'd',
        consequences: 'co', tiefen: { summary: 's', context: 'c', alternatives: 'a', consequences: 'co' },
        version: 1,
      },
    })
    const edge = writer.linkEdge({ src: adr.uid, dst: sub.uid })
    expect(edge.type).toBe('adr_fuer')
    expect(edge.created).toBe(true)
  })

  it('rejects frage_knoten with invalid frontmatter status', () => {
    expect(() => writer.upsertNode({
      kind: 'frage_knoten',
      title: 'Bad status question',
      path: '/coaching/q-bad.md',
      frontmatter: {
        subsystem: 'uid-auth',
        frage: 'Is this valid?',
        worker_id: 'worker-a1',
        status: 'ungueltig',
      },
    })).toThrow(SchemaError)
  })

  it('links antwort to frage with beantwortet edge', () => {
    const frage = writer.upsertNode({
      kind: 'frage_knoten',
      title: 'Q1',
      path: '/coaching/q1.md',
      frontmatter: { subsystem: 'uid-a', frage: 'why?', worker_id: 'w1', status: 'offen' },
    })
    const antwort = writer.upsertNode({
      kind: 'antwort_knoten',
      title: 'A1',
      path: '/coaching/a1.md',
      frontmatter: { frage_uid: frage.uid, antwort: 'because', architect_session: 's1' },
    })
    const edge = writer.linkEdge({ src: antwort.uid, dst: frage.uid })
    expect(edge.type).toBe('beantwortet')
    expect(edge.created).toBe(true)
  })
})
