/**
 * filename-convention.ts — Filename generator, validator, and parser.
 * CK-P1-005: <dokument-typ>.md or <dokument-typ>_<subsystem>.md
 *            with optional _<version> suffix for testing-fixing loops.
 */

// Canonical source: src/main/graph/node-types.ts
export { DOKUMENT_TYPEN, type DokumentTyp } from '../graph/node-types'
import { DOKUMENT_TYPEN } from '../graph/node-types'

/**
 * Generates a filename following the P1 naming convention.
 * - `<dokument-typ>.md`
 * - `<dokument-typ>_<subsystem>.md`
 * - `<dokument-typ>_<subsystem>_<version>.md`  (Testing-Fixing-Loop)
 * - `<dokument-typ>_<version>.md`              (version without subsystem)
 */
export function generateFilename(
  dokumentTyp: string,
  subsystem?: string,
  version?: string,
): string {
  let name = dokumentTyp
  if (subsystem) name += `_${subsystem}`
  if (version) name += `_${version}`
  return `${name}.md`
}

/**
 * Returns true if `filename` follows the P1 naming convention:
 * - ends with .md
 * - first segment (before first `_`) is a valid DOKUMENT_TYP
 */
export function validateFilename(filename: string): boolean {
  if (!filename.endsWith('.md')) return false
  const base = filename.slice(0, -3)
  if (!base) return false
  const firstSegment = base.split('_')[0]
  return (DOKUMENT_TYPEN as readonly string[]).includes(firstSegment)
}

/**
 * Parses a P1 filename back into its components.
 * Version is detected by pattern /^v\d+\.\d+$/.
 */
export function parseFilename(filename: string): {
  dokumentTyp: string
  subsystem?: string
  version?: string
} {
  const base = filename.replace(/\.md$/, '')
  const parts = base.split('_')
  const dokumentTyp = parts[0]

  if (parts.length === 1) return { dokumentTyp }

  const lastPart = parts[parts.length - 1]
  const isVersion = /^v\d+\.\d+$/.test(lastPart)

  if (parts.length === 2) {
    return isVersion
      ? { dokumentTyp, version: lastPart }
      : { dokumentTyp, subsystem: lastPart }
  }

  // 3+ parts
  if (isVersion) {
    const subsystem = parts.slice(1, -1).join('_')
    return { dokumentTyp, subsystem, version: lastPart }
  }

  return { dokumentTyp, subsystem: parts.slice(1).join('_') }
}
