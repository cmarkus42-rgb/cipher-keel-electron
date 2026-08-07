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
import { isValidEdgeType, type EdgeType } from './edge-types'

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
  'reverse_trace',
  'phase_chain',
  'phase_input_resolve',
  'gate_structural_coverage',
  'gate_befunde_fuer_phase',
  'gate_befunde_aggregiert',
  'phase_skip_status',
  'handoff_completeness',
  'subsystem_list',
  'subsystem_dependencies',
  'quereinstieg_eignung',
  'steuer_ueberblick',
  'vault_index',
  'trigger_history',
  'trigger_for_phase',
  'se_hierarchy',
  'handoff_audit',
  'quereinstieg_entscheidungen',
  'adr_list',
  'adr_by_tiefe',
  'schnittstellen_vertraege',
  'anforderungspakete',
  'offene_fragen',
  'coaching_historie',
  'architect_summary',
  'risk_reviews',
  'subsystem_cycle_status',
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
    case 'phase_chain':
      return executePhaseChain(db)
    case 'phase_input_resolve':
      return executePhaseInputResolve(db, p)
    case 'gate_structural_coverage':
      return executeGateStructuralCoverage(db, p)
    case 'gate_befunde_fuer_phase':
      return executeGateBefundeFuerPhase(db, p)
    case 'gate_befunde_aggregiert':
      return executeGateBefundeAggregiert(db)
    case 'phase_skip_status':
      return executePhaseSkipStatus(db)
    case 'handoff_completeness':
      return executeHandoffCompleteness(db, p)
    case 'subsystem_list':
      return executeSubsystemList(db)
    case 'subsystem_dependencies':
      return executeSubsystemDependencies(db)
    case 'quereinstieg_eignung':
      return executeQuereinstiegEignung(db, p)
    case 'steuer_ueberblick':
      return executeSteuerUeberblick(db)
    case 'vault_index':
      return executeVaultIndex(db)
    case 'trigger_history':
      return executeTriggerHistory(db)
    case 'trigger_for_phase':
      return executeTriggerForPhase(db, p)
    case 'se_hierarchy':
      return executeSEHierarchy(db, p)
    case 'handoff_audit':
      return executeHandoffAudit(db)
    case 'quereinstieg_entscheidungen':
      return executeQuereinstiegEntscheidungen(db)
    case 'adr_list':
      return executeAdrList(db, p)
    case 'adr_by_tiefe':
      return executeAdrByTiefe(db, p)
    case 'schnittstellen_vertraege':
      return executeSchnittstellenVertraege(db, p)
    case 'anforderungspakete':
      return executeAnforderungspakete(db, p)
    case 'offene_fragen':
      return executeOffeneFragen(db, p)
    case 'coaching_historie':
      return executeCoachingHistorie(db, p)
    case 'architect_summary':
      return executeArchitectSummary(db, p)
    case 'risk_reviews':
      return executeRiskReviews(db, p)
    case 'subsystem_cycle_status':
      return executeSubsystemCycleStatus(db, p)
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
    SELECT uid, kind, title, status, path, frontmatter, erstellt
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

  // Validate edge_type against allowlist to prevent SQL injection (F-ADV-002)
  if (edgeType && !isValidEdgeType(edgeType)) {
    throw new Error(`Invalid edge_type: ${edgeType}`)
  }

  // P2-SEC: edge_type uses ? placeholder instead of string interpolation
  const typeFilter = edgeType ? 'AND e.type = ?' : ''

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

  // Build args: uid, [edge_type if filtered], maxDepth
  const sqlArgs: unknown[] = [uid]
  if (edgeType) sqlArgs.push(edgeType)
  sqlArgs.push(maxDepth)

  const rows = db.prepare(sql).all(...sqlArgs) as Record<string, unknown>[]
  return { template: 'reverse_trace', rows, count: rows.length }
}

/**
 * phase_chain: All phase nodes in canonical position order (CK-PROC-001).
 * Returns the 8-phase chain sorted by the position field in frontmatter JSON.
 */
