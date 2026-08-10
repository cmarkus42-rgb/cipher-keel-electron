/**
 * Testing Assistant Preset — the testing phase, systematic and adversarial probing.
 *
 * PhasenEntitaet bound to 'testing' (M5 §8.4). Reads the build-paket a Cyber-Factory
 * wave produced (default addressee 'testing', src/main/p1/default-addressee.ts:26),
 * writes a test-findings uebergabedokument back (default addressee 'fixing', same
 * file:27) — the graph edge is 'verifiziert': test-findings -> build-paket
 * (src/main/graph/edge-types.ts:284). No orchestrierung: the Testing Assistant has no
 * worker sub-sessions, unlike the Cyber Factory or the Workshop.
 *
 * model: '' (harness default), not 'heavy'. Only the Systems Engineer's Gate-Urteil
 * is modelled as the modell-sensitive judgment call in M5 (§4, "Annahme — die
 * modellsensitivste Rolle"); running and assessing tests is not that judgment.
 *
 * Task 15
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'

/** Six capability packages for the Testing Assistant at Niveau A (Task 15). */
export const TA_CAPABILITIES = [
  'ta-core-identity',
  'suite-lauf-protokoll',
  'testqualitaet-beurteilung',
  'adversarial-probing',
  'findings-dokumentation',
  'rolling-summary',
] as const

export type TaCapabilityName = (typeof TA_CAPABILITIES)[number]

/** Niveau B: 5 capabilities (no rolling-summary — mirrors the Architect's cut). */
const NIVEAU_B_CAPABILITIES: string[] = [
  'ta-core-identity',
  'suite-lauf-protokoll',
  'testqualitaet-beurteilung',
  'adversarial-probing',
  'findings-dokumentation',
]

/** Niveau C: 1 capability (core identity only, inline). */
const NIVEAU_C_CAPABILITIES: string[] = [
  'ta-core-identity',
]

/** Default Rahmen at Niveau A. */
export const TA_RAHMEN: PresetRahmen = {
  id: 'testing-assistant',
  name: 'Testing Assistant',
  rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: ['testing'],
  capabilityAnbindung: [...TA_CAPABILITIES],
  graphAnbindung: { lesen: true, schreiben: true },
  personaVorgabe: 'cipher',
  runtime: 'claude-cli-tmux',
  model: '',
  capabilityNiveau: CapabilityNiveau.A,
  harnessBindung: '',
}

/**
 * Create a PresetRahmen for the Testing Assistant at the given niveau.
 */
export function createTaRahmen(niveau: CapabilityNiveau): PresetRahmen {
  const caps = niveau === CapabilityNiveau.A
    ? [...TA_CAPABILITIES]
    : niveau === CapabilityNiveau.B
      ? NIVEAU_B_CAPABILITIES
      : NIVEAU_C_CAPABILITIES

  return {
    id: 'testing-assistant',
    name: 'Testing Assistant',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['testing'],
    capabilityAnbindung: caps,
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}
