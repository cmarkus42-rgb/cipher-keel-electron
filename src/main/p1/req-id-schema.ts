/**
 * req-id-schema.ts — REQ-ID-Namensraum-Schema fuer alle Phasen.
 *
 * CK-P1-012: Neun REQ-ID-Praefixe, eindeutig einer Vergabe-Phase zugeordnet.
 * IDs sind dreistellig und aufsteigend (SA-001, REQ-001, BUG-001).
 */

// ---------------------------------------------------------------------------
// Prefix registry
// ---------------------------------------------------------------------------

export interface ReqIdPrefixEntry {
  /** The phase in which this ID type is assigned */
  phase: string
  /** Human-readable description */
  description: string
}

/**
 * All nine REQ-ID prefixes with their assigned phase.
 * CK-P1-012 Abschnitt 13.4
 */
export const REQ_ID_PREFIXES: Record<string, ReqIdPrefixEntry> = {
  SA:  { phase: 'ideation',      description: 'Stakeholder-Anforderung' },
  REQ: { phase: 'requirements',  description: 'Funktional-technische Anforderung' },
  NFR: { phase: 'requirements',  description: 'Nicht-funktionale Anforderung' },
  BUG: { phase: 'testing',       description: 'Bug-Finding' },
  MFR: { phase: 'testing',       description: 'Minor Feature Request' },
  NRF: { phase: 'testing',       description: 'Nicht-reproduzierbarer Fund' },
  C:   { phase: 'audit',         description: 'Audit-Befund kritisch' },
  M:   { phase: 'audit',         description: 'Audit-Befund mittel' },
  N:   { phase: 'audit',         description: 'Audit-Befund niedrig' }
}

// REQ-ID format: <PREFIX>-<NNN> where NNN is exactly 3 digits, 001–999
const REQ_ID_PATTERN = /^([A-Z]+)-(\d{3})$/

// ---------------------------------------------------------------------------
// validateReqId
// ---------------------------------------------------------------------------

/**
 * Returns true if the ID is syntactically valid and uses a known prefix.
 * Format: <PREFIX>-<NNN>, where NNN is 001–999 (leading zeros OK, 000 invalid).
 */
export function validateReqId(id: string): boolean {
  const match = id.match(REQ_ID_PATTERN)
  if (!match) return false
  const [, prefix, numStr] = match
  if (!(prefix in REQ_ID_PREFIXES)) return false
  const num = parseInt(numStr, 10)
  return num >= 1  // 000 is not a valid ID
}

// ---------------------------------------------------------------------------
// parseReqId
// ---------------------------------------------------------------------------

export interface ParsedReqId {
  prefix: string
  number: number
  phase: string
}

/**
 * Parse a valid REQ-ID and return its components.
 * Throws an Error if the ID is not valid.
 */
export function parseReqId(id: string): ParsedReqId {
  const match = id.match(REQ_ID_PATTERN)
  if (!match) {
    throw new Error(`Invalid REQ-ID format: '${id}'. Expected <PREFIX>-<NNN> (e.g. SA-001)`)
  }
  const [, prefix, numStr] = match
  const entry = REQ_ID_PREFIXES[prefix]
  if (!entry) {
    throw new Error(
      `Unknown REQ-ID prefix '${prefix}'. Valid prefixes: ${Object.keys(REQ_ID_PREFIXES).join(', ')}`
    )
  }
  const number = parseInt(numStr, 10)
  if (number < 1) {
    throw new Error(`REQ-ID number must be >= 001, got '${numStr}' in '${id}'`)
  }
  return { prefix, number, phase: entry.phase }
}

// ---------------------------------------------------------------------------
// checkDuplicates
// ---------------------------------------------------------------------------

/**
 * Check for duplicate IDs within a list.
 * Returns the IDs that appear more than once (each duplicate listed once).
 */
export function checkDuplicates(ids: string[]): string[] {
  const seen = new Map<string, number>()
  for (const id of ids) {
    seen.set(id, (seen.get(id) ?? 0) + 1)
  }
  return Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
}
