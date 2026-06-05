/**
 * frontmatter-schema.ts — Frontmatter field definitions and validation.
 * CK-P1-002: 10 required + optional fields, ValidationResult per niveau.
 * CK-P1-003: Niveau A/B/C require different field sets.
 * CK-P1-011: Quereinstieg optional fields accepted.
 */

import { isValidDokumentStatus } from './status-validator'

export type Niveau = 'A' | 'B' | 'C'

export interface FrontmatterValidationError {
  field: string
  message: string
  expectedType?: string
}

export interface ValidationResult {
  valid: boolean
  errors: FrontmatterValidationError[]
}

// Niveau A: all 10 fields required
export const REQUIRED_FIELDS_NIVEAU_A = [
  'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status',
  'version', 'projekt', 'adressat', 'req-ids', 'graph-knoten-id',
] as const

// Niveau B: 9 fields (graph-knoten-id optional)
export const REQUIRED_FIELDS_NIVEAU_B = [
  'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status',
  'version', 'projekt', 'adressat', 'req-ids',
] as const

// Niveau C: 7 core fields only
export const REQUIRED_FIELDS_NIVEAU_C = [
  'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status', 'version', 'projekt',
] as const

// Optional fields including CK-P1-011 quereinstieg fields
export const OPTIONAL_FIELDS = [
  'subsystem', 'strang-id', 'vorgaenger-dokument', 'quereinstieg',
  'quereinstieg-begruendung', 'phaseninput-quelle',
] as const

function requiredFieldsFor(niveau: Niveau): readonly string[] {
  if (niveau === 'A') return REQUIRED_FIELDS_NIVEAU_A
  if (niveau === 'B') return REQUIRED_FIELDS_NIVEAU_B
  return REQUIRED_FIELDS_NIVEAU_C
}

export function validateFrontmatter(fm: unknown, niveau: Niveau): ValidationResult {
  const errors: FrontmatterValidationError[] = []

  if (typeof fm !== 'object' || fm === null || Array.isArray(fm)) {
    return {
      valid: false,
      errors: [{ field: 'frontmatter', message: 'must be a non-null object', expectedType: 'object' }],
    }
  }

  const obj = fm as Record<string, unknown>

  for (const field of requiredFieldsFor(niveau)) {
    const val = obj[field]
    if (val === undefined || val === null || val === '') {
      errors.push({ field, message: `missing required field '${field}'`, expectedType: 'string' })
    }
  }

  // Validate status enum if present and non-empty
  if (obj['status'] !== undefined && obj['status'] !== null && obj['status'] !== '') {
    if (!isValidDokumentStatus(String(obj['status']))) {
      errors.push({
        field: 'status',
        message: `invalid status value '${obj['status']}'`,
        expectedType: 'entwurf | freigegeben | abgeloest',
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
