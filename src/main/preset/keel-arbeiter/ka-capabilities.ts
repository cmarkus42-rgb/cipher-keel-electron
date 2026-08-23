/**
 * keel-arbeiter Capability Packages.
 *
 * Three packages, one for each capability the body (ka-body.md) already promises: reading and
 * searching the project, querying the knowledge graph, and web research via the encapsulated
 * sub-run. No core-identity package like the other five presets carry — ka-body.md is a single
 * short paragraph that already states the identity; a separate SKILL.md restating it would be
 * a fourth package with nothing new to say.
 *
 * ENT-025 (schema.ts) requires capabilityAnbindung to be a non-empty array, unconditionally —
 * no exception for BeauftragteInstanz. An earlier draft of this preset left it `[]` on the
 * reasoning that a loop-native entity does not need SKILL.md-style packages the way a
 * Claude-CLI preset does; that reasoning was wrong. ENT-025 exists because an entity without a
 * capability text gets nothing — the *road* differs (a CLI preset gets files materialised into
 * the project, keel's own loop gets text in the stable prefix) but the requirement does not.
 *
 * Declared here, not yet delivered: getKaCapabilityPackages feeds capabilityAnbindung
 * (ka-preset.ts), which the registry and its cross-checks (tests/preset/capability-packages.ts,
 * tests/preset/capability-assets-coverage.test.ts) require to be real and asset-backed — and
 * now is. But nothing on the keel-harness run path reads these packages into the assembled
 * prefix: assemblePraefixTeile (harness-praefix-quelle.ts) takes capabilities off an
 * EntitaetsTeile the caller passes in, and nothing yet builds that EntitaetsTeile from
 * getEntityDefinition's output for keel-arbeiter. Wiring that delivery is a later task.
 */

import { LoaderType, filterByNiveau } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'
import { CapabilityNiveau } from '../niveau'

/**
 * Capability packages for the keel-Arbeiter.
 *
 * ka-netzrecherche carries niveauMinimum: 'B', not 'A' — Niveau B is keel-arbeiter's own
 * default (createKaRahmen(CapabilityNiveau.B) in ka-preset.ts, backed by the sitzung:niveau-b
 * assignment slot), so the cut that must narrow is Niveau C, not B. That is also the niveau
 * this project already treats open-web research as too demanding for: the Rechercheur
 * sub-run (src/main/harness/rechercheur.ts) exists specifically because that work needs a
 * capable, encapsulated model, and project memory records a dedicated Niveau-C recherche
 * model precisely so a weak main-loop model does not have to attempt it directly. Reading
 * files and querying the graph stay template- and glob-driven operations a weak model can
 * still drive, so both survive at every niveau.
 */
export const KA_PACKAGES: CapabilityPackage[] = [
  {
    name: 'ka-projekt-lesen',
    beschreibung:
      'Lesen und Suchen im Projekt: Dateien lesen, nach Glob-Muster listen, per Regex durchsuchen',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'ka-graph-abfrage',
    beschreibung:
      'Den Knowledge-Graph lesend abfragen: suchen, Knoten holen, Nachbarschaft ausweiten, Vorlagen abfragen',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'ka-netzrecherche',
    beschreibung:
      'Recherche im offenen Netz über den abgeschotteten Unterlauf — Zusammenfassung samt Quellen',
    loader: LoaderType.SkillMd,
    niveauMinimum: 'B',
  },
]

/**
 * Returns the keel-arbeiter capability packages for a niveau.
 *
 * A and B carry all three. C drops ka-netzrecherche and keeps the other two — see the
 * KA_PACKAGES doc comment for why the cut sits there.
 */
export function getKaCapabilityPackages(niveau: CapabilityNiveau): CapabilityPackage[] {
  return filterByNiveau(KA_PACKAGES, niveau)
}
