/**
 * preset-catalog.ts — the presets offered in the session launcher.
 *
 * Release 0.1 shipped four of the eleven roles M5 describes (the ratified cut,
 * M6 section 3.1 / BG-1). The Testing Assistant was added afterwards, moving that
 * line by one: Ideation, Refinement, Audit, Release Manager, Companion and
 * Debugger remain unbuilt.
 *
 * keel-arbeiter is a sixth entry of a different kind, added with the keel-harness
 * adapter (M8): a BeauftragteInstanz for keel's own agent loop, not one of the M5
 * phase-role cut above, and its own model stays unset on every niveau — it is
 * resolved from the `sitzung:niveau-b` assignment slot (model/slots.ts), not
 * declared here.
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
    id: 'testing-assistant',
    label: 'Testing Assistant',
    description: 'Testlauf, Qualitätsurteil und Findings-Dokumentation',
  },
  {
    id: 'keel-arbeiter',
    label: 'keel-Arbeiter (Niveau B)',
    description: 'Ein Auftrag, keels eigene Schleife, lokales oder billiges Modell',
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
