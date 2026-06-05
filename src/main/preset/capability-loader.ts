/**
 * Capability Loader — CK-ENT-006, CK-ENT-007
 *
 * Dispatches to the correct loading strategy based on the package's loader type.
 * Dependency resolution and cycle detection are handled by CapabilityTree.
 */

import { readFile } from 'fs/promises'
import { LoaderType, type CapabilityPackage } from './capability-schema'

/**
 * Load the full content of a capability package.
 *
 * - skill-md: reads the file at `pfad` (SKILL.md for Level A)
 * - nanoclaw-skill: returns a JSON payload for the NanoClaw channel
 * - reference-material: reads the file at `pfad` as reference (not as instruction)
 * - inline: returns `niveauCExtrakt` directly
 */
export async function loadCapabilityContent(pkg: CapabilityPackage): Promise<string> {
  switch (pkg.loader) {
    case LoaderType.SkillMd:
      return readFile(pkg.pfad, 'utf8')

    case LoaderType.NanoClawSkill:
      return JSON.stringify({ type: 'nanoclaw-skill', name: pkg.name, pfad: pkg.pfad })

    case LoaderType.ReferenceMaterial:
      return readFile(pkg.pfad, 'utf8')

    case LoaderType.Inline: {
      if (!pkg.niveauCExtrakt) {
        throw new Error(
          `Capability package '${pkg.name}' has loader 'inline' but no niveauCExtrakt defined`
        )
      }
      return pkg.niveauCExtrakt
    }

    default: {
      const _exhaustive: never = pkg.loader
      throw new Error(`Unknown loader type: ${_exhaustive}`)
    }
  }
}
