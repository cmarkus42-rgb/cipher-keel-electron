/**
 * PresetRahmen — typed metadata block for preset configuration.
 *
 * All 11 fields from M2 v1.1 §8.1 are defined here.
 * validatePresetRahmen() checks required fields and enum values.
 * Unknown fields in the input are silently ignored.
 * Empty optional fields are treated as defaults, not errors.
 *
 * CK-ENT-004, CK-ENT-023
 */

import { CapabilityNiveau } from './niveau'

/** Four role types from M5 §7 (Vier Lagen). CK-ENT-023 */
export enum RollenTyp {
  PhasenEntitaet = 'phasen-entitaet',
  QuerliegenSE = 'querliegen-se',
  QuerliegenCompanion = 'querliegen-companion',
  BeauftragteInstanz = 'beauftragte-instanz',
}

export interface GraphAnbindung {
  lesen: boolean
  schreiben: boolean
}

/** Typed metadata block read by the keel machinery. CK-ENT-004 */
export interface PresetRahmen {
  /** Unique ID for this rahmen */
  id: string
  /** Human-readable name */
  name: string
  /** Role classification */
  rollenTyp: RollenTyp
  /** Phase(s) this preset can carry (loose coupling, array). CK-ENT-024 */
  phasenBindung: string[]
  /** Capability package IDs assigned to this preset */
  capabilityAnbindung: string[]
  /** Read/write profile for graph access */
  graphAnbindung: GraphAnbindung
  /** Default persona identifier (empty = no persona override) */
  personaVorgabe: string
  /** Runtime path declaration — used for adapter lookup. CK-ENT-010 */
  runtime: string
  /** Model override (empty = harness default) */
  model: string
  /** Capability niveau A | B | C. CK-ENT-003 */
  capabilityNiveau: CapabilityNiveau
  /** Specific harness this preset is bound to (empty = any) */
  harnessBindung: string
}

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

const REQUIRED_FIELDS: ReadonlyArray<keyof PresetRahmen> = ['id', 'name', 'rollenTyp', 'capabilityNiveau']

const VALID_ROLLEN_TYPEN = new Set<string>(Object.values(RollenTyp))
const VALID_NIVEAUS = new Set<string>(Object.values(CapabilityNiveau))

/**
 * Validate a preset rahmen object.
 *
 * Required fields: id, name, rollenTyp, capabilityNiveau
 * Enum fields: rollenTyp and capabilityNiveau must be valid enum values
 * Unknown fields: silently ignored
 * Empty optional fields: treated as defaults, not errors
 */
export function validatePresetRahmen(rahmen: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (typeof rahmen !== 'object' || rahmen === null) {
    return {
      valid: false,
      errors: [{ field: 'rahmen', message: 'Input must be an object' }],
    }
  }

  const obj = rahmen as Record<string, unknown>

  // Check required fields — must be present and non-empty
  for (const field of REQUIRED_FIELDS) {
    const value = obj[field]
    if (value === undefined || value === null || value === '') {
      errors.push({ field, message: `Required field '${field}' is missing or empty` })
    }
  }

  // Validate rollenTyp enum (only when a value is present — absence already caught above)
  const rollenTypValue = obj['rollenTyp']
  if (rollenTypValue !== undefined && rollenTypValue !== null && rollenTypValue !== '') {
    if (!VALID_ROLLEN_TYPEN.has(String(rollenTypValue))) {
      errors.push({
        field: 'rollenTyp',
        message: `Invalid rollenTyp '${rollenTypValue}'. Valid values: ${[...VALID_ROLLEN_TYPEN].join(', ')}`,
      })
    }
  }

  // Validate capabilityNiveau enum (only when a value is present)
  const niveauValue = obj['capabilityNiveau']
  if (niveauValue !== undefined && niveauValue !== null && niveauValue !== '') {
    if (!VALID_NIVEAUS.has(String(niveauValue))) {
      errors.push({
        field: 'capabilityNiveau',
        message: `Invalid capabilityNiveau '${niveauValue}'. Valid values: A, B, C`,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
