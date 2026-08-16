/**
 * PresetRahmen — typed metadata block for preset configuration.
 *
 * All 11 fields from M2 v1.1 §8.1 are defined here.
 * validatePresetRahmen() checks required fields, enum values, and all 4 Anbindungen (ENT-025).
 * Unknown fields in the input are silently ignored.
 * Empty optional fields are treated as defaults, not errors (except capabilityAnbindung).
 *
 * generatePermissions() generates a settings.json fragment for Niveau A (ENT-021).
 *
 * CK-ENT-004, CK-ENT-023, CK-ENT-025, CK-ENT-021
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
  /** Whether this preset acts as an orchestrator (spawns/controls other presets). DE-5 */
  orchestrierung?: boolean
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
 * Known non-empty runtime values a PresetRahmen may declare. Empty string is also valid
 * (maps to default adapter). Validity here is a schema-level fact, not a promise that an
 * adapter exists yet for the value — AdapterRegistry (src/main/agent/registry.ts) is
 * where "known" and "has a live adapter" are told apart, since `keel-harness` is known
 * but not yet built.
 * CK-ENT-010, CK-ENT-028, ENT-025
 */
export const KNOWN_RUNTIMES: ReadonlySet<string> = new Set<string>([
  'claude-cli-tmux',
  // The own agent loop (M8). Third value, added when NanoClaw was superseded on
  // 2026-08-16 — `nanoclaw-channel-route` was removed in the same change. Not yet backed
  // by an adapter — see RUNTIMES_WITHOUT_ADAPTER in agent/registry.ts.
  'keel-harness',
])

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

  // ENT-025: graphAnbindung must be set (not null/undefined)
  const graphAnbindungValue = obj['graphAnbindung']
  if (graphAnbindungValue === undefined || graphAnbindungValue === null) {
    errors.push({
      field: 'graphAnbindung',
      message: "Required field 'graphAnbindung' must be a non-null object",
    })
  }

  // ENT-025: capabilityAnbindung must be a non-empty array
  const capabilityAnbindungValue = obj['capabilityAnbindung']
  if (
    !Array.isArray(capabilityAnbindungValue) ||
    (capabilityAnbindungValue as unknown[]).length === 0
  ) {
    errors.push({
      field: 'capabilityAnbindung',
      message: "Required field 'capabilityAnbindung' must be a non-empty array",
    })
  }

  // ENT-025: runtime must be empty (default) or a known adapter name
  const runtimeValue = obj['runtime']
  if (
    runtimeValue !== undefined &&
    runtimeValue !== null &&
    runtimeValue !== '' &&
    !KNOWN_RUNTIMES.has(String(runtimeValue))
  ) {
    errors.push({
      field: 'runtime',
      message:
        `Unknown runtime '${runtimeValue}'. Known runtimes: ${[...KNOWN_RUNTIMES].join(', ')}`,
    })
  }

  // Validate orchestrierung — must be boolean if present
  const orchestrierungValue = obj['orchestrierung']
  if (orchestrierungValue !== undefined && orchestrierungValue !== null && typeof orchestrierungValue !== 'boolean') {
    errors.push({
      field: 'orchestrierung',
      message: `orchestrierung must be a boolean, got '${typeof orchestrierungValue}'`,
    })
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// ENT-021: generatePermissions — settings.json fragment
// ---------------------------------------------------------------------------

/** A .claude/settings.json permissions fragment generated from a PresetRahmen. */
export interface SettingsFragment {
  permissions: {
    allow: string[]
    deny: string[]
  }
}

/** Allowed tool patterns for Niveau A (full SE harness). */
const NIVEAU_A_TOOLS: readonly string[] = [
  'Read(*)',
  'Write(*)',
  'Edit(*)',
  'Glob(*)',
  'Grep(*)',
  'Bash(*)',
]

/** Allowed tool patterns for Niveau B (no Bash). */
const NIVEAU_B_TOOLS: readonly string[] = [
  'Read(*)',
  'Write(*)',
  'Edit(*)',
  'Glob(*)',
  'Grep(*)',
]

/** Allowed tool patterns for Niveau C (read-only). */
const NIVEAU_C_TOOLS: readonly string[] = [
  'Read(*)',
]

/**
 * Generate a .claude/settings.json permissions fragment for the given preset.
 *
 * Niveau A: full tool set (SE harness with Bash)
 * Niveau B: read/write tools, no Bash
 * Niveau C: read-only
 *
 * ENT-021
 */
export function generatePermissions(rahmen: PresetRahmen): SettingsFragment {
  let allow: readonly string[]
  switch (rahmen.capabilityNiveau) {
    case CapabilityNiveau.A:
      allow = NIVEAU_A_TOOLS
      break
    case CapabilityNiveau.B:
      allow = NIVEAU_B_TOOLS
      break
    case CapabilityNiveau.C:
      allow = NIVEAU_C_TOOLS
      break
    default:
      allow = NIVEAU_C_TOOLS
  }
  return { permissions: { allow: [...allow], deny: [] } }
}
