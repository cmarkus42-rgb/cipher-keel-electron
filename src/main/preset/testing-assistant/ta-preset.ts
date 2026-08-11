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
 * No rolling-summary (fix round 1, Finding A): the shared rolling-summary mechanism
 * (src/main/preset/shared/rolling-summary.ts) defines a RollingSummaryConfig for the
 * Architect, the Systems Engineer, the Workshop and the Cyber Factory — none for the
 * Testing Assistant — and the shared SKILL.md enumerates exactly those three
 * consumers. Carrying the capability without triggers or fields would have been a
 * capability with nothing to do.
 *
 * The Niveau cuts below are derived from src/main/preset/schema.ts's tool sets, not
 * guessed (fix round 1, Finding B): NIVEAU_A_TOOLS carries Bash, NIVEAU_B_TOOLS is the
 * same set minus Bash, NIVEAU_C_TOOLS is Read only.
 *   - suite-lauf-protokoll needs Bash (`npm test`/`npm run typecheck`/`npm run lint`
 *     are shell commands) — absent everywhere Bash is absent, i.e. Niveau B and C.
 *   - testqualitaet-beurteilung and adversarial-probing are read-and-reason
 *     capabilities — no execution required — so they survive without Bash, at
 *     Niveau B.
 *   - findings-dokumentation needs Write (a graph node) — present at B, but Niveau C
 *     has Read only, so it cannot write there either.
 *   - At Niveau C only Read remains: no capability but the core identity itself can
 *     run, so only ta-core-identity survives, unchanged from before this fix round.
 *
 * Task 15; capability cut corrected fix round 1 (2026-08-11).
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'

/** Five capability packages for the Testing Assistant at Niveau A (Task 15, fix round 1). */
export const TA_CAPABILITIES = [
  'ta-core-identity',
  'suite-lauf-protokoll',
  'testqualitaet-beurteilung',
  'adversarial-probing',
  'findings-dokumentation',
] as const

export type TaCapabilityName = (typeof TA_CAPABILITIES)[number]

/**
 * Niveau B: 4 capabilities, no suite-lauf-protokoll. NIVEAU_B_TOOLS
 * (src/main/preset/schema.ts) carries no Bash, and suite-lauf-protokoll's entire
 * job — running npm test/typecheck/lint — is a shell operation. Without Bash there
 * is nothing left of that capability to load; it does not survive in reduced form.
 */
const NIVEAU_B_CAPABILITIES: string[] = [
  'ta-core-identity',
  'testqualitaet-beurteilung',
  'adversarial-probing',
  'findings-dokumentation',
]

/**
 * Niveau C: 1 capability (core identity only). NIVEAU_C_TOOLS is Read only — no
 * Write, so findings-dokumentation cannot run either; nothing but the identity file
 * itself is loaded. Not "inline": the Testing Assistant does not use
 * LoaderType.Inline or niveauCExtrakt anywhere — materialisation copies this
 * capability's SKILL.md as-is at every niveau it is loaded at.
 */
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
