/**
 * chunking.ts — Chunking pipeline and embedding integration.
 *
 * CK-GRAPH-031: Vault files chunked for vector search, embeddings from local model.
 * CK-GRAPH-032: Token-sparende Performance — progressive disclosure + frontloading.
 *
 * The chunking pipeline splits node body text into chunks, which are then
 * embedded by a local model. This module provides the chunking logic and
 * the integration point for the embedding model.
 *
 * Embedding model is pluggable — inject via EmbeddingProvider interface.
 * Default: no-op provider (returns zero vectors) for testing/bootstrap.
 */

import type Database from 'better-sqlite3'
import { GraphWriter } from './writer'

// ---------------------------------------------------------------------------
// Embedding provider interface
// ---------------------------------------------------------------------------

/**
 * Interface for local embedding models.
 *
 * CK-GRAPH-031: Must be local (no API dependency). Concrete model choice
 * is a build-session decision; this interface enables pluggability.
 */
export interface EmbeddingProvider {
  readonly dimension: number
  embed(text: string): Float32Array
  embedBatch(texts: string[]): Float32Array[]
}

/**
 * No-op embedding provider for testing and bootstrap.
 * Returns zero vectors of the configured dimension.
 */
export class NoopEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number

  constructor(dimension = 384) {
    this.dimension = dimension
  }

  embed(_text: string): Float32Array {
    return new Float32Array(this.dimension)
  }

  embedBatch(texts: string[]): Float32Array[] {
    return texts.map(() => new Float32Array(this.dimension))
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /** Max characters per chunk. Default 500. */
  maxChunkSize?: number
  /** Overlap between chunks in characters. Default 50. */
  overlap?: number
}

export interface Chunk {
  index: number
  text: string
  startOffset: number
  endOffset: number
}

/**
 * Split text into overlapping chunks for embedding.
 *
 * CK-GRAPH-031: Chunking granularity is configurable for load testing.
 * Splits on paragraph boundaries where possible, falls back to character limit.
 */
export function chunkText(text: string, options?: ChunkOptions): Chunk[] {
  const maxSize = options?.maxChunkSize ?? 500
  const overlap = options?.overlap ?? 50

  if (!text || text.trim().length === 0) return []

  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)

  const chunks: Chunk[] = []
  let currentChunk = ''
  let currentStart = 0
  let offset = 0

  for (const para of paragraphs) {
    const paraWithSep = para + '\n\n'

    if (currentChunk.length + paraWithSep.length > maxSize && currentChunk.length > 0) {
      // Emit current chunk
      chunks.push({
        index: chunks.length,
        text: currentChunk.trim(),
        startOffset: currentStart,
        endOffset: offset
      })

      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-overlap)
      currentStart = offset - overlapText.length
      currentChunk = overlapText + paraWithSep
    } else {
      if (currentChunk.length === 0) currentStart = offset
      currentChunk += paraWithSep
    }

    offset += paraWithSep.length
  }

  // Emit last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      index: chunks.length,
      text: currentChunk.trim(),
      startOffset: currentStart,
      endOffset: offset
    })
  }

  return chunks
}

// ---------------------------------------------------------------------------
// Index node with embeddings
// ---------------------------------------------------------------------------

/**
 * Chunk and embed a node's body, storing results in vec_chunks.
 *
 * CK-GRAPH-031: Embeddings created during index run.
 */
export function indexNodeEmbeddings(
  db: Database.Database,
  nodeUid: string,
  body: string,
  provider: EmbeddingProvider,
  options?: ChunkOptions
): number {
  const chunks = chunkText(body, options)
  if (chunks.length === 0) return 0

  // Remove existing chunks
  db.prepare('DELETE FROM vec_chunks WHERE node_uid = ?').run(nodeUid)

  // Embed and store
  const texts = chunks.map(c => c.text)
  const embeddings = provider.embedBatch(texts)

  const insert = db.prepare(
    'INSERT INTO vec_chunks (node_uid, chunk_idx, embedding) VALUES (?, ?, ?)'
  )

  for (let i = 0; i < chunks.length; i++) {
    insert.run(nodeUid, String(i), Buffer.from(embeddings[i].buffer))
  }

  return chunks.length
}

// ---------------------------------------------------------------------------
// Summary node lifecycle (CK-GRAPH-027, CK-GRAPH-032)
// ---------------------------------------------------------------------------

export interface SummaryScope {
  /** Node uid that this summary covers (e.g., a phase_subsystem). */
  scopeUid: string
  /** Title for the summary node. */
  title: string
  /** The summarized text (generated externally by helper instance). */
  summaryText: string
}

/**
 * Create or update a summary node for a scope.
 *
 * CK-GRAPH-027: Summary nodes are note-kind nodes with notetyp='summary'.
 * CK-GRAPH-032: Token-sparend — summaries serve as frontloading cache.
 *
 * Returns the uid of the summary node.
 */
