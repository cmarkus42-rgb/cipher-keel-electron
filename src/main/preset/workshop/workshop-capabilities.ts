/**
 * Workshop Capability Packages.
 *
 * These packages are the Workshop's capability declaration. The per-Niveau ID lists
 * (A: 7, B: 6, C: 5) are derived from them via getWorkshopCapabilityPackages — both
 * niveau-config.ts and workshop-preset.ts read that, rather than each keeping its own
 * copy of the same cut.
 *
 * rolling-summary is shared with the Architect and the Systems Engineer and
 * points at the same file — one capability, one source of truth, referenced
 * from all three presets.
 *
 * niveauMinimum used to be documentation metadata that nothing consumed, pinned against
 * the explicit arrays by a test because it could otherwise drift out of sync with them.
 * It now decides: 'A' means Niveau A only, 'B' means A and B, absent means everywhere.
 * See the debugger-beauftragung and worker-monitoring SKILL.md files for what the field
 * means for each of them.
 *
 * Task 13; niveauMinimum on debugger-beauftragung corrected 'B' -> 'A' in
 * fix round 1.
 */

import { LoaderType, filterByNiveau } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'
import { CapabilityNiveau } from '../niveau'

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

/**
 * Returns the Workshop capability packages for a niveau.
 *
 * All three cuts follow from niveauMinimum: debugger-beauftragung is Niveau-A-exclusive,
 * worker-monitoring survives to B, the remaining five to C. That is why niveauMinimum
 * here is no longer documentation metadata pinned by a test — it is what decides.
 */
export function getWorkshopCapabilityPackages(niveau: CapabilityNiveau): CapabilityPackage[] {
  return filterByNiveau(WORKSHOP_PACKAGES, niveau)
}
