/**
 * search.ts — MCP-Tool functions for graph search, node lookup, and expansion.
 *
 * CK-GRAPH-018: graph_search — Score-Fusion FTS5 + sqlite-vec, Progressive Disclosure.
 * CK-GRAPH-019: graph_get_node — Full node by uid.
 * CK-GRAPH-020: graph_expand — Neighborhood expansion with edge-type filter.
 * CK-GRAPH-042: Score-Fusion via Reciprocal Rank Fusion (RRF).
 * CK-GRAPH-036: Recursive CTEs for multi-step traversal.
 * CK-NFR-011:   Token-sparend — compact results, <2000 tokens for 10 hits.
 */

import type Database from 'better-sqlite3'
import type { NodeKind, NodeStatus } from './node-types'
import { isValidEdgeType, type EdgeType, type EdgeSource } from './edge-types'

// ---------------------------------------------------------------------------
// Result types — Progressive Disclosure (CK-GRAPH-018, CK-NFR-011)
// ---------------------------------------------------------------------------

/** Compact search hit — no full body, no frontmatter detail. */
export interface SearchHit {
  uid: string
  kind: NodeKind
  title: string
  score: number
}

/** Full node record as returned by graph_get_node. */
export interface FullNode {
  uid: string
  kind: NodeKind
  path: string | null
  title: string
  status: NodeStatus
  frontmatter: Record<string, unknown>
  body: string
  content_hash: string
  erstellt: string
  abgeloest: string | null
}

/** Edge as returned alongside expanded nodes. */
export interface ExpandEdge {
  src: string
  dst: string
  type: EdgeType
  source: EdgeSource
}

/** A node in an expansion result, with the edge that led to it. */
export interface ExpandHit {
  uid: string
  kind: NodeKind
  title: string
  depth: number
  edge: ExpandEdge
}

export interface ExpandResult {
  origin: string
  depth: number
  neighbors: ExpandHit[]
}

// ---------------------------------------------------------------------------
// Score Fusion — Reciprocal Rank Fusion (CK-GRAPH-042)
//
// RRF merges two ranked lists into one:
//   score(d) = 1/(k + rank_fts(d)) + 1/(k + rank_vec(d))
// k = 60 is the standard constant (Cormack et al. 2009).
// Documented, not black-box.
// ---------------------------------------------------------------------------

const RRF_K = 60

interface RankedItem {
  uid: string
  ftsRank?: number   // 1-based rank in FTS results (undefined = absent)
  vecRank?: number   // 1-based rank in vec results (undefined = absent)
}

function reciprocalRankFusion(items: RankedItem[]): Map<string, number> {
  const scores = new Map<string, number>()
  for (const item of items) {
    let score = 0
    if (item.ftsRank !== undefined) score += 1 / (RRF_K + item.ftsRank)
    if (item.vecRank !== undefined) score += 1 / (RRF_K + item.vecRank)
    scores.set(item.uid, score)
  }
  return scores
}

// ---------------------------------------------------------------------------
// graph_search (CK-GRAPH-018)
// ---------------------------------------------------------------------------

export interface SearchParams {
  query: string
  /** Max results. Default 10. */
  limit?: number
  /** Filter by node kind. */
  kind?: NodeKind
  /** Query embedding for vector search. If omitted, FTS-only. */
  embedding?: Float32Array
}

/**
 * Search the graph with score fusion (FTS5 + sqlite-vec).
 *
 * Progressive Disclosure: returns compact hits (uid, kind, title, score).
 * Use graph_get_node to load full details.
 *
 * Score is Reciprocal Rank Fusion (RRF) of FTS5 BM25 rank and
 * sqlite-vec distance rank. If only one source is available, the
 * score degrades gracefully to single-source RRF.
 */
