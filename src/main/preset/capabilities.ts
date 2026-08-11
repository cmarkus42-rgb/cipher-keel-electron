/**
 * Unified capability access.
 *
 * The path a capability occupies inside a project follows one convention
 * (.claude/capabilities/<id>/SKILL.md) that capabilityRefPath already owns. Packages
 * used to repeat it by hand, which made it the third of three encodings of the same
 * string with nothing keeping them in step. It is derived here instead — except where
 * no convention can produce it, which is the nanoclaw-skill channel route (M2 6.4)
 * and reference material that lives wherever it lives.
 */

import type { CapabilityPackage } from './capability-schema'
import { capabilityRefPath } from '../session/capability-refs'

/** Where this capability's content sits — declared route, or derived from the name. */
export function capabilityPath(pkg: CapabilityPackage): string {
  return pkg.pfad ?? capabilityRefPath(pkg.name)
}
