/**
 * Phase E tests — Abstraction layer + Integration test.
 * CK-GRAPH-045, 047, 039
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { SqliteGraphBackend } from '../../src/main/graph/abstraction'
import { GraphWriter } from '../../src/main/graph/writer'

// -------------------------------------------------------------------
// Abstraction layer (CK-GRAPH-045)
// -------------------------------------------------------------------

describe('SqliteGraphBackend (CK-GRAPH-045)', () => {
  let db: Database.Database
  let backend: SqliteGraphBackend

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    backend = new SqliteGraphBackend(db)
  })

  afterEach(() => {
    try { backend.close() } catch { /* already closed */ }
  })

  it('insertNode + getNode roundtrip', () => {
    const node = {
      uid: 'TEST01',
      kind: 'note' as const,
      path: '/vault/test.md',
      title: 'Test Note',
      status: 'aktiv' as const,
      frontmatter: '{}',
      body: 'Test body content',
      content_hash: 'abc123',
      erstellt: '2026-06-05T10:00:00Z',
      abgeloest: null,
      natural_key: 'note:/vault/test.md'
    }
    backend.insertNode(node)
    const fetched = backend.getNode('TEST01')
    expect(fetched).not.toBeNull()
    expect(fetched!.title).toBe('Test Note')
    expect(fetched!.kind).toBe('note')
  })

  it('getNodeByNaturalKey', () => {
    backend.insertNode({
      uid: 'NK01', kind: 'artefakt', path: '/a.ts', title: 'A',
      status: 'aktiv', frontmatter: '{}', body: '', content_hash: '',
      erstellt: '2026-01-01', abgeloest: null, natural_key: 'artefakt:/a.ts'
    })
    const found = backend.getNodeByNaturalKey('artefakt:/a.ts')
    expect(found).not.toBeNull()
    expect(found!.uid).toBe('NK01')
  })

  it('updateNode', () => {
    backend.insertNode({
      uid: 'UP01', kind: 'note', path: '/n.md', title: 'Old',
      status: 'aktiv', frontmatter: '{}', body: '', content_hash: '',
      erstellt: '2026-01-01', abgeloest: null, natural_key: 'note:/n.md'
    })
    const node = backend.getNode('UP01')!
    backend.updateNode({ ...node, title: 'New' })
    expect(backend.getNode('UP01')!.title).toBe('New')
  })

  it('deleteNode', () => {
    backend.insertNode({
      uid: 'DEL01', kind: 'note', path: '/d.md', title: 'Del',
      status: 'aktiv', frontmatter: '{}', body: '', content_hash: '',
      erstellt: '2026-01-01', abgeloest: null, natural_key: 'note:/d.md'
    })
    backend.deleteNode('DEL01')
    expect(backend.getNode('DEL01')).toBeNull()
  })

  it('insertEdge + getEdge roundtrip', () => {
    for (const uid of ['E1', 'E2']) {
      backend.insertNode({
        uid, kind: 'note', path: `/${uid}.md`, title: uid,
        status: 'aktiv', frontmatter: '{}', body: '', content_hash: '',
        erstellt: '2026-01-01', abgeloest: null, natural_key: `note:/${uid}.md`
      })
    }
    const id = backend.insertEdge({
      src: 'E1', dst: 'E2', type: 'verweist_auf',
      source: 'wikilink', props: '{}', erstellt: '2026-01-01'
    })
    const edge = backend.getEdge('E1', 'E2', 'verweist_auf')
    expect(edge).not.toBeNull()
    expect(edge!.id).toBe(id)
  })

  it('getEdgesFrom + getEdgesTo', () => {
    for (const uid of ['F1', 'F2', 'F3']) {
      backend.insertNode({
        uid, kind: 'note', path: `/${uid}.md`, title: uid,
        status: 'aktiv', frontmatter: '{}', body: '', content_hash: '',
        erstellt: '2026-01-01', abgeloest: null, natural_key: `note:/${uid}.md`
      })
    }
    backend.insertEdge({ src: 'F1', dst: 'F2', type: 'verweist_auf', source: 'wikilink', props: '{}', erstellt: '2026-01-01' })
    backend.insertEdge({ src: 'F1', dst: 'F3', type: 'verweist_auf', source: 'wikilink', props: '{}', erstellt: '2026-01-01' })

    expect(backend.getEdgesFrom('F1')).toHaveLength(2)
    expect(backend.getEdgesTo('F2')).toHaveLength(1)
  })

  // --- FTS backend ---

  it('FTS index + search', () => {
    backend.fts.index('FTS1', 'Knowledge Graph', 'SQLite index architecture')
    backend.fts.index('FTS2', 'Voice Pipeline', 'Whisper STT local')

    const results = backend.fts.search('Knowledge', 10)
    expect(results).toHaveLength(1)
    expect(results[0].uid).toBe('FTS1')
  })

  it('FTS remove', () => {
    backend.fts.index('FTS3', 'Temp', 'temporary data')
    backend.fts.remove('FTS3')
    expect(backend.fts.search('Temp', 10)).toHaveLength(0)
  })

  // --- Vector backend ---

  it('vector storeChunks + search', () => {
    const dim = 384
    const v1 = new Float32Array(dim).fill(0.1)
    const v2 = new Float32Array(dim).fill(0.9)
    backend.vector.storeChunks('VEC1', [v1])
    backend.vector.storeChunks('VEC2', [v2])

    const query = new Float32Array(dim).fill(0.1) // closer to v1
    const results = backend.vector.search(query, 2)
    expect(results).toHaveLength(2)
    expect(results[0].node_uid).toBe('VEC1') // closest
  })

  it('vector removeChunks', () => {
    const dim = 384
    backend.vector.storeChunks('VDEL', [new Float32Array(dim).fill(0.5)])
    backend.vector.removeChunks('VDEL')
    const results = backend.vector.search(new Float32Array(dim).fill(0.5), 10)
    expect(results).toHaveLength(0)
  })
})

