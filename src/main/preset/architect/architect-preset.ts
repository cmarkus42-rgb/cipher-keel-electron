/**
 * Architect Preset — long-running subsystem architecture lead.
 *
 * PhasenEntitaet bound to 'architecture' phase with graphAnbindung override
 * (read wide, write full via DE-2). Model heavy (Opus) at Niveau A,
 * standard at Niveau B. Extended lifecycle across all build waves.
 *
 * CK-P3A-001, CK-P3A-012, CK-P3A-014
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'
import { getArchitectCapabilities } from './architect-capabilities'

/** Seven capability packages for the Architect (CK-P3A-012). */
export const ARCHITECT_CAPABILITIES = [
  'architect-core-identity',
  'subsystem-zerlegung-guide',
  'adr-format-guide',
  'anforderungspaket-formulierer',
  'niveau-c-formulierer',
  'coaching-loop-guide',
  'rolling-summary',
] as const

export type ArchitectCapabilityName = (typeof ARCHITECT_CAPABILITIES)[number]



/** Default Rahmen at Niveau A. CK-P3A-001 */
export const ARCHITECT_RAHMEN: PresetRahmen = {
  id: 'architect',
  name: 'Architect',
  rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: ['architecture'],
  capabilityAnbindung: getArchitectCapabilities(CapabilityNiveau.A).map(p => p.name),
  graphAnbindung: { lesen: true, schreiben: true },
  personaVorgabe: 'theaitetos',
  runtime: 'claude-cli-tmux',
  model: 'heavy',
  capabilityNiveau: CapabilityNiveau.A,
  harnessBindung: '',
}

/**
 * Create a PresetRahmen for the Architect at the given niveau.
 * CK-P3A-012, CK-P3A-014
 */
export function createArchitectRahmen(niveau: CapabilityNiveau): PresetRahmen {
  const caps = getArchitectCapabilities(niveau).map(p => p.name)

  return {
    id: 'architect',
    name: 'Architect',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['architecture'],
    capabilityAnbindung: caps,
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'theaitetos',
    runtime: 'claude-cli-tmux',
    model: niveau === CapabilityNiveau.A ? 'heavy' : '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}

/** Max subsystems per niveau. CK-P3A-014, CK-P3A-009 */
export function getArchitectMaxSubsystems(niveau: CapabilityNiveau): number | null {
  if (niveau === CapabilityNiveau.A) return null  // unlimited
  if (niveau === CapabilityNiveau.B) return 3
  return 1  // Niveau C: Schnittstellen-Stempel-Modus
}
