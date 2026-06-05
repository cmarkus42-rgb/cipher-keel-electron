/**
 * edge-types.ts — 10 typed edge types with pair-based derivation.
 *
 * CK-GRAPH-015: verweist_auf, verfeinert, begruendet, setzt_um, verifiziert, erzeugt_von, abgeloest_durch.
 * CK-GRAPH-017: Edge type derived from source/target node-type pair.
 * CK-GRAPH-046: source enum: wikilink | frontmatter | inferred.
 * CK-GRAPH-016: Time model — abgeloest_durch for supersession chains.
 * CK-PROC-001:  naechste_phase — phase→phase ordering edge.
 * CK-PROC-002:  traegt_phase   — entity→phase binding (artefakt belongs to phase).
 * CK-GRAPH-010: hat_github_repo — entity→github_repo, 1:1 per project
 *               (existing hat_github_repo edge is deleted when repo changes).
 */

import type { NodeKind } from './node-types'

// ---------------------------------------------------------------------------
// Edge type enum (CK-GRAPH-015)
// ---------------------------------------------------------------------------

export const EDGE_TYPES = [
  'verweist_auf',       // generic default (wikilink reference)
  'verfeinert',         // anforderung → anforderung (refinement) / spec → anforderungen (CK-P1-013)
  'begruendet',         // entscheidung → anforderung (justification)
  'setzt_um',           // artefakt → anforderung/entscheidung / architektur-paket → spec (CK-P1-013)
  'verifiziert',        // test → anforderung/artefakt / test-findings → build-paket (CK-P1-013)
  'erzeugt_von',        // any → anlass (provenance)
  'abgeloest_durch',    // time model — supersession (CK-GRAPH-016)
  'naechste_phase',     // phase → phase (CK-PROC-001 — chain ordering)
  'traegt_phase',       // entity → phase (CK-PROC-002 — phase binding)
  'hat_github_repo',    // entity → github_repo, 1:1 per project; old edge deleted on repo change
  'phaseninput_fuer',   // uebergabedokument → uebergabedokument, forward handoff chain (CK-P1-013)
  'behebt',             // fix-report → test-findings (CK-P1-013)
  'referenziert',       // wiki-link resolution between uebergabedokumente (CK-P1-013)
  'prueft',             // audit-summary → fix-report (CK-P1-013)
  'gate_fuer',          // gate_befund → phase (CK-PROC-005)
  'subsystem_von',      // phase_subsystem → phase_subsystem (parent membership, CK-PROC-009)
  'haengt_ab_von',      // phase_subsystem → phase_subsystem (dependency, CK-PROC-009)
  'triggert',           // trigger → phase (SE handoff trigger, Phase 3c)
  'teilprojekt_von',    // SE session → SE session (sub-project membership, Phase 3c)
  'uebergibt_an',       // SE session → SE session (handoff direction, Phase 3c)
  'sammelt_ein'         // SE session → SE session (aggregation, Phase 3c)
] as const

export type EdgeType = (typeof EDGE_TYPES)[number]

// ---------------------------------------------------------------------------
// Edge source enum (CK-GRAPH-046)
// ---------------------------------------------------------------------------

export const EDGE_SOURCES = ['wikilink', 'frontmatter', 'inferred'] as const
export type EdgeSource = (typeof EDGE_SOURCES)[number]

// ---------------------------------------------------------------------------
// Edge record (as stored in DB)
// ---------------------------------------------------------------------------

export interface EdgeRecord {
  id?: number
  src: string       // source node uid
  dst: string       // destination node uid
  type: EdgeType
  source: EdgeSource
  props: string     // JSON
  erstellt: string  // ISO-8601
}

// ---------------------------------------------------------------------------
// Pair-based edge type derivation (CK-GRAPH-017)
//
// Konzept v1.0 Anhang 9.2 + CK-PROC-001/002 + CK-GRAPH-010:
//   anforderung → anforderung       = verfeinert
//   entscheidung → anforderung      = begruendet
//   artefakt → anforderung          = setzt_um
//   artefakt → entscheidung         = setzt_um
//   test → anforderung              = verifiziert
//   test → artefakt                 = verifiziert
//   phase → phase                   = naechste_phase
//   * → anlass                      = erzeugt_von
//   * → phase                       = traegt_phase
//   * → github_repo                 = hat_github_repo
//   everything else                 = verweist_auf (default)
//
// IMPORTANT: abgeloest_durch is NEVER derived from pair (CK-GRAPH-017).
// ---------------------------------------------------------------------------

