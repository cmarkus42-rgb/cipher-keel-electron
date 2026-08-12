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
 * The per-niveau narrowing used to live in explicit string lists in ta-preset.ts, to
 * avoid a second representation of the same cut. It now lives in niveauMinimum here,
 * for the same reason from the other side: with all five presets deriving their
 * capabilityAnbindung from these packages, the packages are the one representation and
 * the lists are gone.
 *
 * Task 15; rolling-summary entry removed fix round 1 (2026-08-11).
 */

import { LoaderType, filterByNiveau } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'
import { CapabilityNiveau } from '../niveau'

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
    // Niveau A only: NIVEAU_B_TOOLS carries no Bash, and running npm test/typecheck/lint
    // is this capability's entire job. Without Bash nothing of it survives in reduced form.
    niveauMinimum: 'A',
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

/**
 * Returns the Testing Assistant capability packages for a niveau.
 *
 * A: all five. B: four — suite-lauf-protokoll carries niveauMinimum 'A'. C: the core
 * identity alone, because NIVEAU_C_TOOLS is Read-only and findings-dokumentation cannot
 * run without Write either. Not inline: the Testing Assistant uses no LoaderType.Inline
 * and no niveauCExtrakt anywhere — materialisation copies the SKILL.md as-is.
 */
export function getTaCapabilityPackages(niveau: CapabilityNiveau): CapabilityPackage[] {
  if (niveau === CapabilityNiveau.C) {
    return TA_PACKAGES.filter(p => p.name === 'ta-core-identity')
  }
  return filterByNiveau(TA_PACKAGES, niveau)
}
