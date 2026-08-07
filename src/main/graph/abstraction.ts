/**
 * abstraction.ts — Backend abstraction layer for the Knowledge Graph.
 *
 * CK-GRAPH-045: sqlite-vec is pre-1.0 — this layer must enable a backend switch.
 *               Re-index from vault produces identical graph regardless of vec backend.
 *               Abstraction interface defined as TypeScript interface.
 *
 * CK-GRAPH-047: NEGATIVE CONSTRAINT — Graph is NOT a communication channel.
 *               Communication between sessions runs via handoffs that reference
 *               graph-woven artifacts. No "send message" or "notify session" primitives.
 *               See: konzepte/03-m1-knowledge-graph_v1.0.md Abschnitt 2, 7.
 *
 * CK-GRAPH-039: ARCHITECTURE DECISION — No separate semantic extraction layer.
 *               v1.0 is a pure artifact graph + full-text + vector search.
 *               No GraphRAG/Zep/Mem0-style extraction (Entscheidung 1).
 *               The layer is retrofittable without breaking the core.
 *               See: konzepte/03-m1-knowledge-graph_v1.0.md Abschnitt 3.1.
 */

import type { NodeKind, NodeStatus } from './node-types'
import type { EdgeType, EdgeSource } from './edge-types'

// ---------------------------------------------------------------------------
// Vector search abstraction (CK-GRAPH-045)
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  node_uid: string
  chunk_idx: string
  distance: number
}

export interface VectorBackend {
  /**
   * Store embedding chunks for a node.
   * Replaces all existing chunks for that node.
   */
  storeChunks(nodeUid: string, embeddings: Float32Array[]): void

  /**
   * Remove all chunks for a node.
   */
  removeChunks(nodeUid: string): void

  /**
   * KNN search: find the k nearest chunks to the query vector.
   */
  search(queryEmbedding: Float32Array, k: number): VectorSearchResult[]
}

// ---------------------------------------------------------------------------
// Full-text search abstraction
// ---------------------------------------------------------------------------

export interface FtsSearchResult {
  uid: string
  rank: number
}

export interface FtsBackend {
  /** Index a node's title + body for full-text search. */
  index(uid: string, title: string, body: string): void

  /** Remove a node from the FTS index. */
  remove(uid: string): void

  /** Full-text search with BM25 ranking. */
  search(query: string, limit: number): FtsSearchResult[]
}

// ---------------------------------------------------------------------------
// Node storage abstraction
// ---------------------------------------------------------------------------

export interface NodeRecord {
  uid: string
  kind: NodeKind
  path: string | null
  title: string
  status: NodeStatus
  frontmatter: string
  body: string
  content_hash: string
  erstellt: string
  abgeloest: string | null
  natural_key: string | null
}

export interface EdgeRecord {
  id: number
  src: string
  dst: string
  type: EdgeType
  source: EdgeSource
  props: string
  erstellt: string
}

export interface NodeStorageBackend {
  getNode(uid: string): NodeRecord | null
  getNodeByNaturalKey(naturalKey: string): NodeRecord | null
  insertNode(node: NodeRecord): void
  updateNode(node: NodeRecord): void
  deleteNode(uid: string): void

  getEdge(src: string, dst: string, type: EdgeType): EdgeRecord | null
  insertEdge(edge: Omit<EdgeRecord, 'id'>): number
  getEdgesFrom(uid: string, typeFilter?: EdgeType): EdgeRecord[]
  getEdgesTo(uid: string, typeFilter?: EdgeType): EdgeRecord[]
  deleteEdge(id: number): void
}

// ---------------------------------------------------------------------------
// Composite graph backend
// ---------------------------------------------------------------------------

/**
 * The GraphBackend interface abstracts ALL storage and search operations.
 *
 * CK-GRAPH-045: A backend switch (e.g., replacing sqlite-vec with an ANN index)
 * only requires implementing this interface — no vault schema or data is affected.
 */
export interface GraphBackend extends NodeStorageBackend {
  readonly vector: VectorBackend
  readonly fts: FtsBackend

  /** Close the backend and release resources. */
  close(): void
}

// ---------------------------------------------------------------------------
// SQLite implementation of GraphBackend
// ---------------------------------------------------------------------------

import type Database from 'better-sqlite3'

export class SqliteGraphBackend implements GraphBackend {
  private db: Database.Database
  readonly vector: VectorBackend
  readonly fts: FtsBackend

  constructor(db: Database.Database) {
    this.db = db
    this.vector = new SqliteVecBackend(db)
    this.fts = new SqliteFtsBackend(db)
  }

