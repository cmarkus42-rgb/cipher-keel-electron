/**
 * Capability Package Schema — CK-ENT-006, CK-ENT-007, CK-ENT-017
 *
 * Types, validation, and helpers for the modular capability tree.
 */

export enum LoaderType {
  SkillMd = 'skill-md',
  NanoClawSkill = 'nanoclaw-skill',
  ReferenceMaterial = 'reference-material',
  Inline = 'inline',
}

export interface CapabilityPackage {
  /** Unique identifier for this capability package */
  name: string
  /** Short description for the inventory (≤ 100 tokens / ~400 chars heuristic) */
  beschreibung: string
  /** How this package is loaded at runtime */
  loader: LoaderType
  /** Path to the package file (or channel route for nanoclaw-skill) */
  pfad: string
  /** Minimum capability level required to load this package */
  niveauMinimum?: 'A' | 'B' | 'C'
  /** Inline extract for Level C (≤ 500 tokens). Required when loader is 'inline'. */
  niveauCExtrakt?: string
  /** Names of other packages this package depends on */
  abhaengigkeiten?: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/** Estimate token count using ~4 chars per token heuristic. */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}

const VALID_LOADER_TYPES = new Set<string>(Object.values(LoaderType))

export function validateCapabilityPackage(pkg: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof pkg !== 'object' || pkg === null) {
    return { valid: false, errors: ['Package must be a non-null object'] }
  }

  const p = pkg as Record<string, unknown>

  if (typeof p.name !== 'string' || p.name.trim() === '') {
    errors.push('name is required and must be a non-empty string')
  }

  if (typeof p.beschreibung !== 'string' || p.beschreibung.trim() === '') {
    errors.push('beschreibung is required and must be a non-empty string')
  } else if (estimateTokenCount(p.beschreibung) > 100) {
    errors.push(
      `beschreibung exceeds 100 tokens (estimated ${estimateTokenCount(p.beschreibung)} tokens)`
    )
  }

  if (typeof p.loader !== 'string' || !VALID_LOADER_TYPES.has(p.loader)) {
    errors.push(`loader must be one of: ${Array.from(VALID_LOADER_TYPES).join(', ')}`)
  }

  // pfad can be empty only for inline loader (content comes from niveauCExtrakt)
  const loaderIsInline = p.loader === LoaderType.Inline
  if (typeof p.pfad !== 'string' || (!loaderIsInline && p.pfad.trim() === '')) {
    errors.push('pfad is required and must be a non-empty string (except for inline loader)')
  }

  if (p.niveauMinimum !== undefined) {
    if (!['A', 'B', 'C'].includes(p.niveauMinimum as string)) {
      errors.push('niveauMinimum must be A, B, or C')
    }
  }

  if (p.abhaengigkeiten !== undefined) {
    if (
      !Array.isArray(p.abhaengigkeiten) ||
      (p.abhaengigkeiten as unknown[]).some((d) => typeof d !== 'string')
    ) {
      errors.push('abhaengigkeiten must be an array of strings')
    }
  }

  return { valid: errors.length === 0, errors }
}
