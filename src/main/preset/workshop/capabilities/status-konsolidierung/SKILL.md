---
name: status-konsolidierung
description: Fix-Report im P1-Format erzeugen (Phase 6) und über die 'behebt'-Kante an das Quell-Finding zurückschreiben.
---

# Status Konsolidierung

## Wann das gilt

Phase 6 (`konsolidieren`), der letzte Schritt des Sechs-Phasen-Flows, nach bestandenem oder
dokumentiert offenem Completeness-Gate.

## Vorgehen

`generateFixReport(workshopRun)` (`fix-report-generator.ts`, 123 Zeilen) erzeugt einen
`fix-report.md`-String aus einem `WorkshopRun` (`runId`, `projekt`, `testFindingsNodeId`,
`items: WorkItem[]`, `fixes: Fix[]`, Zeilen 18-29). Die YAML-Frontmatter des erzeugten
Markdown-Strings trägt zehn Felder in Bindestrich-Schreibweise (Zeilen 49-62):
`dokument-typ: fix-report`, `phase: fixing`, `phasenuebergang: fixing→audit`, `stand`,
`status: entwurf`, `version`, `projekt`, `adressat: audit`, `req-ids: []` und
`vorgaenger-dokument` (verweist auf `testFindingsNodeId`). Der Body folgt exakt der
Niveau-B-Sektionsstruktur aus `body-templates.ts` für `dokumentTyp: 'fix-report'` — drei
Pflicht-H2 (`Kontext`, `Bearbeitete Befunde`, `Aenderungen`, `body-templates.ts:41`) plus die
Gate-Befund-Sektion, die für `fix-report` verpflichtend ist (`GATE_BEFUND_TYPEN`,
`body-templates.ts:48-50`); die generierte Gate-Befund-Sektion ist hart auf die
Niveau-B-Prosa-Variante gesetzt (`## Gate-Befund` + `<!-- Gate-Befund als Prosa -->`,
`fix-report-generator.ts:118-120`), unabhängig vom tatsächlichen Session-Niveau.

`generateFixReport` selbst schreibt nichts in den Graphen — es liefert nur den String zurück.
Das Persistieren ist deine Aufgabe: Beim Ablegen als `uebergabedokument`-Knoten mappt
`note-manager.ts` das kebab-case `dokument-typ`-Feld der Markdown-Frontmatter auf das
camelCase `dokumentTyp`-Feld der Knoten-Frontmatter (`note-manager.ts:106,283`) — genau das
Pflichtfeld, das `REQUIRED_FRONTMATTER_FIELDS.uebergabedokument` verlangt (`node-types.ts:290`,
ein einzelnes Feld: `['dokumentTyp']`). Verlinke den neuen Fix-Report-Knoten über die Kante
`behebt` zurück zum `test-findings`-Knoten (`edge-types.ts:32`: `behebt`, `fix-report →
test-findings`) — das ist derselbe Knoten, dessen ID als `vorgaenger-dokument` im Frontmatter
steht.

## Grenzen

Status-Konsolidierung fasst zusammen, was Dispatch und Gate bereits festgestellt haben — sie
trifft keine neuen Routing- oder Gate-Entscheidungen und ändert an dieser Stelle keinen Code
mehr.
