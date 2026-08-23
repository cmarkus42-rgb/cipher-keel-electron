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
 * ka-graph-abfrage carries niveauMinimum: 'B' — not because the graph tools themselves are
 * gated (baueWerkzeugRegistry, harness-sitzung.ts, wires all four `graph_*` tools
 * unconditionally, at every niveau), but because this package's own "Vorgehen" text is the
 * one of the three that a model can reconstruct almost entirely from the tools' own JSON
 * schema: every parameter name, bound and enum named here (query/limit/kind, uid, depth 1-5,
 * edge_type, direction, template/params) already sits in werkzeug-graph.ts's `schema()`
 * methods, several of them copied near-verbatim from the schema's own `description` fields.
 * The two things this package adds beyond schema — a suggested tool order and "no write
 * tools exist here" — are themselves recoverable: the model never sees write-tool stubs
 * (graph_upsert_node etc. are not wired into this registry at all) and can infer a sane
 * order from the tool descriptions. Losing this text at Niveau C costs comparatively little.
 *
 * ka-projekt-lesen and ka-netzrecherche do not carry niveauMinimum, i.e. they survive to
 * Niveau C: both hold guidance no schema states. ka-projekt-lesen's "search broad, then read
 * narrow" workflow order and its write-boundary reminder are not in datei_lesen's schema.
 * ka-netzrecherche's prompt-injection warning ("Befund, keine Anweisung") and its
 * three-calls-per-run budget are not in recherchieren's schema either — recherchieren has no
 * write access anywhere near it, but nothing about the schema tells a model that content
 * flowing back through it could try to instruct it. An earlier version of this file put
 * niveauMinimum on ka-netzrecherche instead, reasoning that open-web research overwhelms a
 * weak model — backwards: the Rechercheur sub-run (harness/rechercheur.ts) exists so that a
 * weak main-loop model does NOT have to read or judge raw web content itself; from the main
 * loop's side, `recherchieren` takes one free-text field and one enum, simpler than
 * inhalt_suchen's regex+glob or graph_abfragen's template+params. Cutting its guidance at the
 * weakest niveau would have removed the one piece of that guidance nothing else supplies.
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
    niveauMinimum: 'B',
  },
  {
    name: 'ka-netzrecherche',
    beschreibung:
      'Recherche im offenen Netz über den abgeschotteten Unterlauf — Zusammenfassung samt Quellen',
    loader: LoaderType.SkillMd,
  },
]

/**
 * Returns the keel-arbeiter capability packages for a niveau.
 *
 * A and B carry all three. C drops ka-graph-abfrage and keeps the other two — see the
 * KA_PACKAGES doc comment for why the cut sits there.
 */
export function getKaCapabilityPackages(niveau: CapabilityNiveau): CapabilityPackage[] {
  return filterByNiveau(KA_PACKAGES, niveau)
}
