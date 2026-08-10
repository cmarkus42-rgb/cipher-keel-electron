/**
 * Entity registry — maps an entityId to everything a session start needs.
 *
 * The four shipped presets differ in shape: three carry a niveau factory, the
 * Systems Engineer used to carry only a constant (createSERahmen closes that).
 * Callers see one uniform record and never touch the individual modules.
 *
 * CK-ENT-001, CK-ENT-004
 */

import type { PresetRahmen } from './schema'
import { CapabilityNiveau } from './niveau'
import { createArchitectRahmen } from './architect/architect-preset'
import { createCfRahmen } from './cyber-factory/cf-preset'
import { createSERahmen } from './systems-engineer/se-preset'
import { createWorkshopRahmen } from './workshop/workshop-preset'
import { ARCHITECT_BODY, CF_BODY, SE_BODY, WORKSHOP_BODY } from './bodies'
import { resolvePersona, getDefaultPersona } from './shared/persona-loader'

export interface EntityDefinition {
  /** Stable entity id — the value session:create receives. */
  id: string
  /** Typed metadata block for this entity at the requested niveau. */
  rahmen: PresetRahmen
  /** Core instruction text. Never empty. */
  body: string
  /** Persona layer, or null when none is registered. */
  persona: string | null
}

type RahmenFactory = (niveau: CapabilityNiveau) => PresetRahmen

interface EntityEntry {
  rahmen: RahmenFactory
  body: string
}

const ENTITIES: Record<string, EntityEntry> = {
  'systems-engineer': { rahmen: createSERahmen, body: SE_BODY },
  'architect': { rahmen: createArchitectRahmen, body: ARCHITECT_BODY },
  'cyber-factory': { rahmen: createCfRahmen, body: CF_BODY },
  'workshop': { rahmen: createWorkshopRahmen, body: WORKSHOP_BODY },
}

/** All entity ids the registry can build. */
export function listEntityIds(): string[] {
  return Object.keys(ENTITIES)
}

/**
 * Build the full definition for an entity.
 *
 * @param entityId  one of listEntityIds()
 * @param niveau    capability niveau; defaults to the preset's own default (A)
 * @param personasDir optional user persona directory, wins over shipped personas
 * @returns null when the id is unknown — callers must handle it, never assume.
 */
export function getEntityDefinition(
  entityId: string,
  niveau: CapabilityNiveau = CapabilityNiveau.A,
  personasDir?: string,
): EntityDefinition | null {
  const entry = ENTITIES[entityId]
  if (!entry) return null

  const rahmen = entry.rahmen(niveau)
  // The rahmen may leave personaVorgabe empty (workshop does) — the catalog default fills in.
  const vorgabe = rahmen.personaVorgabe || getDefaultPersona(entityId) || ''

  // Two different nulls, and only one of them is benign: "no persona configured" is a
  // valid state, "a persona was named and could not be found" is a config error. Folding
  // both into a silent null is how a typo in personaVorgabe ships unnoticed.
  let persona: string | null = null
  if (vorgabe) {
    persona = resolvePersona(vorgabe, personasDir)
    if (persona === null) {
      console.warn(
        `[preset/registry] entity '${entityId}' requests persona '${vorgabe}', ` +
        'which resolves to nothing — the session will start without a persona layer'
      )
    }
  }

  return { id: entityId, rahmen, body: entry.body, persona }
}