function executePhaseChain(db: Database.Database): QueryResult {
  const sql = `
    SELECT uid, kind, title, status, frontmatter, erstellt
    FROM node
    WHERE kind = 'phase'
    ORDER BY CAST(json_extract(frontmatter, '$.position') AS INTEGER)
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'phase_chain', rows, count: rows.length }
}

/**
 * phase_input_resolve: Resolve phaseninput for a named phase via graph query (CK-PROC-003).
 *
 * Finds the phasenoutput artefakte of the immediately preceding phase by traversing
 * naechste_phase edges backwards. Returns empty for the first phase (no predecessor).
 *
 * Parameters:
 *   phase_name — name of the phase whose input should be resolved (e.g. 'architecture')
 */
function executePhaseInputResolve(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const phaseName = p.phase_name as string
  if (!phaseName) throw new Error("Template 'phase_input_resolve' requires parameter 'phase_name'")

  // Resolve phasenoutput artefakte of the direct predecessor phase:
  // 1. Find current phase by name
  // 2. Find predecessor via incoming naechste_phase edge
  // 3. Return artefakte linked to predecessor via traegt_phase where phasenoutput = true
  const sql = `
    SELECT DISTINCT n.uid, n.title, n.path, n.kind, n.status, n.frontmatter
    FROM node n
    JOIN edge e_bind ON e_bind.src = n.uid AND e_bind.type = 'traegt_phase'
    JOIN node prev_phase ON prev_phase.uid = e_bind.dst AND prev_phase.kind = 'phase'
    JOIN edge e_next ON e_next.src = prev_phase.uid AND e_next.type = 'naechste_phase'
    JOIN node curr_phase ON curr_phase.uid = e_next.dst
      AND curr_phase.kind = 'phase'
      AND json_extract(curr_phase.frontmatter, '$.name') = ?
    WHERE json_extract(n.frontmatter, '$.phasenoutput') = 1
    ORDER BY n.erstellt
  `

  const rows = db.prepare(sql).all(phaseName) as Record<string, unknown>[]
  return { template: 'phase_input_resolve', rows, count: rows.length }
}

/**
 * gate_structural_coverage: Count typed edges for anforderungen in a phase.
 * CK-PROC-005/008: structural coverage gate per phase.
 *
 * Parameters:
 *   edge_type  — edge type to check coverage for (e.g. 'setzt_um', 'verifiziert')
 *   phase_uid  — UID of the phase node
 */
function executeGateStructuralCoverage(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const edgeType = (p.edge_type as EdgeType) ?? 'setzt_um'
  const phaseUid = p.phase_uid as string
  if (!phaseUid) throw new Error("Template 'gate_structural_coverage' requires parameter 'phase_uid'")

  if (!isValidEdgeType(edgeType)) {
    throw new Error(`Invalid edge_type for gate_structural_coverage: ${edgeType}`)
  }

  const sql = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN covered THEN 1 ELSE 0 END) as covered,
      SUM(CASE WHEN NOT covered THEN 1 ELSE 0 END) as uncovered
    FROM (
      SELECT n.uid,
        EXISTS (
          SELECT 1 FROM edge e2 WHERE e2.dst = n.uid AND e2.type = ?
        ) as covered
      FROM node n
      JOIN edge e ON e.src = n.uid AND e.type = 'traegt_phase' AND e.dst = ?
      WHERE n.kind = 'anforderung' AND n.status = 'aktiv'
    )
  `

  const rows = db.prepare(sql).all(edgeType, phaseUid) as Record<string, unknown>[]
  return { template: 'gate_structural_coverage', rows, count: rows.length }
}

/**
 * gate_befunde_fuer_phase: All gate_befund nodes for a phase via gate_fuer edge.
 * CK-PROC-005: returns gate assessments linked to a specific phase.
 *
 * Parameters:
 *   phase_uid — UID of the phase node
 */
function executeGateBefundeFuerPhase(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const phaseUid = p.phase_uid as string
  if (!phaseUid) throw new Error("Template 'gate_befunde_fuer_phase' requires parameter 'phase_uid'")

  const sql = `
    SELECT g.uid, g.title, g.frontmatter, g.status, g.erstellt
    FROM node g
    JOIN edge e ON e.src = g.uid AND e.type = 'gate_fuer' AND e.dst = ?
    WHERE g.kind = 'gate_befund'
    ORDER BY g.erstellt DESC
  `

  const rows = db.prepare(sql).all(phaseUid) as Record<string, unknown>[]
  return { template: 'gate_befunde_fuer_phase', rows, count: rows.length }
}

/**
 * gate_befunde_aggregiert: All phases with their most recent gate_befund.
 * CK-PROC-005: one row per phase; befund_uid is null when no assessment exists.
 * Uses ROW_NUMBER() window function to pick the latest befund per phase.
 */