type PairKey = `${NodeKind}->${NodeKind}`

const PAIR_DERIVATION: Partial<Record<PairKey, EdgeType>> = {
  'anforderung->anforderung': 'verfeinert',
  'entscheidung->anforderung': 'begruendet',
  'artefakt->anforderung': 'setzt_um',
  'artefakt->entscheidung': 'setzt_um',
  'test->anforderung': 'verifiziert',
  'test->artefakt': 'verifiziert',
  'phase->phase': 'naechste_phase',
  'gate_befund->phase': 'gate_fuer',
  'trigger->phase': 'triggert'
}

/**
 * Derive the default edge type from source and destination node types.
 *
 * Returns the derived EdgeType, or 'verweist_auf' if no specific derivation
 * applies. Never returns 'abgeloest_durch' — that is set exclusively via
 * the conflict-detection write path (CK-GRAPH-014, CK-GRAPH-017).
 */
export function deriveEdgeType(srcKind: NodeKind, dstKind: NodeKind): EdgeType {
  // Any → anlass = erzeugt_von (no pair entries for →anlass, so safe to check first)
  if (dstKind === 'anlass') return 'erzeugt_von'

  // Specific pair table takes priority over general dst-kind rules
  const key: PairKey = `${srcKind}->${dstKind}`
  const pairDerived = PAIR_DERIVATION[key]
  if (pairDerived) return pairDerived

  // General dst-kind rules (only reached when no specific pair entry exists)
  // Any → phase = traegt_phase (CK-PROC-002); phase→phase = naechste_phase handled above
  if (dstKind === 'phase') return 'traegt_phase'
  // Any → github_repo = hat_github_repo (CK-GRAPH-010, 1:1 per project)
  if (dstKind === 'github_repo') return 'hat_github_repo'

  return 'verweist_auf'
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidEdgeType(type: string): type is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(type)
}

export function isValidEdgeSource(source: string): source is EdgeSource {
  return (EDGE_SOURCES as readonly string[]).includes(source)
}

