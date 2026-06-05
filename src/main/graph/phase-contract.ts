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
import { GraphWriter } from './writer'
import type { GateBefundAttrs } from './node-types'

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

// ---------------------------------------------------------------------------
// autoGateBefund (CK-PROC-005)
// ---------------------------------------------------------------------------

/**
 * Execute gate_structural_coverage for a phase, compute the structural signal,
 * write a gate_befund node + gate_fuer edge, and return the GateBefundAttrs.
 *
 * strukturell values:
 *   'gruen'     — all aktiv anforderungen covered (or no anforderungen exist)
 *   'rot'       — no anforderungen covered (but some exist)
 *   'teilweise' — some, but not all, anforderungen covered
 *
 * The function is async to match the PhaseContract interface convention
 * (CK-PROC-003) even though the underlying DB operations are synchronous.
 *
 * @param graphDb   — open better-sqlite3 database handle
 * @param phaseUid  — UID of the phase node to assess
 * @param gateTyp   — gate_typ label stored in the befund (e.g. 'coverage')
 */
export async function autoGateBefund(
  graphDb: Database.Database,
  phaseUid: string,
  gateTyp: string
): Promise<GateBefundAttrs> {
  // 1. Run structural coverage query
  const coverageResult = graphQuery(graphDb, {
    template: 'gate_structural_coverage',
    params: { edge_type: 'setzt_um', phase_uid: phaseUid }
  })

  const row = coverageResult.rows[0] ?? { total: 0, covered: 0 }
  const total = Number(row.total)
  const covered = Number(row.covered)

  // 2. Derive strukturell signal
  let strukturell: string
  if (total === 0 || covered === total) {
    strukturell = 'gruen'
  } else if (covered === 0) {
    strukturell = 'rot'
  } else {
    strukturell = 'teilweise'
  }

  const attrs: GateBefundAttrs = {
    phase_uid: phaseUid,
    strukturell,
    plausibilitaet: null,
    gewichtung: '',
    gate_typ: gateTyp
  }

  // 3. Write gate_befund node
  const writer = new GraphWriter(graphDb)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const befund = writer.upsertNode({
    kind: 'gate_befund',
    title: `Auto Gate: ${gateTyp}`,
    path: `/gates/${phaseUid}/${gateTyp}-${timestamp}`,
    frontmatter: { ...attrs }
  })

  // 4. Link gate_fuer edge (gate_befund → phase)
  writer.linkEdge({
    src: befund.uid,
    dst: phaseUid,
    type: 'gate_fuer',
    source: 'inferred'
  })

  return attrs
}
