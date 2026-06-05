/**
 * query.ts — Parameterized query templates for the Knowledge Graph.
 *
 * CK-GRAPH-021: graph_query — finite set of tested templates, no free query generation.
 * CK-GRAPH-036: Recursive CTEs for multi-step traversal.
 * CK-GRAPH-035: Herkunfts-Kette as traversable graph structure.
 * CK-GRAPH-040: Traceability-Gates as informative graph queries.
 * CK-GRAPH-049: Sandboxed read-only query fallback with logging.
 */

import type Database from 'better-sqlite3'
import type { NodeKind } from './node-types'
import type { EdgeType } from './edge-types'

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

export const QUERY_TEMPLATES = [
  'herkunfts_kette',
  'unlinked_anforderungen',
  'entscheidungen_fuer_anforderung',
  'artefakte_fuer_anforderung',
  'tests_fuer_artefakt',
  'nodes_by_kind',
  'nodes_by_status',
  'orphaned_nodes',
  'gate_coverage',
  'reverse_trace'
] as const

export type QueryTemplate = (typeof QUERY_TEMPLATES)[number]

export function isValidTemplate(name: string): name is QueryTemplate {
  return (QUERY_TEMPLATES as readonly string[]).includes(name)
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

export interface QueryParams {
  template: string
  /** Parameters for the template. Keys depend on template. */
  params?: Record<string, unknown>
}

export interface QueryResult {
  template: QueryTemplate
  rows: Record<string, unknown>[]
  count: number
}

// ---------------------------------------------------------------------------
// graph_query (CK-GRAPH-021)
// ---------------------------------------------------------------------------

/**
 * Execute a parameterized query template.
 *
 * No free query generation — only templates from QUERY_TEMPLATES are accepted.
 * Each template is a tested, reviewed SQL query with named parameters.
 */
export function graphQuery(db: Database.Database, params: QueryParams): QueryResult {
  if (!isValidTemplate(params.template)) {
    throw new Error(
      `Unknown query template '${params.template}'. ` +
      `Valid templates: ${QUERY_TEMPLATES.join(', ')}`
    )
  }

  const p = params.params ?? {}
  const template = params.template as QueryTemplate

  switch (template) {
    case 'herkunfts_kette':
      return executeHerkunftsKette(db, p)
    case 'unlinked_anforderungen':
      return executeUnlinkedAnforderungen(db, p)
    case 'entscheidungen_fuer_anforderung':
      return executeEntscheidungenFuerAnforderung(db, p)
    case 'artefakte_fuer_anforderung':
      return executeArtefakteFuerAnforderung(db, p)
    case 'tests_fuer_artefakt':
      return executeTestsFuerArtefakt(db, p)
    case 'nodes_by_kind':
      return executeNodesByKind(db, p)
    case 'nodes_by_status':
      return executeNodesByStatus(db, p)
    case 'orphaned_nodes':
      return executeOrphanedNodes(db)
    case 'gate_coverage':
      return executeGateCoverage(db, p)
    case 'reverse_trace':
      return executeReverseTrace(db, p)
  }
}

// ---------------------------------------------------------------------------
// Template implementations
// ---------------------------------------------------------------------------

/**
 * herkunfts_kette: Traverse backwards from a node through the traceability chain.
 * CK-GRAPH-035: anforderung -> entscheidung -> artefakt -> test traversal.
 * Uses recursive CTE (CK-GRAPH-036).
 */
function executeHerkunftsKette(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const uid = p.uid as string
  if (!uid) throw new Error("Template 'herkunfts_kette' requires parameter 'uid'")
  const maxDepth = (p.max_depth as number) ?? 10

  const sql = `
    WITH RECURSIVE kette(uid, kind, title, depth, edge_type, via_uid) AS (
      SELECT uid, kind, title, 0, NULL, NULL
      FROM node WHERE uid = ?

      UNION ALL

      SELECT n.uid, n.kind, n.title, k.depth + 1, e.type, k.uid
      FROM kette k
      JOIN edge e ON e.src = k.uid
      JOIN node n ON n.uid = e.dst
      WHERE k.depth < ?
        AND e.type IN ('setzt_um', 'begruendet', 'verfeinert', 'verifiziert', 'erzeugt_von')
    )
    SELECT uid, kind, title, depth, edge_type, via_uid
    FROM kette
    ORDER BY depth
  `

  const rows = db.prepare(sql).all(uid, maxDepth) as Record<string, unknown>[]
  return { template: 'herkunfts_kette', rows, count: rows.length }
}

/**
 * unlinked_anforderungen: Find anforderungen without setzt_um edges.
 * CK-GRAPH-040: Gate query — "12 Anforderungen ohne setzt_um-Kante".
 */
function executeUnlinkedAnforderungen(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const statusFilter = (p.status as string) ?? 'aktiv'

  const sql = `
    SELECT n.uid, n.title, n.status
    FROM node n
    WHERE n.kind = 'anforderung'
      AND n.status = ?
      AND NOT EXISTS (
        SELECT 1 FROM edge e
        WHERE e.dst = n.uid AND e.type = 'setzt_um'
      )
    ORDER BY n.erstellt
  `

  const rows = db.prepare(sql).all(statusFilter) as Record<string, unknown>[]
  return { template: 'unlinked_anforderungen', rows, count: rows.length }
}

/**
 * entscheidungen_fuer_anforderung: All entscheidungen linked to an anforderung via begruendet.
 */
function executeEntscheidungenFuerAnforderung(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const uid = p.uid as string
  if (!uid) throw new Error("Template 'entscheidungen_fuer_anforderung' requires parameter 'uid'")

  const sql = `
    SELECT n.uid, n.title, n.status, e.erstellt as linked_at
    FROM edge e
    JOIN node n ON n.uid = e.src
    WHERE e.dst = ? AND e.type = 'begruendet' AND n.kind = 'entscheidung'
    ORDER BY n.erstellt
  `

  const rows = db.prepare(sql).all(uid) as Record<string, unknown>[]
  return { template: 'entscheidungen_fuer_anforderung', rows, count: rows.length }
}

/**
 * artefakte_fuer_anforderung: All artefakte linked to an anforderung via setzt_um.
 */
function executeArtefakteFuerAnforderung(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const uid = p.uid as string
  if (!uid) throw new Error("Template 'artefakte_fuer_anforderung' requires parameter 'uid'")

  const sql = `
    SELECT n.uid, n.title, n.status, n.path, e.erstellt as linked_at
    FROM edge e
    JOIN node n ON n.uid = e.src
    WHERE e.dst = ? AND e.type = 'setzt_um' AND n.kind = 'artefakt'
    ORDER BY n.erstellt
  `

  const rows = db.prepare(sql).all(uid) as Record<string, unknown>[]
  return { template: 'artefakte_fuer_anforderung', rows, count: rows.length }
}

/**
 * tests_fuer_artefakt: All tests linked to an artefakt via verifiziert.
 */
function executeTestsFuerArtefakt(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const uid = p.uid as string
  if (!uid) throw new Error("Template 'tests_fuer_artefakt' requires parameter 'uid'")

  const sql = `
    SELECT n.uid, n.title, n.status, n.frontmatter, e.erstellt as linked_at
    FROM edge e
    JOIN node n ON n.uid = e.src
    WHERE e.dst = ? AND e.type = 'verifiziert' AND n.kind = 'test'
    ORDER BY n.erstellt
  `

  const rows = db.prepare(sql).all(uid) as Record<string, unknown>[]
  return { template: 'tests_fuer_artefakt', rows, count: rows.length }
}

/**
 * nodes_by_kind: List nodes filtered by kind.
 */
function executeNodesByKind(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const kind = p.kind as string
  if (!kind) throw new Error("Template 'nodes_by_kind' requires parameter 'kind'")
  const limit = (p.limit as number) ?? 100

  const sql = `
    SELECT uid, kind, title, status, path, erstellt
    FROM node WHERE kind = ?
    ORDER BY erstellt DESC
    LIMIT ?
  `

  const rows = db.prepare(sql).all(kind, limit) as Record<string, unknown>[]
  return { template: 'nodes_by_kind', rows, count: rows.length }
}

/**
 * nodes_by_status: List nodes filtered by status.
 */
function executeNodesByStatus(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const status = p.status as string
  if (!status) throw new Error("Template 'nodes_by_status' requires parameter 'status'")
  const limit = (p.limit as number) ?? 100

  const sql = `
    SELECT uid, kind, title, status, path, erstellt
    FROM node WHERE status = ?
    ORDER BY erstellt DESC
    LIMIT ?
  `

  const rows = db.prepare(sql).all(status, limit) as Record<string, unknown>[]
  return { template: 'nodes_by_status', rows, count: rows.length }
}

/**
 * orphaned_nodes: Nodes with no incoming or outgoing edges.
 */
function executeOrphanedNodes(db: Database.Database): QueryResult {
  const sql = `
    SELECT n.uid, n.kind, n.title, n.status
    FROM node n
    WHERE NOT EXISTS (SELECT 1 FROM edge e WHERE e.src = n.uid)
      AND NOT EXISTS (SELECT 1 FROM edge e WHERE e.dst = n.uid)
    ORDER BY n.erstellt
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'orphaned_nodes', rows, count: rows.length }
}

/**
 * gate_coverage: Traceability gate — count anforderungen with/without coverage.
 * CK-GRAPH-040: Informative gate query.
 */
function executeGateCoverage(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const edgeType = (p.edge_type as EdgeType) ?? 'setzt_um'

  const sql = `
    SELECT
      COUNT(*) as total_anforderungen,
      SUM(CASE WHEN has_edge THEN 1 ELSE 0 END) as covered,
      SUM(CASE WHEN NOT has_edge THEN 1 ELSE 0 END) as uncovered
    FROM (
      SELECT n.uid,
        EXISTS (SELECT 1 FROM edge e WHERE e.dst = n.uid AND e.type = ?) as has_edge
      FROM node n
      WHERE n.kind = 'anforderung' AND n.status = 'aktiv'
    )
  `

  const rows = db.prepare(sql).all(edgeType) as Record<string, unknown>[]
  return { template: 'gate_coverage', rows, count: rows.length }
}

/**
 * reverse_trace: Trace backwards from a node following incoming edges.
 * Uses recursive CTE (CK-GRAPH-036).
 */
function executeReverseTrace(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const uid = p.uid as string
  if (!uid) throw new Error("Template 'reverse_trace' requires parameter 'uid'")
  const maxDepth = (p.max_depth as number) ?? 10
  const edgeType = p.edge_type as string | undefined

  const typeFilter = edgeType ? `AND e.type = '${edgeType}'` : ''

  const sql = `
    WITH RECURSIVE trace(uid, kind, title, depth, edge_type, via_uid) AS (
      SELECT uid, kind, title, 0, NULL, NULL
      FROM node WHERE uid = ?

      UNION ALL

      SELECT n.uid, n.kind, n.title, t.depth + 1, e.type, t.uid
      FROM trace t
      JOIN edge e ON e.dst = t.uid ${typeFilter}
      JOIN node n ON n.uid = e.src
      WHERE t.depth < ?
    )
    SELECT uid, kind, title, depth, edge_type, via_uid
    FROM trace
    ORDER BY depth
  `

  const rows = db.prepare(sql).all(uid, maxDepth) as Record<string, unknown>[]
  return { template: 'reverse_trace', rows, count: rows.length }
}

// ---------------------------------------------------------------------------
// Sandboxed query fallback (CK-GRAPH-049)
// ---------------------------------------------------------------------------

export interface SandboxedQueryResult {
  rows: Record<string, unknown>[]
  count: number
  logged: boolean
}

/**
 * Execute a raw read-only SQL query in a sandboxed context.
 *
 * CK-GRAPH-049: Sandboxed, read-only, with logging.
 * Only SELECT statements are allowed. Writes are rejected.
 * Every execution is logged for audit.
 */
export function graphSandboxedQuery(
  db: Database.Database,
  sql: string,
  logFn?: (entry: { sql: string; timestamp: string; rows: number }) => void
): SandboxedQueryResult {
  // Reject anything that isn't a SELECT
  const normalized = sql.trim().toUpperCase()
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
    throw new Error(
      'Sandboxed query only allows SELECT/WITH statements. ' +
      'Write operations must use graph_upsert_node or graph_link.'
    )
  }

  // Block obvious write keywords even within CTEs
  const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE']
  for (const kw of writeKeywords) {
    if (normalized.includes(kw)) {
      throw new Error(
        `Sandboxed query rejected: contains write keyword '${kw}'. ` +
        'Only read-only queries are allowed.'
      )
    }
  }

  const timestamp = new Date().toISOString()
  const rows = db.prepare(sql).all() as Record<string, unknown>[]

  if (logFn) {
    logFn({ sql, timestamp, rows: rows.length })
  }

  return { rows, count: rows.length, logged: !!logFn }
}
