/**
 * schema.ts — CREATE TABLE statements for the Knowledge Graph index.
 *
 * CK-GRAPH-038: Three table groups — Kern (node, edge), Vektor (vec_chunks), Volltext (node_fts).
 * CK-GRAPH-011: Core attributes on every node (uid, kind, path, title, status, frontmatter, content_hash, erstellt, abgeloest).
 * CK-GRAPH-015: Edge table with src, dst, type, source, props, erstellt.
 * CK-GRAPH-002: sqlite-vec virtual table for vector search.
 * CK-GRAPH-043: FTS5 virtual table for full-text search over title + body.
 */

import type Database from 'better-sqlite3'

/** Default embedding dimension — placeholder until embedding model is chosen. */
export const DEFAULT_EMBEDDING_DIM = 384

/**
 * Apply the full graph schema to an open database.
 * Idempotent: uses IF NOT EXISTS throughout.
 */
export function applySchema(db: Database.Database, embeddingDim = DEFAULT_EMBEDDING_DIM): void {
  // -- Kern: node --
  db.exec(`
    CREATE TABLE IF NOT EXISTS node (
      uid           TEXT PRIMARY KEY NOT NULL,
      kind          TEXT NOT NULL,
      path          TEXT,
      title         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'aktiv'
                    CHECK (status IN ('aktiv', 'abgeloest', 'verworfen')),
      frontmatter   TEXT NOT NULL DEFAULT '{}',
      body          TEXT NOT NULL DEFAULT '',
      content_hash  TEXT NOT NULL DEFAULT '',
      erstellt      TEXT NOT NULL,
      abgeloest     TEXT,
      natural_key   TEXT UNIQUE
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_node_kind   ON node (kind)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_node_status ON node (status)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_node_path   ON node (path)`)

  // -- Kern: edge --
  db.exec(`
    CREATE TABLE IF NOT EXISTS edge (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      src       TEXT NOT NULL REFERENCES node(uid),
      dst       TEXT NOT NULL REFERENCES node(uid),
      type      TEXT NOT NULL,
      source    TEXT NOT NULL DEFAULT 'frontmatter'
                CHECK (source IN ('wikilink', 'frontmatter', 'inferred')),
      props     TEXT NOT NULL DEFAULT '{}',
      erstellt  TEXT NOT NULL,
      UNIQUE(src, dst, type)
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_edge_src  ON edge (src)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_edge_dst  ON edge (dst)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_edge_type ON edge (type)`)

  // -- Vektor: vec_chunks (sqlite-vec virtual table) --
  // CK-GRAPH-002: Embeddings per chunk, KNN search.
  // sqlite-vec must be loaded before this statement.
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(` +
    `node_uid TEXT NOT NULL, ` +
    `chunk_idx INTEGER NOT NULL, ` +
    `embedding float[${embeddingDim}]` +
    `)`
  )

  // -- Volltext: node_fts (FTS5 virtual table) --
  // CK-GRAPH-043: Full-text search over title + body with BM25 ranking.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS node_fts USING fts5(
      uid UNINDEXED,
      title,
      body
    )
  `)
}
