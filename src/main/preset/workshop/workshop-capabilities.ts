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
 * CAPABILITIES_NIVEAU_A/B/C arrays. See the debugger-beauftragung and
 * worker-monitoring SKILL.md files for what the field does and does not
 * track for each of them.
 *
 * Task 13
 */

import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

/** Capability packages for the Workshop. */
export const WORKSHOP_PACKAGES: CapabilityPackage[] = [
  {
    name: 'findings-lesen',
    beschreibung: 'Findings und Items aus dem Graphen aufnehmen — Phase 1 des Sechs-Phasen-Flows',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/findings-lesen/SKILL.md',
  },
  {
    name: 'item-dispatch',
    beschreibung: 'Klassifizierte Items an Worker verteilen: intern, Debugger oder CF-Eskalation',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/item-dispatch/SKILL.md',
  },
  {
    name: 'debugger-beauftragung',
    beschreibung: 'Debugger als phasen-interne Spezialinstanz beauftragen, kein Ketten-Handoff',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/debugger-beauftragung/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'completeness-gate',
    beschreibung: 'Vierstufiges kalibrierbares Completeness-Gate, Prüf-Modus abhängig vom Niveau',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/completeness-gate/SKILL.md',
  },
  {
    name: 'status-konsolidierung',
    beschreibung: 'Fix-Report im P1-Format erzeugen und in den Graphen zurückschreiben',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/status-konsolidierung/SKILL.md',
  },
  {
    name: 'worker-monitoring',
    beschreibung: 'Worker-Sub-Sessions überwachen und Worker-Tasks im gelabelten Format ausgeben',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/worker-monitoring/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'rolling-summary',
    beschreibung: 'Rolling Summary für den Workshop-Bearbeitungsstand über Items, Routing und offene Fragen',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/rolling-summary/SKILL.md',
  },
]
