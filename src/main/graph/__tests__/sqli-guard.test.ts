/**
 * sqli-guard.test.ts — Verify that edge_type SQL injection is blocked
 * in graphExpand (F-ADV-001) and graphQuery/reverse_trace (F-ADV-002).
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { graphExpand } from '../search'
import { graphQuery } from '../query'
import type { EdgeType } from '../edge-types'

function setupDb(): Database.Database {
  const db = new Database(':memory:')

  db.exec(`
    CREATE TABLE node (
      uid           TEXT PRIMARY KEY NOT NULL,
      kind          TEXT NOT NULL,
      path          TEXT,
      title         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'aktiv',
      frontmatter   TEXT NOT NULL DEFAULT '{}',
      body          TEXT NOT NULL DEFAULT '',
      content_hash  TEXT NOT NULL DEFAULT '',
      erstellt      TEXT NOT NULL,
      abgeloest     TEXT,
      natural_key   TEXT UNIQUE
    )
  `)

  db.exec(`
    CREATE TABLE edge (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      src       TEXT NOT NULL REFERENCES node(uid),
      dst       TEXT NOT NULL REFERENCES node(uid),
      type      TEXT NOT NULL,
      source    TEXT NOT NULL DEFAULT 'frontmatter',
      props     TEXT NOT NULL DEFAULT '{}',
      erstellt  TEXT NOT NULL,
      UNIQUE(src, dst, type)
    )
  `)

  // Seed data
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO node (uid, kind, title, status, erstellt) VALUES (?, ?, ?, ?, ?)`
  ).run('n1', 'anforderung', 'Node A', 'aktiv', now)

  db.prepare(
    `INSERT INTO node (uid, kind, title, status, erstellt) VALUES (?, ?, ?, ?, ?)`
  ).run('n2', 'artefakt', 'Node B', 'aktiv', now)

  db.prepare(
    `INSERT INTO edge (src, dst, type, source, erstellt) VALUES (?, ?, ?, ?, ?)`
  ).run('n1', 'n2', 'setzt_um', 'frontmatter', now)

  return db
}

describe('SQL injection guards', () => {
  let db: Database.Database

  beforeEach(() => {
    db = setupDb()
  })

  // -- F-ADV-001: graphExpand ------------------------------------------------

  it('graphExpand rejects malicious edge_type', () => {
    expect(() =>
      graphExpand(db, { uid: 'n1', edge_type: "'; DROP TABLE node; --" as EdgeType })
    ).toThrow(/Invalid edge_type/)
  })

  it('graphExpand rejects unknown edge_type', () => {
    expect(() =>
      graphExpand(db, { uid: 'n1', edge_type: 'not_a_real_type' as EdgeType })
    ).toThrow(/Invalid edge_type/)
  })

  it('graphExpand accepts valid edge_type', () => {
    const result = graphExpand(db, { uid: 'n1', edge_type: 'setzt_um' })
    expect(result).toBeDefined()
    expect(result.neighbors.length).toBeGreaterThanOrEqual(0)
  })

  it('graphExpand works without edge_type filter', () => {
    const result = graphExpand(db, { uid: 'n1' })
    expect(result).toBeDefined()
  })

  // -- F-ADV-002: graphQuery reverse_trace -----------------------------------

  it('reverse_trace rejects malicious edge_type', () => {
    expect(() =>
      graphQuery(db, {
        template: 'reverse_trace',
        params: { uid: 'n2', edge_type: "'; DROP TABLE node; --" },
      })
    ).toThrow(/Invalid edge_type/)
  })

  it('reverse_trace rejects unknown edge_type', () => {
    expect(() =>
      graphQuery(db, {
        template: 'reverse_trace',
        params: { uid: 'n2', edge_type: 'fake_type' },
      })
    ).toThrow(/Invalid edge_type/)
  })

  it('reverse_trace accepts valid edge_type', () => {
    const result = graphQuery(db, {
      template: 'reverse_trace',
      params: { uid: 'n2', edge_type: 'setzt_um' },
    })
    expect(result).toBeDefined()
    expect(result.template).toBe('reverse_trace')
  })

  it('reverse_trace works without edge_type', () => {
    const result = graphQuery(db, {
      template: 'reverse_trace',
      params: { uid: 'n2' },
    })
    expect(result).toBeDefined()
  })
})
