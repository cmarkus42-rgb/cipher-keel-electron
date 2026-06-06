/**
 * Shared Rolling Summary — generalized graph-backed summary capability.
 *
 * Stores one summary note per entityId. Re-creating overwrites the existing
 * node (idempotent via consistent path natural key).
 *
 * CK-3C-006
 */

import type Database from 'better-sqlite3'
import { GraphWriter } from '../../graph/writer'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RollingSummaryConfig {
  /** Whether this capability is mandatory for the entity. */
  pflicht: boolean
  /** Events that should trigger a summary update. */
  updateTriggers: string[]
  /** Fields tracked in the summary content. */
  summaryFields: string[]
}

/** SE summary config — mandatory, tracks coordination state. */
export const SE_SUMMARY_CONFIG: RollingSummaryConfig = {
  pflicht: true,
  updateTriggers: ['trigger-erstellt', 'gate-urteil', 'handoff', 'kontext-druck'],
  summaryFields: ['aktive_phasen', 'letzte_trigger', 'offene_gates', 'teilprojekte'],
}

/** Workshop summary config — preserves existing workshop triggers and fields. */
export const WORKSHOP_SUMMARY_CONFIG: RollingSummaryConfig = {
  pflicht: true,
  updateTriggers: ['item-abgeschlossen', 'routing-entscheidung', 'kontext-druck', 'neues-buendel'],
  summaryFields: ['erledigte_items', 'items_in_arbeit', 'eskaliert_items', 'offene_fragen'],
}

/** Extended config for CF with wave-based auto-activation. */
export interface CfSummaryConfig extends RollingSummaryConfig {
  autoActivateAfterWelle: number
}

/** Architect summary config — mandatory, tracks ADRs, contracts, coaching, drift. */
export const ARCHITECT_SUMMARY_CONFIG: RollingSummaryConfig = {
  pflicht: true,
  updateTriggers: ['coaching-antwort', 'drift-befund', 'adr-update', 'welle-abschluss'],
  summaryFields: ['subsystem_status', 'aktive_adrs', 'offene_coaching', 'drift_findings'],
}

/** CF summary config — optional until wave 3, tracks project-level state. */
export const CF_SUMMARY_CONFIG: CfSummaryConfig = {
  pflicht: false,
  autoActivateAfterWelle: 3,
  updateTriggers: ['welle-abschluss', 'risk-review', 'worker-rotation'],
  summaryFields: ['wellen_abgeschlossen', 'aktive_worker', 'blockierte_subsysteme', 'offene_fragen'],
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface SummaryData {
  entityId: string
  content: string
}

export interface SummaryResult {
  uid: string
}

export interface LoadedSummary {
  uid: string
  entityId: string
  content: string
  erstellt: string
}

// ---------------------------------------------------------------------------
// createSummaryNode
// ---------------------------------------------------------------------------

/**
 * Write (or overwrite) a rolling summary note for the given entityId.
 *
 * Uses a fixed path per entityId so `upsertNode` overwrites the existing
 * node on subsequent calls — no accumulation.
 */
export function createSummaryNode(
  graphDb: Database.Database,
  _config: RollingSummaryConfig,
  data: SummaryData
): SummaryResult {
  const writer = new GraphWriter(graphDb)

  const node = writer.upsertNode({
    kind: 'note',
    title: `Rolling Summary: ${data.entityId}`,
    path: `/summaries/${data.entityId}/rolling-summary.md`,
    body: data.content,
    frontmatter: {
      notetyp: 'rolling-summary',
      entityId: data.entityId,
    },
  })

  return { uid: node.uid }
}

// ---------------------------------------------------------------------------
// loadLatestSummary
// ---------------------------------------------------------------------------

/**
 * Load the rolling summary for a given entityId.
 *
 * Returns null when no summary has been written yet.
 */
export function loadLatestSummary(
  graphDb: Database.Database,
  entityId: string
): LoadedSummary | null {
  const row = graphDb.prepare(`
    SELECT uid, body, frontmatter, erstellt
    FROM node
    WHERE kind = 'note'
      AND path = ?
    LIMIT 1
  `).get(`/summaries/${entityId}/rolling-summary.md`) as {
    uid: string
    body: string
    frontmatter: string
    erstellt: string
  } | undefined

  if (!row) return null

  return {
    uid: row.uid,
    entityId,
    content: row.body,
    erstellt: row.erstellt,
  }
}