function executeGateBefundeAggregiert(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      p.uid as phase_uid,
      json_extract(p.frontmatter, '$.name') as phase_name,
      CAST(json_extract(p.frontmatter, '$.position') AS INTEGER) as position,
      g.uid as befund_uid,
      g.frontmatter as befund_frontmatter,
      g.erstellt as befund_erstellt
    FROM node p
    LEFT JOIN (
      SELECT g2.uid, g2.frontmatter, g2.erstellt, e2.dst as phase_uid,
             ROW_NUMBER() OVER (PARTITION BY e2.dst ORDER BY g2.erstellt DESC, g2.uid DESC) as rn
      FROM node g2
      JOIN edge e2 ON e2.src = g2.uid AND e2.type = 'gate_fuer'
      WHERE g2.kind = 'gate_befund'
    ) g ON g.phase_uid = p.uid AND g.rn = 1
    WHERE p.kind = 'phase'
    ORDER BY CAST(json_extract(p.frontmatter, '$.position') AS INTEGER)
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'gate_befunde_aggregiert', rows, count: rows.length }
}

/**
 * phase_skip_status: All phases that have a skip_profil set in their frontmatter.
 * CK-PROC-004: returns skip profile data per phase.
 */
function executePhaseSkipStatus(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      uid,
      title,
      frontmatter,
      json_extract(frontmatter, '$.name') as phase_name,
      json_extract(frontmatter, '$.skip_profil') as skip_profil_raw
    FROM node
    WHERE kind = 'phase'
      AND json_extract(frontmatter, '$.skip_profil') IS NOT NULL
    ORDER BY CAST(json_extract(frontmatter, '$.position') AS INTEGER)
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'phase_skip_status', rows, count: rows.length }
}

/**
 * handoff_completeness: Check whether the predecessor phase of a named phase is
 * ready for handoff — i.e. has phasenoutput artefakte and anlass nodes.
 * CK-PROC-011: handoff protocol completeness gate.
 *
 * Returns one row for the predecessor phase with:
 *   predecessor_uid, predecessor_name, artefakt_count, anlass_count, is_complete
 * Returns 0 rows for the first phase (no predecessor).
 *
 * Parameters:
 *   phase_name — name of the receiving phase (e.g. 'architecture')
 */
function executeHandoffCompleteness(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const phaseName = p.phase_name as string
  if (!phaseName) throw new Error("Template 'handoff_completeness' requires parameter 'phase_name'")

  const sql = `
    SELECT
      prev.uid as predecessor_uid,
      json_extract(prev.frontmatter, '$.name') as predecessor_name,
      COUNT(DISTINCT CASE
        WHEN bound.kind = 'artefakt'
          AND json_extract(bound.frontmatter, '$.phasenoutput') = 1
        THEN bound.uid
      END) as artefakt_count,
      COUNT(DISTINCT CASE
        WHEN bound.kind = 'anlass' THEN bound.uid
      END) as anlass_count,
      CASE WHEN
        COUNT(DISTINCT CASE
          WHEN bound.kind = 'artefakt'
            AND json_extract(bound.frontmatter, '$.phasenoutput') = 1
          THEN bound.uid
        END) > 0
        AND COUNT(DISTINCT CASE
          WHEN bound.kind = 'anlass' THEN bound.uid
        END) > 0
      THEN 1 ELSE 0 END as is_complete
    FROM node curr
    JOIN edge e_next ON e_next.dst = curr.uid AND e_next.type = 'naechste_phase'
    JOIN node prev ON prev.uid = e_next.src AND prev.kind = 'phase'
    LEFT JOIN edge e_bind ON e_bind.dst = prev.uid AND e_bind.type = 'traegt_phase'
    LEFT JOIN node bound ON bound.uid = e_bind.src
    WHERE curr.kind = 'phase'
      AND json_extract(curr.frontmatter, '$.name') = ?
    GROUP BY prev.uid
  `

  const rows = db.prepare(sql).all(phaseName) as Record<string, unknown>[]
  return { template: 'handoff_completeness', rows, count: rows.length }
}

/**
 * subsystem_list: All phase_subsystem nodes with scope/status/blocked_grund
 * from frontmatter and outgoing dependency count via haengt_ab_von.
 */
function executeSubsystemList(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      s.uid,
      s.title,
      s.status,
      json_extract(s.frontmatter, '$.scope') as scope,
      json_extract(s.frontmatter, '$.status') as sub_status,
      json_extract(s.frontmatter, '$.blocked_grund') as blocked_grund,
      (SELECT COUNT(*) FROM edge e WHERE e.src = s.uid AND e.type = 'haengt_ab_von') as dep_count
    FROM node s
    WHERE s.kind = 'phase_subsystem'
    ORDER BY s.title
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'subsystem_list', rows, count: rows.length }
}

/**
 * subsystem_dependencies: Topological ordering via haengt_ab_von CTE.
 * Roots = phase_subsystem nodes with no incoming haengt_ab_von edges.
 * BFS from roots following outgoing haengt_ab_von edges; topo_order = MIN depth.
 * Uses path-string cycle detection for safety.
 */
