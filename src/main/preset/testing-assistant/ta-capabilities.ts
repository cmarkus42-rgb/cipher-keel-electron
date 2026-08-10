/**
 * Testing Assistant Capability Packages.
 *
 * Six packages at Niveau A (TA_CAPABILITIES, ta-preset.ts). Five carry their own
 * SKILL.md under ./capabilities/<id>/; rolling-summary is shared with the
 * Architect, the Systems Engineer and the Workshop and points at the same file —
 * one capability, one source of truth, referenced from all four presets.
 *
 * Unlike architect-capabilities.ts / se-capabilities.ts, no niveauMinimum is set
 * here: the per-niveau narrowing lives entirely in ta-preset.ts's explicit
 * NIVEAU_B_CAPABILITIES / NIVEAU_C_CAPABILITIES lists, so there is no second,
 * derived representation of the same cut that could drift out of sync with it.
 *
 * Task 15
 */

import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

/** Capability packages for the Testing Assistant. */
export const TA_PACKAGES: CapabilityPackage[] = [
  {
    name: 'ta-core-identity',
    beschreibung: 'Kern-Identität des Testing Assistant und die schärfste Grenze: fixt nicht, ändert keinen Code',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/ta-core-identity/SKILL.md',
  },
  {
    name: 'suite-lauf-protokoll',
    beschreibung: 'Die Test-Suite dieses Repos laufen lassen und den Lauf strukturiert protokollieren',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/suite-lauf-protokoll/SKILL.md',
  },
  {
    name: 'testqualitaet-beurteilung',
    beschreibung: 'Testqualität beurteilen statt Testanzahl zählen — Verhaltens- gegen Implementierungs-Tests',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/testqualitaet-beurteilung/SKILL.md',
  },
  {
    name: 'adversarial-probing',
    beschreibung: 'Edge Cases und Schwachstellen systematisch suchen, über die bestehende Suite hinaus',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/adversarial-probing/SKILL.md',
  },
  {
    name: 'findings-dokumentation',
    beschreibung: 'Findings strukturiert als test-findings-Dokument in den Graphen schreiben',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/findings-dokumentation/SKILL.md',
  },
  {
    name: 'rolling-summary',
    beschreibung: 'Rolling Summary für den Testing-Stand über mehrere Läufe und Trigger hinweg',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/rolling-summary/SKILL.md',
  },
]
