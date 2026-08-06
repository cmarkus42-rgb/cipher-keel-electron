/**
 * preset-catalog.ts — the presets offered in the session launcher.
 *
 * Release 0.1 ships four of the eleven roles M5 describes. That is the ratified cut
 * (M6 section 3.1 / BG-1), not a backlog: Ideation, Refinement, Testing Assistant,
 * Audit, Release Manager, Companion and Debugger are post-0.1.
 *
 * CK-ENT-001
 */

export interface PresetChoice {
  /** Stable id — also the entityId passed to session:create. */
  id: string
  /** Short label for the launcher. */
  label: string
  /** One line explaining what the role is for. */
  description: string
  /** Exactly one entry is the default selection. */
  isDefault?: boolean
}

export const PRESET_CATALOG: readonly PresetChoice[] = [
  {
    id: 'systems-engineer',
    label: 'Systems Engineer',
    description: 'Anforderungen, Gate-Urteile und Phasenfortschritt',
  },
  {
    id: 'architect',
    label: 'Architect',
    description: 'Architekturentscheidungen und Schnittstellen',
  },
  {
    id: 'cyber-factory',
    label: 'Cyber Factory',
    description: 'Wellenplanung und Worker-Orchestrierung',
  },
  {
    id: 'workshop',
    label: 'Workshop',
    description: 'Freies Arbeiten am Projekt',
    isDefault: true,
  },
] as const

export function isKnownPresetId(id: string): boolean {
  return PRESET_CATALOG.some(p => p.id === id)
}

export function defaultPresetId(): string {
  return PRESET_CATALOG.find(p => p.isDefault)?.id ?? PRESET_CATALOG[0].id
}
