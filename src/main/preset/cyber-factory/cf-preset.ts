/**
 * CF Preset — lean wave build master.
 *
 * PhasenEntitaet bound to 'development' with orchestrierung=true.
 * Consumes Architect decomposition as fixed input, plans build waves,
 * orchestrates parallel worker sessions.
 *
 * CK-P3CF-001, CK-P3CF-008, CK-P3CF-010
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'
import { getCfCapabilities } from './cf-capabilities'

/** Eight capability packages for the CF (CK-P3CF-010). */
export const CF_CAPABILITIES = [
  'cf-core-identity',
  'welle-plan-guide',
  'worker-startup-protokoll',
  'model-routing-guide',
  'risk-review-guide',
  'welle-plan-granularisierer',
  'rueckweg-protokoll',
  'graph-navigation',
] as const

export type CfCapabilityName = (typeof CF_CAPABILITIES)[number]



/** Default Rahmen at Niveau A. CK-P3CF-001 */
export const CF_RAHMEN: PresetRahmen = {
  id: 'cyber-factory',
  name: 'Cyber Factory',
  rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: ['development'],
  capabilityAnbindung: getCfCapabilities(CapabilityNiveau.A).map(p => p.name),
  graphAnbindung: { lesen: true, schreiben: true },
  personaVorgabe: 'cipher',
  runtime: 'claude-cli-tmux',
  model: '',  // standard = empty = Sonnet-class
  capabilityNiveau: CapabilityNiveau.A,
  harnessBindung: '',
  orchestrierung: true,
}

export function createCfRahmen(niveau: CapabilityNiveau): PresetRahmen {
  const caps = getCfCapabilities(niveau).map(p => p.name)

  return {
    id: 'cyber-factory',
    name: niveau === CapabilityNiveau.C ? 'Development-Worker-Modus' : 'Cyber Factory',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['development'],
    capabilityAnbindung: caps,
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: '',
    capabilityNiveau: niveau,
    harnessBindung: '',
    orchestrierung: true,
  }
}

export function getCfMaxWorkers(niveau: CapabilityNiveau): number {
  if (niveau === CapabilityNiveau.A) return 5
  if (niveau === CapabilityNiveau.B) return 2
  return 1
}
