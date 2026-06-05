/**
 * SE Preset — Systems Engineer as coordination hub.
 *
 * QuerliegenSE: phasenübergreifend, triggers other entities,
 * reads and writes the full graph, runs at Niveau A with heavy model.
 *
 * CK-3C-002
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'
import type { Preset } from '../types'

/** Eight capability packages bound to the SE at Niveau A. */
export const SE_CAPABILITIES = [
  'se-core-identity',
  'gate-urteil-guide',
  'trigger-zeiger-format',
  'steuer-ueberblick-tool',
  'companion-memory-tools',
  'handoff-logik-guide',
  'rolling-summary',
  'graph-navigation-advanced',
] as const

/** Typed metadata block for the Systems Engineer preset. CK-3C-002 */
export const SE_RAHMEN: PresetRahmen = {
  id: 'systems-engineer',
  name: 'Systems Engineer',
  rollenTyp: RollenTyp.QuerliegenSE,
  phasenBindung: [],
  capabilityAnbindung: [...SE_CAPABILITIES],
  graphAnbindung: { lesen: true, schreiben: true },
  personaVorgabe: 'cipher',
  runtime: 'claude-cli-tmux',
  model: 'heavy',
  capabilityNiveau: CapabilityNiveau.A,
  harnessBindung: '',
}

/**
 * Returns a Preset object for the Systems Engineer.
 * bodyPath and personaPath are resolved at runtime by the preset machinery.
 */
export function createSEPreset(): Preset {
  return {
    id: 'systems-engineer',
    name: 'Systems Engineer',
    entityId: 'systems-engineer',
    rahmen: SE_RAHMEN,
    bodyPath: '',
    personaPath: '',
  }
}