  close(): void {
    this.db.close()
  }

  // -- Node operations --

  getNode(uid: string): NodeRecord | null {
    return (this.db.prepare('SELECT * FROM node WHERE uid = ?').get(uid) as NodeRecord) ?? null
  }

  getNodeByNaturalKey(naturalKey: string): NodeRecord | null {
    return (this.db.prepare('SELECT * FROM node WHERE natural_key = ?').get(naturalKey) as NodeRecord) ?? null
  }

  insertNode(node: NodeRecord): void {
    this.db.prepare(`
      INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt, abgeloest, natural_key)
      VALUES (@uid, @kind, @path, @title, @status, @frontmatter, @body, @content_hash, @erstellt, @abgeloest, @natural_key)
    `).run(node)
  }

  updateNode(node: NodeRecord): void {
    this.db.prepare(`
      UPDATE node SET kind=@kind, path=@path, title=@title, status=@status, frontmatter=@frontmatter,
        body=@body, content_hash=@content_hash, abgeloest=@abgeloest, natural_key=@natural_key
      WHERE uid=@uid
    `).run(node)
  }

  deleteNode(uid: string): void {
    this.db.prepare('DELETE FROM node WHERE uid = ?').run(uid)
  }

  // -- Edge operations --

  getEdge(src: string, dst: string, type: EdgeType): EdgeRecord | null {
    return (this.db.prepare('SELECT * FROM edge WHERE src=? AND dst=? AND type=?').get(src, dst, type) as EdgeRecord) ?? null
  }

  insertEdge(edge: Omit<EdgeRecord, 'id'>): number {
    const info = this.db.prepare(`
      INSERT INTO edge (src, dst, type, source, props, erstellt)
      VALUES (@src, @dst, @type, @source, @props, @erstellt)
    `).run(edge)
    return Number(info.lastInsertRowid)
  }

  getEdgesFrom(uid: string, typeFilter?: EdgeType): EdgeRecord[] {
    if (typeFilter) {
      return this.db.prepare('SELECT * FROM edge WHERE src=? AND type=?').all(uid, typeFilter) as EdgeRecord[]
    }
    return this.db.prepare('SELECT * FROM edge WHERE src=?').all(uid) as EdgeRecord[]
  }

  getEdgesTo(uid: string, typeFilter?: EdgeType): EdgeRecord[] {
    if (typeFilter) {
      return this.db.prepare('SELECT * FROM edge WHERE dst=? AND type=?').all(uid, typeFilter) as EdgeRecord[]
    }
    return this.db.prepare('SELECT * FROM edge WHERE dst=?').all(uid) as EdgeRecord[]
  }

  deleteEdge(id: number): void {
    this.db.prepare('DELETE FROM edge WHERE id = ?').run(id)
  }
}

// ---------------------------------------------------------------------------
// SQLite-vec vector backend
// ---------------------------------------------------------------------------

class SqliteVecBackend implements VectorBackend {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  storeChunks(nodeUid: string, embeddings: Float32Array[]): void {
    this.removeChunks(nodeUid)
    const insert = this.db.prepare(
      'INSERT INTO vec_chunks (node_uid, chunk_idx, embedding) VALUES (?, ?, ?)'
    )
    for (let i = 0; i < embeddings.length; i++) {
      insert.run(nodeUid, String(i), Buffer.from(embeddings[i].buffer))
    }
  }

  removeChunks(nodeUid: string): void {
    this.db.prepare('DELETE FROM vec_chunks WHERE node_uid = ?').run(nodeUid)
  }

  search(queryEmbedding: Float32Array, k: number): VectorSearchResult[] {
    return this.db.prepare(`
      SELECT node_uid, chunk_idx, distance
      FROM vec_chunks
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(Buffer.from(queryEmbedding.buffer), k) as VectorSearchResult[]
  }
}

// ---------------------------------------------------------------------------
// SQLite FTS5 backend
// ---------------------------------------------------------------------------

class SqliteFtsBackend implements FtsBackend {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  index(uid: string, title: string, body: string): void {
    this.remove(uid)
    this.db.prepare('INSERT INTO node_fts (uid, title, body) VALUES (?, ?, ?)').run(uid, title, body)
  }

  remove(uid: string): void {
    this.db.prepare('DELETE FROM node_fts WHERE uid = ?').run(uid)
  }

  search(query: string, limit: number): FtsSearchResult[] {
    return this.db.prepare(`
      SELECT uid, rank FROM node_fts
      WHERE node_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as FtsSearchResult[]
  }
}
