/**
 * Unified capability access.
 *
 * The path a capability occupies inside a project follows one convention
 * (.claude/capabilities/<id>/SKILL.md) that capabilityRefPath already owns. Packages
 * used to repeat it by hand, which made it the third of three encodings of the same
 * string with nothing keeping them in step. It is derived here instead — except where
 * no convention can produce it, which is the Niveau-B loader's channel route (the
 * `nanoclaw-skill` LoaderType, M2 6.4 — a loader path, not a running system; its carrier
 * changed 2026-08-16) and reference material that lives wherever it lives.
 */

import type { CapabilityPackage } from './capability-schema'
import { CapabilityNiveau } from './niveau'
import { capabilityRefPath } from '../session/capability-refs'
import { getArchitectCapabilities } from './architect/architect-capabilities'
import { getCfCapabilities } from './cyber-factory/cf-capabilities'
import { getSECapabilityPackages } from './systems-engineer/se-capabilities'
import { getTaCapabilityPackages } from './testing-assistant/ta-capabilities'
import { getWorkshopCapabilityPackages } from './workshop/workshop-capabilities'

/** Where this capability's content sits — declared route, or derived from the name. */
export function capabilityPath(pkg: CapabilityPackage): string {
  return pkg.pfad ?? capabilityRefPath(pkg.name)
}

type PackageFactory = (niveau: CapabilityNiveau) => CapabilityPackage[]

const PACKAGES_BY_ENTITY: Record<string, PackageFactory> = {
  'systems-engineer': getSECapabilityPackages,
  'architect': getArchitectCapabilities,
  'cyber-factory': getCfCapabilities,
  'workshop': getWorkshopCapabilityPackages,
  'testing-assistant': getTaCapabilityPackages,
}

/**
 * Capability packages for an entity at a niveau — the single declaration every other
 * consumer derives from. An unknown entity yields [], matching the registry's contract
 * of never throwing on an unknown id.
 */
export function getCapabilityPackages(
  entityId: string,
  niveau: CapabilityNiveau,
): CapabilityPackage[] {
  return PACKAGES_BY_ENTITY[entityId]?.(niveau) ?? []
}