function executeSubsystemDependencies(db: Database.Database): QueryResult {
  const sql = `
    WITH RECURSIVE
      roots(uid) AS (
        SELECT uid FROM node
        WHERE kind = 'phase_subsystem'
          AND NOT EXISTS (
            SELECT 1 FROM edge e WHERE e.dst = uid AND e.type = 'haengt_ab_von'
          )
      ),
      topo(uid, title, depth, path_str) AS (
        SELECT n.uid, n.title, 0, n.uid
        FROM node n
        JOIN roots r ON r.uid = n.uid

        UNION ALL

        SELECT n.uid, n.title, t.depth + 1, t.path_str || ',' || n.uid
        FROM topo t
        JOIN edge e ON e.src = t.uid AND e.type = 'haengt_ab_von'
        JOIN node n ON n.uid = e.dst
        WHERE t.depth < 20
          AND (',' || t.path_str || ',') NOT LIKE '%,' || n.uid || ',%'
      )
    SELECT uid, title, MIN(depth) as topo_order
    FROM topo
    GROUP BY uid
    ORDER BY MIN(depth), uid
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'subsystem_dependencies', rows, count: rows.length }
}

/**
 * quereinstieg_eignung: Checks whether the necessary inputs for phase X exist
 * in the graph for a given subsystem.
 *
 * Inputs = phasenoutput artefakte of the predecessor phase (via naechste_phase).
 * Returns one summary row per subsystem with input_count and eignung flag.
 * Returns 0 rows when target phase has no predecessor.
 *
 * Parameters:
 *   target_phase  — name of the phase to enter (e.g. 'architecture')
 *   subsystem_uid — UID of the phase_subsystem node
 */
function executeQuereinstiegEignung(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const targetPhase = p.target_phase as string
  const subsystemUid = p.subsystem_uid as string
  if (!targetPhase) throw new Error("Template 'quereinstieg_eignung' requires parameter 'target_phase'")
  if (!subsystemUid) throw new Error("Template 'quereinstieg_eignung' requires parameter 'subsystem_uid'")

  const sql = `
    WITH
      target AS (
        SELECT uid FROM node
        WHERE kind = 'phase' AND json_extract(frontmatter, '$.name') = ?
      ),
      predecessor AS (
        SELECT e.src as uid
        FROM edge e
        JOIN target t ON e.dst = t.uid
        WHERE e.type = 'naechste_phase'
      ),
      inputs AS (
        SELECT a.uid as artefakt_uid
        FROM node a
        JOIN edge e ON e.src = a.uid AND e.type = 'traegt_phase'
        JOIN predecessor p ON p.uid = e.dst
        WHERE a.kind = 'artefakt' AND json_extract(a.frontmatter, '$.phasenoutput') = 1
      )
    SELECT
      s.uid as subsystem_uid,
      s.title as subsystem_title,
      json_extract(s.frontmatter, '$.scope') as scope,
      json_extract(s.frontmatter, '$.status') as sub_status,
      json_extract(s.frontmatter, '$.blocked_grund') as blocked_grund,
      (SELECT uid FROM target) as target_phase_uid,
      (SELECT uid FROM predecessor) as predecessor_uid,
      COUNT(DISTINCT i.artefakt_uid) as input_count,
      CASE WHEN COUNT(DISTINCT i.artefakt_uid) > 0 THEN 1 ELSE 0 END as eignung
    FROM node s
    LEFT JOIN inputs i ON 1=1
    WHERE s.uid = ?
      AND (SELECT COUNT(*) FROM predecessor) > 0
    GROUP BY s.uid
  `

  const rows = db.prepare(sql).all(targetPhase, subsystemUid) as Record<string, unknown>[]
  return { template: 'quereinstieg_eignung', rows, count: rows.length }
}

/**
 * steuer_ueberblick: Aggregated overview across all Stränge.
 * One row per (phase_subsystem, phase) pair joined via traegt_phase.
 * Each row includes the most recent gate_befund for the phase via gate_fuer
 * (ROW_NUMBER window function, same pattern as gate_befunde_aggregiert).
 */
function executeSteuerUeberblick(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      s.uid as subsystem_uid,
      s.title as subsystem_title,
      json_extract(s.frontmatter, '$.scope') as scope,
      json_extract(s.frontmatter, '$.status') as sub_status,
      json_extract(s.frontmatter, '$.blocked_grund') as blocked_grund,
      p.uid as phase_uid,
      json_extract(p.frontmatter, '$.name') as phase_name,
      CAST(json_extract(p.frontmatter, '$.position') AS INTEGER) as phase_position,
      g.uid as befund_uid,
      g.frontmatter as befund_frontmatter,
      g.erstellt as befund_erstellt
    FROM node s
    JOIN edge e_tp ON e_tp.src = s.uid AND e_tp.type = 'traegt_phase'
    JOIN node p ON p.uid = e_tp.dst AND p.kind = 'phase'
    LEFT JOIN (
      SELECT g2.uid, g2.frontmatter, g2.erstellt, e2.dst as phase_uid,
             ROW_NUMBER() OVER (PARTITION BY e2.dst ORDER BY g2.erstellt DESC, g2.uid DESC) as rn
      FROM node g2
      JOIN edge e2 ON e2.src = g2.uid AND e2.type = 'gate_fuer'
      WHERE g2.kind = 'gate_befund'
    ) g ON g.phase_uid = p.uid AND g.rn = 1
    WHERE s.kind = 'phase_subsystem'
    ORDER BY phase_position, s.uid
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'steuer_ueberblick', rows, count: rows.length }
}

/**
 * vault_index: All note and uebergabedokument nodes with their type discriminator.
 * Returns notetyp for notes, dokumentTyp for uebergabedokumente.
 */
function executeVaultIndex(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      uid,
      kind,
      title,
      path,
      status,
      frontmatter,
      CASE WHEN kind = 'note'
        THEN json_extract(frontmatter, '$.notetyp')
        ELSE NULL
      END as notetyp,
      CASE WHEN kind = 'uebergabedokument'
        THEN json_extract(frontmatter, '$.dokumentTyp')
        ELSE NULL
      END as dokumentTyp,
      erstellt
    FROM node
    WHERE kind IN ('note', 'uebergabedokument')
    ORDER BY kind, erstellt DESC
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'vault_index', rows, count: rows.length }
}

/**
 * trigger_history: All trigger nodes in chronological order (oldest first).
 * Phase 3c — CK-3C-003.
 */
function executeTriggerHistory(db: Database.Database): QueryResult {
  const sql = `
    SELECT uid, title, frontmatter, status, erstellt
    FROM node
    WHERE kind = 'trigger'
    ORDER BY erstellt ASC
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'trigger_history', rows, count: rows.length }
}

