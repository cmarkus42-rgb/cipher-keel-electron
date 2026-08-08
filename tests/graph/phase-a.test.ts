/**
 * Phase A tests — DB Foundation.
 * CK-GRAPH-001, 002, 028, 038, 043, 044
 */

import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../../src/main/graph/schema'
import { openGraphDb } from '../../src/main/graph/db'
import { deterministicUlid, freshUlid, isValidUlid, naturalKey } from '../../src/main/graph/uid'

// -------------------------------------------------------------------
// db.ts + schema.ts
// -------------------------------------------------------------------

describe('openGraphDb', () => {
  let db: Database.Database

  afterEach(() => { if (db?.open) db.close() })

  it('creates all four tables (CK-GRAPH-038)', () => {
    db = openGraphDb({ path: ':memory:' })
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name`
    ).all() as { name: string }[]).map((r) => r.name)

    expect(tables).toContain('node')
    expect(tables).toContain('edge')
    // Virtual tables show up in sqlite_master too
    const allNames = (db.prepare(
      `SELECT name FROM sqlite_master ORDER BY name`
    ).all() as { name: string }[]).map((r) => r.name)
    expect(allNames.some((n: string) => n.startsWith('vec_chunks'))).toBe(true)
    expect(allNames.some((n: string) => n.startsWith('node_fts'))).toBe(true)
  })

  it('enables foreign keys', () => {
    db = openGraphDb({ path: ':memory:' })
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
  })

  it('loads sqlite-vec extension (CK-GRAPH-002)', () => {
    db = openGraphDb({ path: ':memory:' })
    const row = db.prepare('SELECT vec_version() as v').get() as { v: string }
    expect(row.v).toMatch(/^v\d+/)
  })

  it('node table has correct columns (CK-GRAPH-011)', () => {
    db = openGraphDb({ path: ':memory:' })
    const cols = (db.prepare(`PRAGMA table_info(node)`).all() as { name: string }[]).map((c) => c.name)
    for (const col of ['uid', 'kind', 'path', 'title', 'status', 'frontmatter', 'body', 'content_hash', 'erstellt', 'abgeloest', 'natural_key']) {
      expect(cols).toContain(col)
    }
  })

  it('edge table has correct columns (CK-GRAPH-015)', () => {
    db = openGraphDb({ path: ':memory:' })
    const cols = (db.prepare(`PRAGMA table_info(edge)`).all() as { name: string }[]).map((c) => c.name)
    for (const col of ['id', 'src', 'dst', 'type', 'source', 'props', 'erstellt']) {
      expect(cols).toContain(col)
    }
  })

  it('node status CHECK constraint works', () => {
    db = openGraphDb({ path: ':memory:' })
    expect(() => {
      db.prepare(`INSERT INTO node (uid, kind, title, status, erstellt) VALUES ('x','test','t','INVALID','2026-01-01')`)
        .run()
    }).toThrow()
  })

  it('edge source CHECK constraint works (CK-GRAPH-046)', () => {
    db = openGraphDb({ path: ':memory:' })
    // Insert two nodes first
    db.prepare(`INSERT INTO node (uid, kind, title, status, erstellt) VALUES ('a','test','A','aktiv','2026-01-01')`).run()
    db.prepare(`INSERT INTO node (uid, kind, title, status, erstellt) VALUES ('b','test','B','aktiv','2026-01-01')`).run()
    expect(() => {
      db.prepare(`INSERT INTO edge (src, dst, type, source, erstellt) VALUES ('a','b','verweist_auf','INVALID','2026-01-01')`)
        .run()
    }).toThrow()
  })

  it('FTS5 search works (CK-GRAPH-043)', () => {
    db = openGraphDb({ path: ':memory:' })
    db.prepare(`INSERT INTO node_fts (uid, title, body) VALUES ('n1', 'Knowledge Graph Foundation', 'SQLite as derived index')`).run()
    db.prepare(`INSERT INTO node_fts (uid, title, body) VALUES ('n2', 'Voice Pipeline', 'Whisper local STT')`).run()

    const results = db.prepare(`SELECT uid, rank FROM node_fts WHERE node_fts MATCH 'SQLite' ORDER BY rank`).all() as { uid: string; rank: number }[]
    expect(results).toHaveLength(1)
    expect(results[0].uid).toBe('n1')
  })

  it('schema is idempotent (double apply)', () => {
    db = openGraphDb({ path: ':memory:' })
    // Apply again — should not throw
    applySchema(db)
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE name = 'node'`).all()
    expect(tables).toHaveLength(1)
  })
})

// -------------------------------------------------------------------
// uid.ts
// -------------------------------------------------------------------

describe('deterministicUlid (CK-GRAPH-044)', () => {
  it('produces valid 26-char ULID', () => {
    const uid = deterministicUlid('test:my/path.md')
    expect(uid).toHaveLength(26)
    expect(isValidUlid(uid)).toBe(true)
  })

  it('is deterministic — same key → same uid', () => {
    const a = deterministicUlid('artefakt:/vault/src/main.ts')
    const b = deterministicUlid('artefakt:/vault/src/main.ts')
    expect(a).toBe(b)
  })

  it('different keys → different uids', () => {
    const a = deterministicUlid('artefakt:/vault/a.ts')
    const b = deterministicUlid('artefakt:/vault/b.ts')
    expect(a).not.toBe(b)
  })
})

describe('freshUlid', () => {
  it('produces valid 26-char ULID', () => {
    const uid = freshUlid()
    expect(uid).toHaveLength(26)
    expect(isValidUlid(uid)).toBe(true)
  })

  it('two calls produce different uids', () => {
    const a = freshUlid()
    const b = freshUlid()
    expect(a).not.toBe(b)
  })
})

describe('isValidUlid', () => {
  it('accepts valid ULID', () => {
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true)
  })
  it('rejects too short', () => {
    expect(isValidUlid('01ARZ3NDEK')).toBe(false)
  })
  it('rejects invalid chars (I, L, O, U)', () => {
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false)
  })
})

describe('naturalKey (CK-GRAPH-012)', () => {
  it('vault-path types use path', () => {
    const key = naturalKey('anforderung', { path: '/vault/reqs/R001.md' })
    expect(key).toBe('anforderung:/vault/reqs/R001.md')
  })

  it('anlass uses session + zeitpunkt', () => {
    const key = naturalKey('anlass', { session: 'sess-42', zeitpunkt: '2026-06-01T10:00:00Z' })
    expect(key).toBe('anlass:sess-42:2026-06-01T10:00:00Z')
  })

  it('github_repo uses url', () => {
    const key = naturalKey('github_repo', { url: 'https://github.com/cipher/keel' })
    expect(key).toBe('github_repo:https://github.com/cipher/keel')
  })

  it('throws when required field is missing', () => {
    expect(() => naturalKey('anforderung', {})).toThrow('requires path')
    expect(() => naturalKey('anlass', { session: 's' })).toThrow('requires session + zeitpunkt')
    expect(() => naturalKey('github_repo', {})).toThrow('requires url')
  })
})
