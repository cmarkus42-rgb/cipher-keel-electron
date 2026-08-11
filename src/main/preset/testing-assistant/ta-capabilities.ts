/**
 * Testing Assistant Capability Packages.
 *
 * Five packages at Niveau A (TA_CAPABILITIES, ta-preset.ts), each with its own
 * SKILL.md under ./capabilities/<id>/. Unlike the Architect, the Systems Engineer
 * and the Workshop, the Testing Assistant carries no rolling-summary — the shared
 * mechanism (src/main/preset/shared/rolling-summary.ts) defines a config for those
 * three plus the Cyber Factory, none for the Testing Assistant (fix round 1,
 * Finding A).
 *
 * Unlike architect-capabilities.ts / se-capabilities.ts, no niveauMinimum is set
 * here: the per-niveau narrowing lives entirely in ta-preset.ts's explicit
 * NIVEAU_B_CAPABILITIES / NIVEAU_C_CAPABILITIES lists, so there is no second,
 * derived representation of the same cut that could drift out of sync with it.
 *
 * Task 15; rolling-summary entry removed fix round 1 (2026-08-11).
 */

import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

/** Capability packages for the Testing Assistant. */
export const TA_PACKAGES: CapabilityPackage[] = [
  {
    name: 'ta-core-identity',
    beschreibung: 'Kern-Identität des Testing Assistant und die schärfste Grenze: fixt nicht, ändert keinen Code',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'suite-lauf-protokoll',
    beschreibung: 'Die Test-Suite dieses Repos laufen lassen und den Lauf strukturiert protokollieren',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'testqualitaet-beurteilung',
    beschreibung: 'Testqualität beurteilen statt Testanzahl zählen — Verhaltens- gegen Implementierungs-Tests',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'adversarial-probing',
    beschreibung: 'Edge Cases und Schwachstellen systematisch suchen, über die bestehende Suite hinaus',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'findings-dokumentation',
    beschreibung: 'Findings strukturiert als test-findings-Dokument in den Graphen schreiben',
    loader: LoaderType.SkillMd,
  },
]