/**
 * trigger_for_phase: All trigger nodes pointing to a specific phase via triggert edge.
 * Phase 3c — CK-3C-003.
 *
 * Parameters:
 *   phase_uid — UID of the target phase node
 */
function executeTriggerForPhase(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const phaseUid = p.phase_uid as string
  if (!phaseUid) throw new Error("Template 'trigger_for_phase' requires parameter 'phase_uid'")

  const sql = `
    SELECT t.uid, t.title, t.frontmatter, t.status, t.erstellt
    FROM node t
    JOIN edge e ON e.src = t.uid AND e.type = 'triggert' AND e.dst = ?
    WHERE t.kind = 'trigger'
    ORDER BY t.erstellt ASC
  `

  const rows = db.prepare(sql).all(phaseUid) as Record<string, unknown>[]
  return { template: 'trigger_for_phase', rows, count: rows.length }
}

/**
 * se_hierarchy: Traverse teilprojekt_von edges from a Haupt-SE node (Phase 3c).
 *
 * Recursively finds all sub-SE sessions that are connected via incoming
 * teilprojekt_von edges (sub --teilprojekt_von--> parent).
 * Returns uid, title, frontmatter, depth, parent_uid for each node.
 *
 * Parameters:
 *   haupt_se_uid — UID of the root SE session (Haupt-SE)
 */
function executeSEHierarchy(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const haupt_se_uid = p.haupt_se_uid as string
  if (!haupt_se_uid) throw new Error("Template 'se_hierarchy' requires parameter 'haupt_se_uid'")

  const sql = `
    WITH RECURSIVE hierarchy(uid, title, frontmatter, depth, parent_uid) AS (
      SELECT uid, title, frontmatter, 0, NULL
      FROM node WHERE uid = ?

      UNION ALL

      SELECT n.uid, n.title, n.frontmatter, h.depth + 1, h.uid
      FROM hierarchy h
      JOIN edge e ON e.dst = h.uid AND e.type = 'teilprojekt_von'
      JOIN node n ON n.uid = e.src
      WHERE h.depth < 10
    )
    SELECT uid, title, frontmatter, depth, parent_uid
    FROM hierarchy
    ORDER BY depth, uid
  `

  const rows = db.prepare(sql).all(haupt_se_uid) as Record<string, unknown>[]
  return { template: 'se_hierarchy', rows, count: rows.length }
}