// -------------------------------------------------------------------
// Integration test
// -------------------------------------------------------------------

describe('Integration: full lifecycle', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => {
    if (db?.open) db.close()
  })

  it('create nodes, link edges, read, verify', () => {
    // 1. Create anforderung
    const anf = writer.upsertNode({
      kind: 'anforderung', title: 'Support 8 node types',
      path: '/reqs/R001.md', body: 'The graph must support 8 node types',
      frontmatter: { quelle: 'M1 Konzept', prioritaet: 'muss' }
    })
    expect(anf.created).toBe(true)

    // 2. Create entscheidung
    const ent = writer.upsertNode({
      kind: 'entscheidung', title: 'Use SQLite + sqlite-vec',
      path: '/entsch/E001.md', body: 'Decided to use SQLite as backend',
      frontmatter: { begruendung: 'Risk/license', alternativen: ['Kuzu', 'Neo4j'] }
    })
    expect(ent.created).toBe(true)

    // 3. Create artefakt
    const art = writer.upsertNode({
      kind: 'artefakt', title: 'schema.ts',
      path: '/src/main/graph/schema.ts', body: 'CREATE TABLE node ...',
      frontmatter: { sprache_art: 'TypeScript' }
    })

    // 4. Create test
    const tst = writer.upsertNode({
      kind: 'test', title: 'Phase A tests',
      path: '/tests/graph/phase-a.test.ts',
      frontmatter: { testart: 'unit', ergebnis: 'pass' }
    })

    // 5. Create anlass
    const anl = writer.upsertNode({
      kind: 'anlass', title: 'BT-1a Session',
      path: '/sessions/bt-1a.md',
      frontmatter: { session: 'bt-1a', zeitpunkt: '2026-06-05T10:00:00Z' }
    })

    // 6. Link edges
    const e1 = writer.linkEdge({ src: ent.uid, dst: anf.uid })
    expect(e1.type).toBe('begruendet')

    const e2 = writer.linkEdge({ src: art.uid, dst: anf.uid })
    expect(e2.type).toBe('setzt_um')

    const e3 = writer.linkEdge({ src: art.uid, dst: ent.uid })
    expect(e3.type).toBe('setzt_um')

    const e4 = writer.linkEdge({ src: tst.uid, dst: anf.uid })
    expect(e4.type).toBe('verifiziert')

    const e5 = writer.linkEdge({ src: art.uid, dst: anl.uid })
    expect(e5.type).toBe('erzeugt_von')

    // 7. Verify: all nodes exist
    const nodeCount = db.prepare('SELECT COUNT(*) as c FROM node').get() as { c: number }
    expect(nodeCount.c).toBe(5)

    // 8. Verify: all edges exist
    const edgeCount = db.prepare('SELECT COUNT(*) as c FROM edge').get() as { c: number }
    expect(edgeCount.c).toBe(5)

    // 9. Verify: FTS works
    const ftsResults = db.prepare(
      `SELECT uid FROM node_fts WHERE node_fts MATCH 'SQLite'`
    ).all() as { uid: string }[]
    expect(ftsResults.length).toBeGreaterThanOrEqual(1)

    // 10. Verify: read back a node
    const readBack = db.prepare('SELECT * FROM node WHERE uid = ?').get(anf.uid) as { title: string; kind: string; status: string }
    expect(readBack.title).toBe('Support 8 node types')
    expect(readBack.kind).toBe('anforderung')
    expect(readBack.status).toBe('aktiv')

    // 11. Verify: traverse herkunfts-kette (artefakt setzt_um anforderung + entscheidung)
    const chain = db.prepare(`
      SELECT n.title, e.type FROM edge e
      JOIN node n ON n.uid = e.dst
      WHERE e.src = ? AND e.type = 'setzt_um'
    `).all(art.uid) as { title: string; type: string }[]
    expect(chain).toHaveLength(2)
  })

  it('rebuild: delete DB, re-insert, same state', () => {
    const r1 = writer.upsertNode({ kind: 'note', title: 'Persistent', path: '/n.md', body: 'content' })
    const before = db.prepare('SELECT uid, title FROM node WHERE uid = ?').get(r1.uid) as { uid: string; title: string }

    // "Rebuild": wipe index
    db.prepare('DELETE FROM node_fts').run()
    db.prepare('DELETE FROM edge').run()
    db.prepare('DELETE FROM node').run()

    // Re-upsert — same natural key = same uid
    const r2 = writer.upsertNode({ kind: 'note', title: 'Persistent', path: '/n.md', body: 'content' })
    expect(r2.uid).toBe(r1.uid)

    const after = db.prepare('SELECT uid, title FROM node WHERE uid = ?').get(r2.uid) as { uid: string; title: string }
    expect(after.title).toBe(before.title)
  })
})

// -------------------------------------------------------------------
// Negative constraints (CK-GRAPH-047, CK-GRAPH-039)
// -------------------------------------------------------------------

describe('Negative constraints', () => {
  it('CK-GRAPH-047: no communication primitives in GraphWriter', () => {
    const writerProto = Object.getOwnPropertyNames(GraphWriter.prototype)
    expect(writerProto).not.toContain('sendMessage')
    expect(writerProto).not.toContain('notifySession')
    expect(writerProto).not.toContain('broadcast')
  })

  it('CK-GRAPH-039: no semantic extraction methods in backend', () => {
    const proto = Object.getOwnPropertyNames(SqliteGraphBackend.prototype)
    expect(proto).not.toContain('extractEntities')
    expect(proto).not.toContain('extractRelations')
    expect(proto).not.toContain('inferTriples')
  })
})
