/**
 * Phase D tests — Write path + Constraints.
 * CK-GRAPH-012, 013, 014, 028
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter, SchemaError, ConflictError } from '../../src/main/graph/writer'

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  if (db?.open) db.close()
})

// -------------------------------------------------------------------
// Schema validation (CK-GRAPH-013)
// -------------------------------------------------------------------

describe('Schema validation (CK-GRAPH-013)', () => {
  it('rejects unknown kind', () => {
    expect(() => writer.upsertNode({
      kind: 'widget',
      title: 'X',
      path: '/test'
    })).toThrow(SchemaError)
  })

  it('rejects missing title', () => {
    expect(() => writer.upsertNode({
      kind: 'note',
      title: '',
      path: '/test'
    })).toThrow(SchemaError)
  })

  it('rejects invalid status', () => {
    expect(() => writer.upsertNode({
      kind: 'note',
      title: 'T',
      path: '/test',
      status: 'archived'
    })).toThrow(SchemaError)
  })

  it('rejects github_repo without url in frontmatter', () => {
    expect(() => writer.upsertNode({
      kind: 'github_repo',
      title: 'Repo',
      url: 'https://github.com/a/b',
      frontmatter: {} // missing url
    })).toThrow(SchemaError)
  })

  it('error message names the missing field', () => {
    try {
      writer.upsertNode({ kind: 'github_repo', title: 'R', frontmatter: {} })
      expect.fail('Should have thrown')
    } catch (e: any) {
      expect(e.message).toContain('url')
    }
  })
})

// -------------------------------------------------------------------
// Idempotent upsert (CK-GRAPH-012)
// -------------------------------------------------------------------

describe('Idempotent upsert (CK-GRAPH-012)', () => {
  it('double upsert creates exactly one node', () => {
    const r1 = writer.upsertNode({ kind: 'note', title: 'A', path: '/vault/a.md' })
    const r2 = writer.upsertNode({ kind: 'note', title: 'A updated', path: '/vault/a.md' })

    expect(r1.created).toBe(true)
    expect(r2.created).toBe(false)
    expect(r1.uid).toBe(r2.uid)

    const count = db.prepare('SELECT COUNT(*) as c FROM node').get() as any
    expect(count.c).toBe(1)
  })

  it('second upsert returns same uid', () => {
    const r1 = writer.upsertNode({ kind: 'artefakt', title: 'B', path: '/vault/b.ts' })
    const r2 = writer.upsertNode({ kind: 'artefakt', title: 'B v2', path: '/vault/b.ts' })
    expect(r1.uid).toBe(r2.uid)
  })

  it('different paths create different nodes', () => {
    const r1 = writer.upsertNode({ kind: 'note', title: 'A', path: '/vault/a.md' })
    const r2 = writer.upsertNode({ kind: 'note', title: 'B', path: '/vault/b.md' })
    expect(r1.uid).not.toBe(r2.uid)
  })
})

// -------------------------------------------------------------------
// Node creation for all 8 types
// -------------------------------------------------------------------

describe('All 8 node types can be created', () => {
  it('anforderung', () => {
    const r = writer.upsertNode({ kind: 'anforderung', title: 'R1', path: '/reqs/R1.md', frontmatter: { quelle: 'User' } })
    expect(r.created).toBe(true)
  })

  it('entscheidung', () => {
    const r = writer.upsertNode({ kind: 'entscheidung', title: 'E1', path: '/entsch/E1.md', frontmatter: { begruendung: 'Weil' } })
    expect(r.created).toBe(true)
  })

  it('artefakt', () => {
    const r = writer.upsertNode({ kind: 'artefakt', title: 'A1', path: '/src/a.ts', frontmatter: { sprache_art: 'TypeScript' } })
    expect(r.created).toBe(true)
  })

  it('test', () => {
    const r = writer.upsertNode({ kind: 'test', title: 'T1', path: '/tests/t1.ts', frontmatter: { testart: 'unit' } })
    expect(r.created).toBe(true)
  })

  it('note', () => {
    const r = writer.upsertNode({ kind: 'note', title: 'N1', path: '/brain/n1.md' })
    expect(r.created).toBe(true)
  })

  it('phase_subsystem', () => {
    const r = writer.upsertNode({ kind: 'phase_subsystem', title: 'P1', path: '/phases/p1.md', frontmatter: { ebene: 'phase' } })
    expect(r.created).toBe(true)
  })

  it('anlass', () => {
    const r = writer.upsertNode({
      kind: 'anlass', title: 'Session 1', path: '/sessions/s1.md',
      frontmatter: { session: 'sess-1', zeitpunkt: '2026-06-01T10:00:00Z' }
    })
    expect(r.created).toBe(true)
  })

  it('github_repo', () => {
    const r = writer.upsertNode({
      kind: 'github_repo', title: 'cipher/keel',
      frontmatter: {
        url: 'https://github.com/cipher/keel',
        owner: 'cipher',
        name: 'keel',
        repo_id: '123456',
        default_branch: 'main',
        visibility: 'private',
        linked_at: '2026-06-05T00:00:00Z'
      }
    })
    expect(r.created).toBe(true)
  })
})

// -------------------------------------------------------------------
// Edge linking (CK-GRAPH-015, CK-GRAPH-017)
// -------------------------------------------------------------------

describe('Edge linking', () => {
  let anfUid: string
  let artUid: string

  beforeEach(() => {
    anfUid = writer.upsertNode({ kind: 'anforderung', title: 'R1', path: '/r1.md' }).uid
    artUid = writer.upsertNode({ kind: 'artefakt', title: 'A1', path: '/a1.ts' }).uid
  })

  it('derives edge type from pair (CK-GRAPH-017)', () => {
    const r = writer.linkEdge({ src: artUid, dst: anfUid })
    expect(r.type).toBe('setzt_um')
    expect(r.created).toBe(true)
  })

  it('accepts explicit edge type', () => {
    const r = writer.linkEdge({ src: artUid, dst: anfUid, type: 'verweist_auf' })
    expect(r.type).toBe('verweist_auf')
  })

  it('rejects non-existent source node', () => {
    expect(() => writer.linkEdge({ src: 'NONEXISTENT', dst: anfUid }))
      .toThrow(SchemaError)
  })

  it('rejects non-existent destination node', () => {
    expect(() => writer.linkEdge({ src: anfUid, dst: 'NONEXISTENT' }))
      .toThrow(SchemaError)
  })

  it('rejects unknown edge type', () => {
    expect(() => writer.linkEdge({ src: artUid, dst: anfUid, type: 'depends_on' }))
      .toThrow(SchemaError)
  })

  it('rejects mismatched typed edge', () => {
    expect(() => writer.linkEdge({ src: artUid, dst: anfUid, type: 'verfeinert' }))
      .toThrow(SchemaError)
  })

  it('idempotent — duplicate edge returns existing', () => {
    const r1 = writer.linkEdge({ src: artUid, dst: anfUid })
    const r2 = writer.linkEdge({ src: artUid, dst: anfUid })
    expect(r1.id).toBe(r2.id)
    expect(r2.created).toBe(false)
  })
})

// -------------------------------------------------------------------
// Conflict detection for entscheidung (CK-GRAPH-014)
// -------------------------------------------------------------------

describe('Entscheidung conflict detection (CK-GRAPH-014)', () => {
  it('detects conflicting active entscheidung for same anforderung', () => {
    const anf = writer.upsertNode({ kind: 'anforderung', title: 'R1', path: '/r1.md' })
    const e1 = writer.upsertNode({
      kind: 'entscheidung', title: 'E1', path: '/e1.md',
      frontmatter: { anforderung_uid: anf.uid }
    })
    // Link e1 → anf as begruendet
    writer.linkEdge({ src: e1.uid, dst: anf.uid, type: 'begruendet' })

    // Second entscheidung for same anforderung should throw ConflictError
    expect(() => writer.upsertNode({
      kind: 'entscheidung', title: 'E2', path: '/e2.md',
      frontmatter: { anforderung_uid: anf.uid }
    })).toThrow(ConflictError)
  })

  it('allows entscheidung without anforderung_uid', () => {
    // No conflict check when no anforderung_uid
    const r = writer.upsertNode({ kind: 'entscheidung', title: 'E1', path: '/e1.md' })
    expect(r.created).toBe(true)
  })
})

// -------------------------------------------------------------------
// deleteNode
// -------------------------------------------------------------------

describe('deleteNode', () => {
  it('deletes node, edges, and FTS entry', () => {
    const anf = writer.upsertNode({ kind: 'anforderung', title: 'R1', path: '/r1.md' })
    const art = writer.upsertNode({ kind: 'artefakt', title: 'A1', path: '/a1.ts' })
    writer.linkEdge({ src: art.uid, dst: anf.uid })

    const result = writer.deleteNode(anf.uid)
    expect(result.deleted).toBe(true)

    // Node is gone
    const node = db.prepare('SELECT uid FROM node WHERE uid = ?').get(anf.uid)
    expect(node).toBeUndefined()

    // Edges referencing the deleted node are gone
    const edges = db.prepare('SELECT id FROM edge WHERE src = ? OR dst = ?').all(anf.uid, anf.uid)
    expect(edges).toHaveLength(0)

    // FTS entry is gone
    const fts = db.prepare(`SELECT uid FROM node_fts WHERE uid = ?`).all(anf.uid)
    expect(fts).toHaveLength(0)

    // The other node still exists
    const other = db.prepare('SELECT uid FROM node WHERE uid = ?').get(art.uid)
    expect(other).toBeDefined()
  })

  it('returns deleted: false for non-existent uid', () => {
    const result = writer.deleteNode('NONEXISTENT')
    expect(result.deleted).toBe(false)
  })
})

// -------------------------------------------------------------------
// FTS sync
// -------------------------------------------------------------------

describe('FTS sync', () => {
  it('inserted node is searchable via FTS', () => {
    writer.upsertNode({ kind: 'note', title: 'Knowledge Graph', path: '/n.md', body: 'SQLite index' })
    const results = db.prepare(`SELECT uid FROM node_fts WHERE node_fts MATCH 'Knowledge'`).all() as any[]
    expect(results).toHaveLength(1)
  })

  it('updated node updates FTS', () => {
    writer.upsertNode({ kind: 'note', title: 'Old Title', path: '/n.md', body: 'old body' })
    writer.upsertNode({ kind: 'note', title: 'New Title', path: '/n.md', body: 'new body' })

    const oldResults = db.prepare(`SELECT uid FROM node_fts WHERE node_fts MATCH 'Old'`).all()
    const newResults = db.prepare(`SELECT uid FROM node_fts WHERE node_fts MATCH 'New'`).all()
    expect(oldResults).toHaveLength(0)
    expect(newResults).toHaveLength(1)
  })
})
