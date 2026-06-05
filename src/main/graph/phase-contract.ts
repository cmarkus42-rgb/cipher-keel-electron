/**
 * phase-contract.ts — PhaseContract interface and graph-mediated phaseninput resolution.
 *
 * CK-PROC-002: Einheitlicher Phasen-Kontrakt (phaseninput, phasenartefakte, phasenoutput)
 * CK-PROC-003: phaseninput als getypte Graph-Referenz — per Abfrage aufgeloest, kein fester Vorgaenger
 * CK-PROC-013: Kontrakt runtime-agnostisch — kein Schenkel-1/2-spezifischer Code
 *
 * The contract is harness-agnostic by design: it contains no imports or
 * references to Claude Code (Schenkel 1) or NanoClaw (Schenkel 2). Runtime
 * assignment (which harness executes a phase) is external configuration.
 */

import type Database from 'better-sqlite3'
import { graphQuery } from './query'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** An artefakt that is part of a phase's phaseninput (from the preceding phase's output). */
export interface PhaseInputArtefakt {
  uid: string
  title: string
  path: string | null
  kind: string
}

/** Resolved phaseninput for a phase. */
export interface PhaseInput {
  phase_name: string
  artefakte: PhaseInputArtefakt[]
}

/** An artefakt accumulated in the course of a phase (phasenartefakte). */
export interface PhaseArtefakt {
  uid: string
  title: string
  kind: string
}

/** Reference to the phase's handover document (phasenoutput). */
export interface PhasenOutput {
  uid: string
  title: string
  path: string | null
}

// ---------------------------------------------------------------------------
// PhaseContract interface (CK-PROC-002)
// ---------------------------------------------------------------------------

/**
 * Minimal, invariant contract for every phase in the M4 eight-phase chain.
 *
 * All three components are graph-backed. phaseninput is a lazy graph query
 * (not a fixed predecessor reference), enabling cross-phase entry points
 * (CK-PROC-003). Runtime assignment of a harness to this phase is external
 * configuration — not part of the contract (CK-PROC-013).
 */
export interface PhaseContract {
  phase_name: string
  phase_uid: string
  /** Resolve phaseninput via graph query (CK-PROC-003). Returns empty for first phase. */
  phaseninput: (graphDb: Database.Database) => Promise<PhaseInput>
  /** Retrieve accumulated context nodes for this phase. */
  phasenartefakte: (graphDb: Database.Database) => Promise<PhaseArtefakt[]>
  /** Reference to the handover document produced by this phase, or null if not yet set. */
  phasenoutput: PhasenOutput | null
}

// ---------------------------------------------------------------------------
// resolvePhaseInput (CK-PROC-003)
// ---------------------------------------------------------------------------

/**
 * Resolve phaseninput for a given phase via graph query.
 *
 * Finds phasenoutput artefakte of the direct predecessor phase by following
 * naechste_phase edges in the graph. Returns empty artefakte list for the
 * first phase (ideation) which has no predecessor.
 *
 * This is a graph query — not a hardcoded predecessor reference — enabling
 * any phase to serve as a valid entry point (CK-PROC-003).
 */
// NOTE: The function body is currently synchronous (graphQuery is sync),
// but the signature is async (Promise<PhaseInput>) to satisfy the PhaseContract
// interface (CK-PROC-003) and to allow future graph backends that may be
// truly async (e.g. remote graph, WAL-mode async reads).
export async function resolvePhaseInput(
  graphDb: Database.Database,
  phaseName: string
): Promise<PhaseInput> {
  const result = graphQuery(graphDb, {
    template: 'phase_input_resolve',
    params: { phase_name: phaseName }
  })

  return {
    phase_name: phaseName,
    artefakte: result.rows.map(r => ({
      uid: r.uid as string,
      title: r.title as string,
      path: r.path as string | null,
      kind: r.kind as string
    }))
  }
}

// ---------------------------------------------------------------------------
// createPhaseContract
// ---------------------------------------------------------------------------

/**
 * Create a PhaseContract for a given phase.
 *
 * The contract is a plain, harness-agnostic data structure. Any runtime
 * (Schenkel 1 or 2) can execute the phase using the same contract.
 */
export function createPhaseContract(
  phaseName: string,
  phaseUid: string,
  phasenoutput: PhasenOutput | null = null
): PhaseContract {
  return {
    phase_name: phaseName,
    phase_uid: phaseUid,

    phaseninput: (graphDb) => resolvePhaseInput(graphDb, phaseName),

    phasenartefakte: async (graphDb) => {
      // All nodes linked to this phase via traegt_phase (accumulated context)
      const sql = `
        SELECT DISTINCT n.uid, n.title, n.kind
        FROM node n
        JOIN edge e ON e.src = n.uid AND e.type = 'traegt_phase'
        JOIN node ph ON ph.uid = e.dst
          AND ph.kind = 'phase'
          AND json_extract(ph.frontmatter, '$.name') = ?
        ORDER BY n.erstellt
      `
      const rows = graphDb.prepare(sql).all(phaseName) as Record<string, unknown>[]
      return rows.map(r => ({
        uid: r.uid as string,
        title: r.title as string,
        kind: r.kind as string
      }))
    },

    phasenoutput
  }
}