export function upsertSummaryNode(
  db: Database.Database,
  scope: SummaryScope
): string {
  const writer = new GraphWriter(db)

  const path = `_summaries/${scope.scopeUid}.md`
  const result = writer.upsertNode({
    kind: 'note',
    title: scope.title,
    path,
    body: scope.summaryText,
    frontmatter: { notetyp: 'summary', scope_uid: scope.scopeUid }
  })

  // Link summary → scope via verweist_auf
  try {
    writer.linkEdge({ src: result.uid, dst: scope.scopeUid })
  } catch { /* scope node might not exist yet */ }

  return result.uid
}

/**
 * Get all summary nodes, optionally filtered by scope.
 */
export function getSummaryNodes(
  db: Database.Database,
  scopeUid?: string
): { uid: string; title: string; scopeUid: string; body: string }[] {
  const baseQuery = `
    SELECT uid, title, body, json_extract(frontmatter, '$.scope_uid') as scope_uid
    FROM node
    WHERE kind = 'note'
      AND json_extract(frontmatter, '$.notetyp') = 'summary'
      AND status = 'aktiv'
  `

  if (scopeUid) {
    return db.prepare(baseQuery + ` AND json_extract(frontmatter, '$.scope_uid') = ?`)
      .all(scopeUid) as any[]
  }
  return db.prepare(baseQuery).all() as any[]
}

// ---------------------------------------------------------------------------
// Herkunfts-Kette helpers (CK-GRAPH-035)
// ---------------------------------------------------------------------------

export interface TraceStep {
  uid: string
  kind: string
  title: string
  depth: number
  edgeType: string | null
}

/**
 * Trace the full provenance chain backwards from a node.
 *
 * CK-GRAPH-035: artefakt → entscheidung → anforderung → root anforderung.
 * Returns the chain as an ordered array of steps.
 */
export function traceHerkunft(db: Database.Database, uid: string, maxDepth = 10): TraceStep[] {
  const sql = `
    WITH RECURSIVE kette(uid, kind, title, depth, edge_type) AS (
      SELECT uid, kind, title, 0, NULL
      FROM node WHERE uid = ?

      UNION ALL

      SELECT n.uid, n.kind, n.title, k.depth + 1, e.type
      FROM kette k
      JOIN edge e ON e.src = k.uid
      JOIN node n ON n.uid = e.dst
      WHERE k.depth < ?
        AND e.type IN ('setzt_um', 'begruendet', 'verfeinert', 'verifiziert', 'erzeugt_von')
    )
    SELECT uid, kind, title, depth, edge_type as edgeType
    FROM kette
    ORDER BY depth
  `

  return db.prepare(sql).all(uid, maxDepth) as TraceStep[]
}

/**
 * Find broken traceability chains — nodes without a complete path to a root anforderung.
 *
 * CK-GRAPH-040: Gate query helper.
 */
export function findBrokenChains(
  db: Database.Database,
  kind?: string
): { uid: string; title: string; kind: string; missingEdge: string }[] {
  const results: { uid: string; title: string; kind: string; missingEdge: string }[] = []

  // Artefakte without setzt_um
  if (!kind || kind === 'artefakt') {
    const unlinked = db.prepare(`
      SELECT n.uid, n.title, n.kind
      FROM node n
      WHERE n.kind = 'artefakt' AND n.status = 'aktiv'
        AND NOT EXISTS (
          SELECT 1 FROM edge e WHERE e.src = n.uid AND e.type = 'setzt_um'
        )
    `).all() as { uid: string; title: string; kind: string }[]

    for (const n of unlinked) {
      results.push({ ...n, missingEdge: 'setzt_um' })
    }
  }

  // Entscheidungen without begruendet
  if (!kind || kind === 'entscheidung') {
    const unlinked = db.prepare(`
      SELECT n.uid, n.title, n.kind
      FROM node n
      WHERE n.kind = 'entscheidung' AND n.status = 'aktiv'
        AND NOT EXISTS (
          SELECT 1 FROM edge e WHERE e.src = n.uid AND e.type = 'begruendet'
        )
    `).all() as { uid: string; title: string; kind: string }[]

    for (const n of unlinked) {
      results.push({ ...n, missingEdge: 'begruendet' })
    }
  }

  // Tests without verifiziert
  if (!kind || kind === 'test') {
    const unlinked = db.prepare(`
      SELECT n.uid, n.title, n.kind
      FROM node n
      WHERE n.kind = 'test' AND n.status = 'aktiv'
        AND NOT EXISTS (
          SELECT 1 FROM edge e WHERE e.src = n.uid AND e.type = 'verifiziert'
        )
    `).all() as { uid: string; title: string; kind: string }[]

    for (const n of unlinked) {
      results.push({ ...n, missingEdge: 'verifiziert' })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Maintenance helper interface (CK-GRAPH-048)
// ---------------------------------------------------------------------------

/**
 * Interface for maintenance helper instances.
 *
 * CK-GRAPH-048: M1 defines THAT the graph offers maintenance operations and WHICH;
 * WHO provides the helper instances is M2/M5 concern. This interface is the contract.
 */
export interface MaintenanceHelper {
  /** Generate a summary for a set of node bodies. */
  summarize(bodies: string[]): Promise<string>
  /** Detect duplicates among a set of titles. */
  detectDuplicates(titles: string[]): Promise<{ group: number; titles: string[] }[]>
}
