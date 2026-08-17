/**
 * Capability Package Schema — CK-ENT-006, CK-ENT-007, CK-ENT-017
 *
 * Types, validation, and helpers for the modular capability tree.
 */

export enum LoaderType {
  SkillMd = 'skill-md',
  /**
   * The loader path for Niveau B (M2 §6.4). Named after NanoClaw, its original carrier,
   * which was superseded on 2026-08-16 by keel's own harness — the path is still needed,
   * only the name is stale. The rename stays deferred, but not because it is a data
   * migration: every CapabilityPackage in this repo is code-defined, and nothing
   * serialises a loader value. It belongs with the harness build instead, where the
   * path gets its new carrier, so the name can be chosen once with knowledge of what
   * it becomes rather than twice in ignorance — renaming it here would mean choosing a
   * name for something whose replacement does not exist yet.
   */
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
  /**
   * Path to the package file, or channel route for nanoclaw-skill.
   * Optional for skill-md: derived from the name via capabilityPath().
   */
  pfad?: string
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

/**
 * Filter packages by niveau using their declared niveauMinimum.
 *
 * niveauMinimum reads as "the least rich niveau this package survives at": 'A' means
 * Niveau A only, 'B' means A and B, absent means everywhere. Niveau C is deliberately
 * not decided here — what survives at C differs per entity and stays in the entity's
 * own getter, where its reason can be written down next to it.
 *
 * Lives here rather than in capabilities.ts because the entity getters need it and
 * capabilities.ts imports them — putting it there would close an import cycle.
 */
export function filterByNiveau<T extends { niveauMinimum?: 'A' | 'B' | 'C' }>(
  packages: T[],
  niveau: 'A' | 'B' | 'C',
): T[] {
  return packages.filter((pkg) => {
    if (!pkg.niveauMinimum) return true
    if (niveau === 'A') return true
    if (niveau === 'B') return pkg.niveauMinimum !== 'A'
    return false
  })
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

  // pfad is derivable for skill-md (from the name, see capabilityPath) and meaningless
  // for inline (content comes from niveauCExtrakt). nanoclaw-skill carries a channel
  // route and reference-material a file that no convention produces — for those it stays
  // required.
  const pfadRequired = p.loader === LoaderType.NanoClawSkill
    || p.loader === LoaderType.ReferenceMaterial
  if (pfadRequired && (typeof p.pfad !== 'string' || p.pfad.trim() === '')) {
    errors.push(`pfad is required for loader '${String(p.loader)}'`)
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
