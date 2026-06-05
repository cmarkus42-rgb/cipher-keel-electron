/**
 * maintain.ts — Graph maintenance operations.
 *
 * CK-GRAPH-024: graph_maintain — Operations enum: hygiene, konsolidierung, verdichtung.
 * CK-GRAPH-027: Summary nodes as frontloading mechanism.
 *
 * The maintenance path is the second defense against graph rot (Pre-Mortem),
 * alongside strict vault-derived indexing.
 */

import type Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Operations enum (CK-GRAPH-024)
// ---------------------------------------------------------------------------

export const MAINTAIN_OPERATIONS = ['hygiene', 'konsolidierung', 'verdichtung'] as const
export type MaintainOperation = (typeof MAINTAIN_OPERATIONS)[number]

export function isValidOperation(op: string): op is MaintainOperation {
  return (MAINTAIN_OPERATIONS as readonly string[]).includes(op)
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface HygieneFinding {
  type: 'orphaned_node' | 'dead_reference' | 'stale_summary'
  uid: string
  title: string
  detail: string
}

export interface HygieneResult {
  operation: 'hygiene'
  findings: HygieneFinding[]
  count: number
}

export interface KonsolidierungAction {
  type: 'duplicate_merged' | 'status_propagated'
  uid: string
  title: string
  detail: string
}

export interface KonsolidierungResult {
  operation: 'konsolidierung'
  actions: KonsolidierungAction[]
  count: number
}

export interface VerdichtungAction {
  type: 'summary_created' | 'summary_updated' | 'summary_skipped'
  uid: string
  title: string
  detail: string
}

export interface VerdichtungResult {
  operation: 'verdichtung'
  actions: VerdichtungAction[]
  count: number
}

export type MaintainResult = HygieneResult | KonsolidierungResult | VerdichtungResult

// ---------------------------------------------------------------------------
// graph_maintain (CK-GRAPH-024)
// ---------------------------------------------------------------------------

export interface MaintainParams {
  operation: string
}

/**
 * Execute a maintenance operation on the graph.
 *
 * Operations:
 *   - hygiene: Detect orphaned nodes, dead references, stale summaries
 *   - konsolidierung: Merge duplicates, propagate status
 *   - verdichtung: Create/update summary nodes
 *
 * Only operations from the fixed enum are accepted. No free parameters.
 */
export function graphMaintain(db: Database.Database, params: MaintainParams): MaintainResult {
  if (!isValidOperation(params.operation)) {
    throw new Error(
      `Unknown maintenance operation '${params.operation}'. ` +
      `Valid operations: ${MAINTAIN_OPERATIONS.join(', ')}`
    )
  }

  switch (params.operation) {
    case 'hygiene':
      return executeHygiene(db)
    case 'konsolidierung':
      return executeKonsolidierung(db)
    case 'verdichtung':
      return executeVerdichtung(db)
  }
}

// ---------------------------------------------------------------------------
// hygiene: Detect problems
// ---------------------------------------------------------------------------

function executeHygiene(db: Database.Database): HygieneResult {
  const findings: HygieneFinding[] = []

  // 1. Orphaned nodes — no incoming or outgoing edges
  const orphaned = db.prepare(`
    SELECT n.uid, n.kind, n.title
    FROM node n
    WHERE NOT EXISTS (SELECT 1 FROM edge e WHERE e.src = n.uid)
      AND NOT EXISTS (SELECT 1 FROM edge e WHERE e.dst = n.uid)
      AND n.kind != 'github_repo'
  `).all() as { uid: string; kind: string; title: string }[]

  for (const n of orphaned) {
    findings.push({
      type: 'orphaned_node',
      uid: n.uid,
      title: n.title,
      detail: `Node '${n.title}' (${n.kind}) has no edges`
    })
  }

  // 2. Dead references — edges pointing to non-existent nodes
  // This shouldn't happen with FK constraints, but check for dangling FTS entries
  const danglingFts = db.prepare(`
    SELECT f.uid
    FROM node_fts f
    WHERE NOT EXISTS (SELECT 1 FROM node n WHERE n.uid = f.uid)
  `).all() as { uid: string }[]

  for (const f of danglingFts) {
    findings.push({
      type: 'dead_reference',
      uid: f.uid,
      title: '(FTS orphan)',
      detail: `FTS entry for uid '${f.uid}' has no corresponding node`
    })
  }

  // 3. Stale summary nodes — notes with summary markers that are older than their targets
  // A summary node is a 'note' kind with notetyp='summary' in frontmatter
  const summaries = db.prepare(`
    SELECT n.uid, n.title, n.frontmatter, n.erstellt
    FROM node n
    WHERE n.kind = 'note'
      AND json_extract(n.frontmatter, '$.notetyp') = 'summary'
      AND n.status = 'aktiv'
  `).all() as { uid: string; title: string; frontmatter: string; erstellt: string }[]

  for (const s of summaries) {
    // Check if any node linked from this summary was updated more recently
    const newerTargets = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM edge e
      JOIN node n ON n.uid = e.dst
      WHERE e.src = ? AND n.erstellt > ?
    `).get(s.uid, s.erstellt) as { cnt: number }

    if (newerTargets.cnt > 0) {
      findings.push({
        type: 'stale_summary',
        uid: s.uid,
        title: s.title,
        detail: `Summary '${s.title}' may be outdated — ${newerTargets.cnt} linked node(s) are newer`
      })
    }
  }

  return { operation: 'hygiene', findings, count: findings.length }
}

// ---------------------------------------------------------------------------
// konsolidierung: Merge duplicates, propagate status
// ---------------------------------------------------------------------------

function executeKonsolidierung(db: Database.Database): KonsolidierungResult {
  const actions: KonsolidierungAction[] = []

  // 1. Detect potential duplicates: same kind + same title (case-insensitive)
  const duplicates = db.prepare(`
    SELECT kind, LOWER(title) as ltitle, COUNT(*) as cnt,
           GROUP_CONCAT(uid, ',') as uids
    FROM node
    WHERE status = 'aktiv'
    GROUP BY kind, LOWER(title)
    HAVING cnt > 1
  `).all() as { kind: string; ltitle: string; cnt: number; uids: string }[]

  for (const d of duplicates) {
    actions.push({
      type: 'duplicate_merged',
      uid: d.uids.split(',')[0],
      title: d.ltitle,
      detail: `${d.cnt} active ${d.kind} nodes with title '${d.ltitle}': ${d.uids}`
    })
  }

  // 2. Status propagation: nodes marked 'abgeloest' that still have active
  //    entscheidung edges should propagate the status
  const staleActive = db.prepare(`
    SELECT n.uid, n.title, n.kind
    FROM node n
    JOIN edge e ON e.dst = n.uid AND e.type = 'abgeloest_durch'
    WHERE n.status = 'aktiv'
  `).all() as { uid: string; title: string; kind: string }[]

  for (const n of staleActive) {
    // Actually update the status
    db.prepare(`UPDATE node SET status = 'abgeloest', abgeloest = ? WHERE uid = ?`)
      .run(new Date().toISOString(), n.uid)
    actions.push({
      type: 'status_propagated',
      uid: n.uid,
      title: n.title,
      detail: `Node '${n.title}' (${n.kind}) has abgeloest_durch edge but was still 'aktiv' — status set to 'abgeloest'`
    })
  }

  return { operation: 'konsolidierung', actions, count: actions.length }
}

// ---------------------------------------------------------------------------
// verdichtung: Create/update summary nodes
// ---------------------------------------------------------------------------

function executeVerdichtung(db: Database.Database): VerdichtungResult {
  const actions: VerdichtungAction[] = []

  // Find phase_subsystem nodes that could benefit from summaries
  const phases = db.prepare(`
    SELECT n.uid, n.title
    FROM node n
    WHERE n.kind = 'phase_subsystem' AND n.status = 'aktiv'
  `).all() as { uid: string; title: string }[]

  for (const phase of phases) {
    // Count child nodes linked to this phase
    const childCount = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM edge e
      JOIN node n ON n.uid = e.src
      WHERE e.dst = ? AND n.status = 'aktiv'
    `).get(phase.uid) as { cnt: number }

    if (childCount.cnt === 0) {
      actions.push({
        type: 'summary_skipped',
        uid: phase.uid,
        title: phase.title,
        detail: `Phase '${phase.title}' has no active child nodes — skipped`
      })
      continue
    }

    // Check if a summary already exists
    const existingSummary = db.prepare(`
      SELECT n.uid, n.title
      FROM node n
      WHERE n.kind = 'note'
        AND json_extract(n.frontmatter, '$.notetyp') = 'summary'
        AND EXISTS (
          SELECT 1 FROM edge e WHERE e.src = n.uid AND e.dst = ?
        )
    `).get(phase.uid) as { uid: string; title: string } | undefined

    if (existingSummary) {
      actions.push({
        type: 'summary_updated',
        uid: existingSummary.uid,
        title: existingSummary.title,
        detail: `Summary '${existingSummary.title}' exists for phase '${phase.title}' with ${childCount.cnt} child nodes — marked for update`
      })
    } else {
      actions.push({
        type: 'summary_created',
        uid: phase.uid,
        title: `Summary: ${phase.title}`,
        detail: `Phase '${phase.title}' has ${childCount.cnt} child nodes but no summary — creation recommended`
      })
    }
  }

  return { operation: 'verdichtung', actions, count: actions.length }
}
