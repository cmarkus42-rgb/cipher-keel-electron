/**
 * persona-loader.ts — Persona file loading and default lookup.
 *
 * Phase 3c / Task 8
 *
 * loadPersona(vorgabe, dir?) reads <dir>/<vorgabe>.md and returns its content,
 * or null when the file does not exist or cannot be read.
 *
 * getDefaultPersona(presetId) looks up the persona identifier for a preset
 * in the bundled persona-defaults.json.
 */

import fs from 'node:fs'
import path from 'node:path'
import defaultsJson from './persona-defaults.json'

// ---------------------------------------------------------------------------
// Defaults map (re-exported for direct inspection in tests)
// ---------------------------------------------------------------------------

export const PERSONA_DEFAULTS: Record<string, string> = defaultsJson

/** Standard personas directory, co-located with this module. */
const DEFAULT_PERSONAS_DIR = path.join(__dirname, 'personas')

// ---------------------------------------------------------------------------
// loadPersona
// ---------------------------------------------------------------------------

/**
 * Load a persona file by its identifier.
 *
 * Reads `<personasDir>/<vorgabe>.md` and returns the file content as a string.
 * Returns null when:
 *   - vorgabe is empty
 *   - the file does not exist
 *   - the directory does not exist
 *   - any other read error occurs
 *
 * @param vorgabe    Persona identifier, e.g. 'cipher'
 * @param personasDir  Directory containing persona .md files (default: ./personas)
 */
export function loadPersona(vorgabe: string, personasDir?: string): string | null {
  if (!vorgabe) return null

  const dir = personasDir ?? DEFAULT_PERSONAS_DIR
  const filePath = path.join(dir, `${vorgabe}.md`)

  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// getDefaultPersona
// ---------------------------------------------------------------------------

/**
 * Look up the default persona identifier for a preset.
 *
 * Returns the persona string (e.g. 'cipher') or null when no default is registered.
 */
export function getDefaultPersona(presetId: string): string | null {
  if (!presetId) return null
  return PERSONA_DEFAULTS[presetId] ?? null
}