/**
 * handoff_audit: For every naechste_phase transition, check whether a trigger
 * node with a 'triggert' edge to the destination phase exists (Phase 3c).
 *
 * Returns one row per phase transition with:
 *   from_phase_uid, from_phase_name, to_phase_uid, to_phase_name,
 *   has_trigger (1/0)
 * Ordered by from_phase position.
 */
function executeHandoffAudit(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      src_phase.uid as from_phase_uid,
      json_extract(src_phase.frontmatter, '$.name') as from_phase_name,
      dst_phase.uid as to_phase_uid,
      json_extract(dst_phase.frontmatter, '$.name') as to_phase_name,
      CASE WHEN EXISTS (
        SELECT 1 FROM node t
        JOIN edge et ON et.src = t.uid AND et.type = 'triggert' AND et.dst = dst_phase.uid
        WHERE t.kind = 'trigger'
      ) THEN 1 ELSE 0 END as has_trigger
    FROM edge e
    JOIN node src_phase ON src_phase.uid = e.src AND src_phase.kind = 'phase'
    JOIN node dst_phase ON dst_phase.uid = e.dst AND dst_phase.kind = 'phase'
    WHERE e.type = 'naechste_phase'
    ORDER BY CAST(json_extract(src_phase.frontmatter, '$.position') AS INTEGER)
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'handoff_audit', rows, count: rows.length }
}

/**
 * quereinstieg_entscheidungen: All entscheidung nodes that are phase-scoped
 * via traegt_phase edge (Phase 3c — lateral/cross-entry decisions).
 *
 * Returns uid, title, status, frontmatter, phase_uid, phase_name.
 * Ordered by phase position then entscheidung creation time.
 */