export function graphSearch(db: Database.Database, params: SearchParams): SearchHit[] {
  const limit = params.limit ?? 10
  const fetchLimit = limit * 3 // Over-fetch for fusion

  // --- FTS5 results ---
  const ftsHits: { uid: string; rank: number }[] = []
  if (params.query.trim()) {
    const ftsQuery = params.kind
      ? `SELECT f.uid, f.rank FROM node_fts f
         JOIN node n ON n.uid = f.uid
         WHERE node_fts MATCH ? AND n.kind = ?
         ORDER BY f.rank LIMIT ?`
      : `SELECT uid, rank FROM node_fts
         WHERE node_fts MATCH ?
         ORDER BY rank LIMIT ?`

    try {
      const ftsArgs = params.kind
        ? [params.query, params.kind, fetchLimit]
        : [params.query, fetchLimit]
      const rows = db.prepare(ftsQuery).all(...ftsArgs) as { uid: string; rank: number }[]
      ftsHits.push(...rows)
    } catch {
      // FTS5 query syntax error — treat as no FTS results
    }
  }

  // --- Vector results ---
  const vecHits: { uid: string; distance: number }[] = []
  if (params.embedding) {
    const vecQuery = params.kind
      ? `SELECT v.node_uid, v.distance FROM vec_chunks v
         JOIN node n ON n.uid = v.node_uid
         WHERE v.embedding MATCH ? AND n.kind = ?
         ORDER BY v.distance LIMIT ?`
      : `SELECT node_uid, distance FROM vec_chunks
         WHERE embedding MATCH ?
         ORDER BY distance LIMIT ?`

    try {
      const buf = Buffer.from(params.embedding.buffer)
      const vecArgs = params.kind
        ? [buf, params.kind, fetchLimit]
        : [buf, fetchLimit]
      const rows = db.prepare(vecQuery).all(...vecArgs) as { node_uid: string; distance: number }[]
      // Deduplicate by node_uid (multiple chunks per node)
      const seen = new Set<string>()
      for (const r of rows) {
        if (!seen.has(r.node_uid)) {
          seen.add(r.node_uid)
          vecHits.push({ uid: r.node_uid, distance: r.distance })
        }
      }
    } catch {
      // vec search error — degrade to FTS-only
    }
  }

  // --- No results from either source ---
  if (ftsHits.length === 0 && vecHits.length === 0) return []

  // --- Build ranked items for RRF ---
  const uidSet = new Map<string, RankedItem>()

  for (let i = 0; i < ftsHits.length; i++) {
    const uid = ftsHits[i].uid
    if (!uidSet.has(uid)) uidSet.set(uid, { uid })
    uidSet.get(uid)!.ftsRank = i + 1
  }

  for (let i = 0; i < vecHits.length; i++) {
    const uid = vecHits[i].uid
    if (!uidSet.has(uid)) uidSet.set(uid, { uid })
    uidSet.get(uid)!.vecRank = i + 1
  }

  const scores = reciprocalRankFusion([...uidSet.values()])

  // --- Sort by fused score, descending ---
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)

  // --- Fetch compact node data ---
  const getNode = db.prepare('SELECT uid, kind, title FROM node WHERE uid = ?')
  const results: SearchHit[] = []
  for (const [uid, score] of sorted) {
    const row = getNode.get(uid) as { uid: string; kind: NodeKind; title: string } | undefined
    if (row) {
      results.push({ uid: row.uid, kind: row.kind, title: row.title, score })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// graph_get_node (CK-GRAPH-019)
// ---------------------------------------------------------------------------

/**
 * Load a full node by uid. Returns null if not found.
 */
export function graphGetNode(db: Database.Database, uid: string): FullNode | null {
  const row = db.prepare('SELECT * FROM node WHERE uid = ?').get(uid) as {
    uid: string; kind: string; path: string | null; title: string;
    status: string; frontmatter: string; body: string;
    content_hash: string; erstellt: string; abgeloest: string | null;
  } | undefined

  if (!row) return null

  let fm: Record<string, unknown>
  try { fm = JSON.parse(row.frontmatter) } catch { fm = {} }

  return {
    uid: row.uid,
    kind: row.kind as NodeKind,
    path: row.path,
    title: row.title,
    status: row.status as NodeStatus,
    frontmatter: fm,
    body: row.body,
    content_hash: row.content_hash,
    erstellt: row.erstellt,
    abgeloest: row.abgeloest
  }
}

// ---------------------------------------------------------------------------
// graph_expand (CK-GRAPH-020, CK-GRAPH-036)
// ---------------------------------------------------------------------------

/** Max allowed depth for expansion. */
const MAX_EXPAND_DEPTH = 5

export interface ExpandParams {
  uid: string
  /** Max expansion depth. Capped at 5. Default 1. */
  depth?: number
  /** Filter by edge type. */
  edge_type?: EdgeType
  /** Direction: 'outgoing' | 'incoming' | 'both'. Default 'both'. */
  direction?: 'outgoing' | 'incoming' | 'both'
}

/**
 * Expand the neighborhood of a node using recursive CTEs.
 *
 * Returns neighbors up to the given depth, optionally filtered by edge type.
 * Depth is capped at MAX_EXPAND_DEPTH to prevent runaway traversals.
 */
export function graphExpand(db: Database.Database, params: ExpandParams): ExpandResult {
  const depth = Math.min(Math.max(params.depth ?? 1, 1), MAX_EXPAND_DEPTH)
  const direction = params.direction ?? 'both'

  // Validate edge_type against allowlist to prevent SQL injection (F-ADV-001)
  if (params.edge_type && !isValidEdgeType(params.edge_type)) {
    throw new Error(`Invalid edge_type: ${params.edge_type}`)
  }

  // Build the recursive CTE based on direction and optional edge type filter
  const typeFilter = params.edge_type ? `AND e.type = '${params.edge_type}'` : ''

  let edgeJoin: string
  if (direction === 'outgoing') {
    edgeJoin = `e.src = t.uid ${typeFilter}`
  } else if (direction === 'incoming') {
    edgeJoin = `e.dst = t.uid ${typeFilter}`
  } else {
    edgeJoin = `(e.src = t.uid OR e.dst = t.uid) ${typeFilter}`
  }

  let neighborUid: string
  if (direction === 'outgoing') {
    neighborUid = 'e.dst'
  } else if (direction === 'incoming') {
    neighborUid = 'e.src'
  } else {
    neighborUid = `CASE WHEN e.src = t.uid THEN e.dst ELSE e.src END`
  }

  const sql = `
    WITH RECURSIVE traversal(uid, depth, edge_src, edge_dst, edge_type, edge_source) AS (
      -- Seed: the starting node
      SELECT ?, 0, NULL, NULL, NULL, NULL

      UNION ALL

      -- Recurse: follow edges
      SELECT
        ${neighborUid},
        t.depth + 1,
        e.src,
        e.dst,
        e.type,
        e.source
      FROM traversal t
      JOIN edge e ON ${edgeJoin}
      WHERE t.depth < ?
        AND ${neighborUid} != ?
    )
    SELECT DISTINCT
      t.uid,
      t.depth,
      t.edge_src,
      t.edge_dst,
      t.edge_type,
      t.edge_source,
      n.kind,
      n.title
    FROM traversal t
    JOIN node n ON n.uid = t.uid
    WHERE t.depth > 0
    ORDER BY t.depth, n.title
  `

  const rows = db.prepare(sql).all(params.uid, depth, params.uid) as {
    uid: string; depth: number; edge_src: string; edge_dst: string;
    edge_type: EdgeType; edge_source: EdgeSource; kind: NodeKind; title: string;
  }[]

  // Deduplicate (a node may be reachable via multiple paths)
  const seen = new Set<string>()
  const neighbors: ExpandHit[] = []
  for (const row of rows) {
    if (seen.has(row.uid)) continue
    seen.add(row.uid)
    neighbors.push({
      uid: row.uid,
      kind: row.kind,
      title: row.title,
      depth: row.depth,
      edge: {
        src: row.edge_src,
        dst: row.edge_dst,
        type: row.edge_type,
        source: row.edge_source
      }
    })
  }

  return { origin: params.uid, depth, neighbors }
}