/**
 * Validate an edge type against a node pair.
 *
 * Rules:
 *   - abgeloest_durch is always allowed (set by conflict-detection, not pair-derived)
 *   - verweist_auf is always allowed (generic fallback)
 *   - referenziert is always allowed (generic wiki-link)
 *   - For uebergabedokument↔uebergabedokument: a broader set of P1 edge types is valid
 *   - For typed edges: the pair must match the derivation table
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateEdgeForPair(
  type: EdgeType,
  srcKind: NodeKind,
  dstKind: NodeKind
): string | null {
  // Always-valid edge types
  if (type === 'abgeloest_durch' || type === 'verweist_auf' || type === 'referenziert') return null

  // erzeugt_von requires dst = anlass
  if (type === 'erzeugt_von') {
    return dstKind === 'anlass'
      ? null
      : `Edge type 'erzeugt_von' requires destination kind 'anlass', got '${dstKind}'`
  }

  // traegt_phase requires dst = phase (CK-PROC-002)
  if (type === 'traegt_phase') {
    return dstKind === 'phase'
      ? null
      : `Edge type 'traegt_phase' requires destination kind 'phase', got '${dstKind}'`
  }

  // hat_github_repo requires dst = github_repo (CK-GRAPH-010, 1:1 per project)
  if (type === 'hat_github_repo') {
    return dstKind === 'github_repo'
      ? null
      : `Edge type 'hat_github_repo' requires destination kind 'github_repo', got '${dstKind}'`
  }

  // gate_fuer requires src = gate_befund and dst = phase (CK-PROC-005)
  if (type === 'gate_fuer') {
    if (srcKind !== 'gate_befund') {
      return `Edge type 'gate_fuer' requires source kind 'gate_befund', got '${srcKind}'`
    }
    return dstKind === 'phase'
      ? null
      : `Edge type 'gate_fuer' requires destination kind 'phase', got '${dstKind}'`
  }

  // subsystem_von: phase_subsystem → phase_subsystem (CK-PROC-009)
  if (type === 'subsystem_von') {
    if (srcKind !== 'phase_subsystem') {
      return `Edge type 'subsystem_von' requires source kind 'phase_subsystem', got '${srcKind}'`
    }
    return dstKind === 'phase_subsystem'
      ? null
      : `Edge type 'subsystem_von' requires destination kind 'phase_subsystem', got '${dstKind}'`
  }

  // haengt_ab_von: phase_subsystem → phase_subsystem (CK-PROC-009)
  if (type === 'haengt_ab_von') {
    if (srcKind !== 'phase_subsystem') {
      return `Edge type 'haengt_ab_von' requires source kind 'phase_subsystem', got '${srcKind}'`
    }
    return dstKind === 'phase_subsystem'
      ? null
      : `Edge type 'haengt_ab_von' requires destination kind 'phase_subsystem', got '${dstKind}'`
  }

  // triggert requires dst = phase (Phase 3c)
  if (type === 'triggert') {
    return dstKind === 'phase'
      ? null
      : `Edge type 'triggert' requires destination kind 'phase', got '${dstKind}'`
  }

  // SE hierarchy edges are flexible — no strict pair enforcement (Phase 3c)
  if (type === 'teilprojekt_von' || type === 'uebergibt_an' || type === 'sammelt_ein') {
    return null
  }

  // P1 edge types valid between uebergabedokument nodes (CK-P1-013)
  // dokumentTyp-level validation is done separately via validateUebergabedokumentEdge
  if (srcKind === 'uebergabedokument' && dstKind === 'uebergabedokument') {
    const validForUebergabe: EdgeType[] = [
      'verfeinert', 'setzt_um', 'verifiziert', 'behebt',
      'phaseninput_fuer', 'prueft', 'abgeloest_durch', 'referenziert', 'verweist_auf'
    ]
    if (validForUebergabe.includes(type)) return null
    return `Edge type '${type}' is not valid between uebergabedokument nodes`
  }

  // For other typed edges, check the derivation table
  const derived = deriveEdgeType(srcKind, dstKind)
  if (derived === type) return null

  return `Edge type '${type}' is not valid for pair ${srcKind} → ${dstKind} (expected '${derived}')`
}

// ---------------------------------------------------------------------------
// Uebergabedokument edge validation (CK-P1-013)
// ---------------------------------------------------------------------------

import type { DokumentTyp } from './node-types'

/** Valid (src dokumentTyp, dst dokumentTyp) pairs per semantic edge type. */
const VALID_UEBERGABE_PAIRS: Partial<Record<EdgeType, Array<[DokumentTyp, DokumentTyp]>>> = {
  verfeinert:       [['spec', 'anforderungen']],
  setzt_um:         [['architektur-paket', 'spec'], ['build-paket', 'architektur-paket']],
  verifiziert:      [['test-findings', 'build-paket']],
  behebt:           [['fix-report', 'test-findings']],
  prueft:           [['audit-summary', 'fix-report']]
}

/**
 * Validate an edge type against dokumentTyp values of two uebergabedokument nodes.
 *
 * Returns null if valid, or an error message string if invalid.
 * Always-allowed types (phaseninput_fuer, abgeloest_durch, referenziert, verweist_auf)
 * return null regardless of dokumentTyp.
 */
export function validateUebergabedokumentEdge(
  type: EdgeType,
  srcDokTyp: string,
  dstDokTyp: string
): string | null {
  // Always-allowed between uebergabedokument nodes
  if (type === 'phaseninput_fuer' || type === 'abgeloest_durch' ||
      type === 'referenziert'     || type === 'verweist_auf') return null

  const validPairs = VALID_UEBERGABE_PAIRS[type]
  if (!validPairs) {
    return `Edge type '${type}' is not valid between uebergabedokument nodes`
  }

  const ok = validPairs.some(([s, d]) => s === srcDokTyp && d === dstDokTyp)
  if (!ok) {
    return (
      `Edge type '${type}' is not valid from dokumentTyp '${srcDokTyp}' to '${dstDokTyp}'. ` +
      `Valid pairs: ${validPairs.map(([s, d]) => `${s}→${d}`).join(', ')}`
    )
  }
  return null
}
