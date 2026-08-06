/**
 * db.ts — SQLite database setup for the Knowledge Graph index.
 *
 * CK-GRAPH-001: SQLite as derived index — discardable, rebuildable from vault.
 * CK-GRAPH-028: WAL mode, all writes through Single-Writer-Queue.
 * CK-GRAPH-002: sqlite-vec extension for vector search.
 * CK-GRAPH-043: FTS5 for full-text search (built into SQLite, no extension needed).
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { applySchema, DEFAULT_EMBEDDING_DIM } from './schema'

export interface OpenDbOptions {
  /** Path to the SQLite file. Use ':memory:' for tests. */
  path: string
  /** Embedding vector dimension. Default 384. */
  embeddingDim?: number
  /**
   * Explicit path to the better-sqlite3 native addon. Set under Electron, where the
   * default lookup would find the Node-ABI build. Omit to use default resolution.
   */
  nativeBinding?: string
}

/**
 * Open (or create) the graph database with all required configuration.
 *
 * Steps:
 *   1. Open SQLite database
 *   2. Enable WAL mode (CK-GRAPH-028)
 *   3. Enable foreign keys
 *   4. Load sqlite-vec extension (CK-GRAPH-002)
 *   5. Apply full schema (CK-GRAPH-038)
 */
export function openGraphDb(opts: OpenDbOptions): Database.Database {
  const db = opts.nativeBinding
    ? new Database(opts.path, { nativeBinding: opts.nativeBinding })
    : new Database(opts.path)

  // CK-GRAPH-028: WAL mode — parallel reads don't block, single writer serializes.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // CK-GRAPH-002: Load sqlite-vec extension for vec0 virtual tables.
  sqliteVec.load(db)

  // CK-GRAPH-038: Apply schema (node, edge, vec_chunks, node_fts).
  applySchema(db, opts.embeddingDim ?? DEFAULT_EMBEDDING_DIM)

  return db
}
