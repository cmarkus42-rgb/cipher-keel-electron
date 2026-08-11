/**
 * Workshop Capability Packages.
 *
 * The Workshop's per-Niveau capability ID lists (A: 7, B: 6, C: 5) live in
 * niveau-config.ts (CAPABILITIES_NIVEAU_A/B/C, exposed via
 * getNiveauWorkshopConfig). This module supplies the CapabilityPackage
 * objects those IDs resolve to — one object per capability, independent of
 * Niveau.
 *
 * rolling-summary is shared with the Architect and the Systems Engineer and
 * points at the same file — one capability, one source of truth, referenced
 * from all three presets.
 *
 * niveauMinimum here is documentation metadata: nothing in
 * getNiveauWorkshopConfig or workshop-preset.ts consumes it — the actual
 * per-Niveau gating runs entirely through the explicit
 * CAPABILITIES_NIVEAU_A/B/C arrays. Because nothing consumes it, it can
 * silently drift out of sync with those arrays — the test suite pins it in
 * place (tests/preset/workshop/workshop-capability-skills.test.ts, the
 * niveauMinimum-sync assertion, same shape as tests/se-capabilities.test.ts):
 * a package flagged 'A' must be absent from Niveau B and C; a package
 * flagged 'B' must be present at A and B but absent at C; an unflagged
 * package must be present everywhere it's expected. See the
 * debugger-beauftragung and worker-monitoring SKILL.md files for what the
 * field means for each of them.
 *
 * Task 13; niveauMinimum on debugger-beauftragung corrected 'B' -> 'A' in
 * fix round 1 (it is Niveau-A-only per CAPABILITIES_NIVEAU_A/B/C; the prior
 * value came from a stale comment in niveau-config.ts, now corrected there
 * too).
 */

import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

/** Capability packages for the Workshop. */
export const WORKSHOP_PACKAGES: CapabilityPackage[] = [
  {
    name: 'findings-lesen',
    beschreibung: 'Findings und Items aus dem Graphen aufnehmen — Phase 1 des Sechs-Phasen-Flows',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'item-dispatch',
    beschreibung: 'Klassifizierte Items an Worker verteilen: intern, Debugger oder CF-Eskalation',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'debugger-beauftragung',
    beschreibung: 'Debugger als phasen-interne Spezialinstanz beauftragen, kein Ketten-Handoff',
    loader: LoaderType.SkillMd,
    niveauMinimum: 'A',
  },
  {
    name: 'completeness-gate',
    beschreibung: 'Vierstufiges kalibrierbares Completeness-Gate, Prüf-Modus abhängig vom Niveau',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'status-konsolidierung',
    beschreibung: 'Fix-Report im P1-Format erzeugen und in den Graphen zurückschreiben',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'worker-monitoring',
    beschreibung: 'Worker-Sub-Sessions überwachen und Worker-Tasks im gelabelten Format ausgeben',
    loader: LoaderType.SkillMd,
    niveauMinimum: 'B',
  },
  {
    name: 'rolling-summary',
    beschreibung: 'Rolling Summary für den Workshop-Bearbeitungsstand über Items, Routing und offene Fragen',
    loader: LoaderType.SkillMd,
  },
]