function executeQuereinstiegEntscheidungen(db: Database.Database): QueryResult {
  const sql = `
    SELECT
      n.uid,
      n.title,
      n.status,
      n.frontmatter,
      p.uid as phase_uid,
      json_extract(p.frontmatter, '$.name') as phase_name,
      CAST(json_extract(p.frontmatter, '$.position') AS INTEGER) as phase_position,
      n.erstellt
    FROM node n
    JOIN edge e ON e.src = n.uid AND e.type = 'traegt_phase'
    JOIN node p ON p.uid = e.dst AND p.kind = 'phase'
    WHERE n.kind = 'entscheidung'
    ORDER BY phase_position, n.erstellt
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'quereinstieg_entscheidungen', rows, count: rows.length }
}

// ---------------------------------------------------------------------------
// Phase 4a query implementations
// ---------------------------------------------------------------------------

/**
 * adr_list: All active ADR nodes ordered by version descending.
 * Optional parameter project_uid: filter to ADRs linked to a specific subsystem via adr_fuer.
 */
function executeAdrList(db: Database.Database, p: Record<string, unknown>): QueryResult {
  const projectUid = p.project_uid as string | undefined
  let sql: string
  if (projectUid) {
    sql = `
      SELECT n.uid, n.title, n.frontmatter, n.erstellt
      FROM node n
      JOIN edge e ON e.src = n.uid AND e.type = 'adr_fuer' AND e.dst = ?
      WHERE n.kind = 'adr' AND n.status = 'aktiv'
      ORDER BY json_extract(n.frontmatter, '$.version') DESC
    `
    const rows = db.prepare(sql).all(projectUid) as Record<string, unknown>[]
    return { template: 'adr_list', rows, count: rows.length }
  }
  sql = `
    SELECT uid, title, frontmatter, erstellt
    FROM node
    WHERE kind = 'adr' AND status = 'aktiv'
    ORDER BY json_extract(frontmatter, '$.version') DESC
  `
  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'adr_list', rows, count: rows.length }
}

/**
 * adr_by_tiefe: Return a specific ADR's content at the requested depth level.
 *
 * Parameters:
 *   adr_uid — UID of the ADR node
 *   tiefe   — 'summary' | 'context' | 'full'
 */
function executeAdrByTiefe(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const adrUid = p.adr_uid as string
  if (!adrUid) throw new Error("Template 'adr_by_tiefe' requires parameter 'adr_uid'")
  const tiefe = (p.tiefe as string) ?? 'summary'

  let sql: string
  if (tiefe === 'summary') {
    sql = `
      SELECT uid, title,
        json_extract(frontmatter, '$.tiefen.summary') AS tiefe_summary,
        json_extract(frontmatter, '$.consequences') AS consequences
      FROM node WHERE uid = ? AND kind = 'adr'
    `
  } else if (tiefe === 'context') {
    sql = `
      SELECT uid, title,
        json_extract(frontmatter, '$.context') AS context,
        json_extract(frontmatter, '$.decision') AS decision,
        json_extract(frontmatter, '$.consequences') AS consequences
      FROM node WHERE uid = ? AND kind = 'adr'
    `
  } else {
    // full
    sql = `
      SELECT uid, title, frontmatter, erstellt
      FROM node WHERE uid = ? AND kind = 'adr'
    `
  }

  const rows = db.prepare(sql).all(adrUid) as Record<string, unknown>[]
  return { template: 'adr_by_tiefe', rows, count: rows.length }
}

/**
 * schnittstellen_vertraege: All active interface contracts, optionally filtered by subsystem.
 *
 * Parameters (optional):
 *   subsystem_uid — UID of the phase_subsystem to filter by (via schnittstellen_vertrag_fuer edge)
 */
function executeSchnittstellenVertraege(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const subsystemUid = p.subsystem_uid as string | undefined

  let sql: string
  let args: unknown[]
  if (subsystemUid) {
    sql = `
      SELECT n.uid, n.title, n.frontmatter, n.erstellt
      FROM node n
      JOIN edge e ON e.src = n.uid AND e.type = 'schnittstellen_vertrag_fuer' AND e.dst = ?
      WHERE n.kind = 'schnittstellen_vertrag' AND n.status = 'aktiv'
      ORDER BY n.erstellt DESC
    `
    args = [subsystemUid]
  } else {
    sql = `
      SELECT uid, title, frontmatter, erstellt
      FROM node
      WHERE kind = 'schnittstellen_vertrag' AND status = 'aktiv'
      ORDER BY erstellt DESC
    `
    args = []
  }

  const rows = db.prepare(sql).all(...args) as Record<string, unknown>[]
  return { template: 'schnittstellen_vertraege', rows, count: rows.length }
}

/**
 * anforderungspakete: All active requirement packages, optionally filtered by subsystem.
 *
 * Parameters (optional):
 *   subsystem_uid — UID of the subsystem (matched via frontmatter $.subsystem)
 */
function executeAnforderungspakete(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const subsystemUid = p.subsystem_uid as string | undefined

  let sql: string
  let args: unknown[]
  if (subsystemUid) {
    sql = `
      SELECT uid, title, frontmatter
      FROM node
      WHERE kind = 'anforderungspaket' AND status = 'aktiv'
        AND json_extract(frontmatter, '$.subsystem') = ?
      ORDER BY erstellt DESC
    `
    args = [subsystemUid]
  } else {
    sql = `
      SELECT uid, title, frontmatter
      FROM node
      WHERE kind = 'anforderungspaket' AND status = 'aktiv'
      ORDER BY erstellt DESC
    `
    args = []
  }

  const rows = db.prepare(sql).all(...args) as Record<string, unknown>[]
  return { template: 'anforderungspakete', rows, count: rows.length }
}

/**
 * offene_fragen: All open coaching questions, optionally filtered by subsystem.
 *
 * Parameters (optional):
 *   subsystem — UID of the subsystem (matched via frontmatter $.subsystem)
 */
function executeOffeneFragen(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const subsystem = p.subsystem as string | undefined

  let sql: string
  let args: unknown[]
  if (subsystem) {
    sql = `
      SELECT uid, title, frontmatter, erstellt
      FROM node
      WHERE kind = 'frage_knoten' AND status = 'aktiv'
        AND json_extract(frontmatter, '$.status') = 'offen'
        AND json_extract(frontmatter, '$.subsystem') = ?
      ORDER BY erstellt ASC
    `
    args = [subsystem]
  } else {
    sql = `
      SELECT uid, title, frontmatter, erstellt
      FROM node
      WHERE kind = 'frage_knoten' AND status = 'aktiv'
        AND json_extract(frontmatter, '$.status') = 'offen'
      ORDER BY erstellt ASC
    `
    args = []
  }

  const rows = db.prepare(sql).all(...args) as Record<string, unknown>[]
  return { template: 'offene_fragen', rows, count: rows.length }
}

/**
 * coaching_historie: Q+A pairs for a subsystem chronologically.
 *
 * Parameters:
 *   subsystem — UID of the subsystem (matched via frage_knoten frontmatter $.subsystem)
 */
function executeCoachingHistorie(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const subsystem = p.subsystem as string
  if (!subsystem) throw new Error("Template 'coaching_historie' requires parameter 'subsystem'")

  const sql = `
    SELECT
      f.uid AS frage_uid,
      f.title AS frage_title,
      json_extract(f.frontmatter, '$.frage') AS frage,
      a.uid AS antwort_uid,
      json_extract(a.frontmatter, '$.antwort') AS antwort,
      f.erstellt
    FROM node f
    LEFT JOIN edge e ON e.dst = f.uid AND e.type = 'beantwortet'
    LEFT JOIN node a ON a.uid = e.src
    WHERE f.kind = 'frage_knoten'
      AND json_extract(f.frontmatter, '$.subsystem') = ?
    ORDER BY f.erstellt ASC
  `

  const rows = db.prepare(sql).all(subsystem) as Record<string, unknown>[]
  return { template: 'coaching_historie', rows, count: rows.length }
}

/**
 * architect_summary: Aggregated counts across all Architect-relevant node types.
 * Returns a single summary row.
 * Optional parameter project_uid: filter adr_count and offene_fragen to a specific subsystem.
 */
function executeArchitectSummary(db: Database.Database, p: Record<string, unknown>): QueryResult {
  const projectUid = p.project_uid as string | undefined
  let sql: string
  if (projectUid) {
    sql = `
      SELECT
        (SELECT COUNT(*) FROM node WHERE kind = 'phase_subsystem' AND status = 'aktiv'
          AND uid = ?) AS subsystem_count,
        (SELECT COUNT(*) FROM node n
          JOIN edge e ON e.src = n.uid AND e.type = 'adr_fuer' AND e.dst = ?
          WHERE n.kind = 'adr' AND n.status = 'aktiv') AS adr_count,
        (SELECT COUNT(*) FROM node WHERE kind = 'frage_knoten' AND status = 'aktiv'
          AND json_extract(frontmatter, '$.status') = 'offen'
          AND json_extract(frontmatter, '$.subsystem') = ?) AS offene_fragen,
        (SELECT COUNT(*) FROM node WHERE kind = 'gate_befund' AND status = 'aktiv'
          AND json_extract(frontmatter, '$.gate_typ') = 'drift') AS drift_findings
    `
    const rows = db.prepare(sql).all(projectUid, projectUid, projectUid) as Record<string, unknown>[]
    return { template: 'architect_summary', rows, count: rows.length }
  }
  sql = `
    SELECT
      (SELECT COUNT(*) FROM node WHERE kind = 'phase_subsystem' AND status = 'aktiv') AS subsystem_count,
      (SELECT COUNT(*) FROM node WHERE kind = 'adr' AND status = 'aktiv') AS adr_count,
      (SELECT COUNT(*) FROM node WHERE kind = 'frage_knoten' AND status = 'aktiv'
        AND json_extract(frontmatter, '$.status') = 'offen') AS offene_fragen,
      (SELECT COUNT(*) FROM node WHERE kind = 'gate_befund' AND status = 'aktiv'
        AND json_extract(frontmatter, '$.gate_typ') = 'drift') AS drift_findings
  `
  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'architect_summary', rows, count: rows.length }
}

/**
 * risk_reviews: All gate_befund nodes with gate_typ 'risk-review', newest first.
 *
 * Parameters (optional):
 *   welle — (reserved for future filtering by wave, not currently enforced)
 */
function executeRiskReviews(
  db: Database.Database,
  _p: Record<string, unknown>
): QueryResult {
  const sql = `
    SELECT uid, title, frontmatter, erstellt
    FROM node
    WHERE kind = 'gate_befund' AND status = 'aktiv'
      AND json_extract(frontmatter, '$.gate_typ') = 'risk-review'
    ORDER BY erstellt DESC
  `

  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'risk_reviews', rows, count: rows.length }
}

// ---------------------------------------------------------------------------
// Phase 5 query implementations
// ---------------------------------------------------------------------------

/**
 * subsystem_cycle_status: All cycle phase nodes for a subsystem, ordered by position.
 * Cycle phases store their subsystem UID in frontmatter.cycle_subsystem.
 * CK-PROC-016
 *
 * Parameters:
 *   subsystem_uid — UID of the phase_subsystem this cycle belongs to
 */
function executeSubsystemCycleStatus(
  db: Database.Database,
  p: Record<string, unknown>
): QueryResult {
  const subsystemUid = p.subsystem_uid as string
  if (!subsystemUid) throw new Error("Template 'subsystem_cycle_status' requires parameter 'subsystem_uid'")

  const sql = `
    SELECT uid, title, frontmatter, status
    FROM node
    WHERE kind = 'phase'
      AND json_extract(frontmatter, '$.cycle_subsystem') = ?
    ORDER BY CAST(json_extract(frontmatter, '$.position') AS INTEGER) ASC
  `

  const rows = db.prepare(sql).all(subsystemUid) as Record<string, unknown>[]
  return { template: 'subsystem_cycle_status', rows, count: rows.length }
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
  const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM']
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
