/**
 * edge-types.ts — 7 typed edge types with pair-based derivation.
 *
 * CK-GRAPH-015: verweist_auf, verfeinert, begruendet, setzt_um, verifiziert, erzeugt_von, abgeloest_durch.
 * CK-GRAPH-017: Edge type derived from source/target node-type pair.
 * CK-GRAPH-046: source enum: wikilink | frontmatter | inferred.
 * CK-GRAPH-016: Time model — abgeloest_durch for supersession chains.
 */

import type { NodeKind } from './node-types'

// ---------------------------------------------------------------------------
// Edge type enum (CK-GRAPH-015)
// ---------------------------------------------------------------------------

export const EDGE_TYPES = [
  'verweist_auf',       // generic default (wikilink reference)
  'verfeinert',         // anforderung → anforderung (refinement)
  'begruendet',         // entscheidung → anforderung (justification)
  'setzt_um',           // artefakt → anforderung/entscheidung (implementation)
  'verifiziert',        // test → anforderung/artefakt (verification)
  'erzeugt_von',        // any → anlass (provenance)
  'abgeloest_durch'     // time model — supersession (CK-GRAPH-016)
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
// Konzept v1.0 Anhang 9.2:
//   anforderung → anforderung       = verfeinert
//   entscheidung → anforderung      = begruendet
//   artefakt → anforderung          = setzt_um
//   artefakt → entscheidung         = setzt_um
//   test → anforderung              = verifiziert
//   test → artefakt                 = verifiziert
//   * → anlass                      = erzeugt_von
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
  'test->artefakt': 'verifiziert'
}

// All node kinds that can be a source to anlass → erzeugt_von
const ALL_TO_ANLASS: EdgeType = 'erzeugt_von'

/**
 * Derive the default edge type from source and destination node types.
 *
 * Returns the derived EdgeType, or 'verweist_auf' if no specific derivation
 * applies. Never returns 'abgeloest_durch' — that is set exclusively via
 * the conflict-detection write path (CK-GRAPH-014, CK-GRAPH-017).
 */
export function deriveEdgeType(srcKind: NodeKind, dstKind: NodeKind): EdgeType {
  // Any → anlass = erzeugt_von
  if (dstKind === 'anlass') return ALL_TO_ANLASS

  const key: PairKey = `${srcKind}->${dstKind}`
  return PAIR_DERIVATION[key] ?? 'verweist_auf'
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
 *   - For typed edges: the pair must match the derivation table
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateEdgeForPair(
  type: EdgeType,
  srcKind: NodeKind,
  dstKind: NodeKind
): string | null {
  // abgeloest_durch and verweist_auf are always valid
  if (type === 'abgeloest_durch' || type === 'verweist_auf') return null

  // erzeugt_von requires dst = anlass
  if (type === 'erzeugt_von') {
    return dstKind === 'anlass'
      ? null
      : `Edge type 'erzeugt_von' requires destination kind 'anlass', got '${dstKind}'`
  }

  // For other typed edges, check the derivation table
  const derived = deriveEdgeType(srcKind, dstKind)
  if (derived === type) return null

  return `Edge type '${type}' is not valid for pair ${srcKind} → ${dstKind} (expected '${derived}')`
}
