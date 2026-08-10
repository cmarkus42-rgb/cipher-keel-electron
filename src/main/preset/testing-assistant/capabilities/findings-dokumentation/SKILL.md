---
name: findings-dokumentation
description: Findings strukturiert als test-findings-Dokument in den Graphen schreiben — Schnittstelle zum Workshop, der sie über findings-lesen aufnimmt.
---

# Findings-Dokumentation

## Wann das gilt

Am Ende jedes Testing-Laufs, nachdem Suite-Lauf, Testqualitäts-Beurteilung und Adversarial
Probing abgeschlossen sind. Dieser Schritt ist dein einziger Schreibzugriff auf den Graphen —
alles davor liest oder bewertet nur.

## Vorgehen

**Ein `uebergabedokument`-Knoten mit `dokumentTyp: 'test-findings'`.** Das ist der einzige an
der Graph-Ebene geprüfte Pflichtfeld für diesen Knoten-Kind
(`REQUIRED_FRONTMATTER_FIELDS.uebergabedokument`, `src/main/graph/node-types.ts:290`:
`['dokumentTyp']`). `test-findings` ist bereits ein bestehender Dokumenttyp
(`DOKUMENT_TYPEN`, `node-types.ts:165`) — du bist die erste Entität, die ihn tatsächlich
schreibt; der Workshop liest ihn seit Task 13 über seine `findings-lesen`-Capability
(`src/main/preset/workshop/capabilities/findings-lesen/SKILL.md`). Sein Default-Adressat ist
`'fixing'` (`src/main/p1/default-addressee.ts:27`) — genau der Workshop.

**Drei Pflicht-Sektionen, plus Gate-Befund.** Die Body-Struktur für `test-findings`
(`DOKUMENT_SEKTIONEN['test-findings']`, `src/main/p1/body-templates.ts:40`) verlangt auf
Niveau A und B drei H2-Überschriften in dieser Reihenfolge: `## Kontext`, `## Test-Ergebnisse`,
`## Befunde`. `test-findings` gehört außerdem zu `GATE_BEFUND_TYPEN`
(`body-templates.ts:48-49`) — es folgt ein `## Gate-Befund`-Block: auf Niveau A mit zwei
getrennten Unterabschnitten (`### Struktureller Befund`, `### Plausibilitaets-Befund`), auf
Niveau B als zusammenhängende Prosa. Auf Niveau C entfällt das H2-Gerüst vollständig
(`generateTemplate`, `body-templates.ts:89-91`) — dort reicht ein knapper Freitext.

**Einzelne Findings als Text, nicht als eigene Knoten.** Es gibt keinen eigenen Knoten-Kind für
ein einzelnes Finding — genau wie bei den Work-Items, die der Workshop später aus deinem Dokument
herausliest, sind sie im Body eingebettet, nicht als eigene Graph-Knoten angelegt
(`findings-lesen/SKILL.md:18-19`). Formuliere jedes Finding in der `## Befunde`-Sektion so, dass
es als `WorkItem` (`src/main/preset/workshop/routing.ts:42-53`) weiterverarbeitbar ist: eine
ID (`BUG-001`, `MFR-002`, …), ein knapper Titel, ein Klassifikations-Typ (`BUG` für
Fehlverhalten, `MFR` oder `NRF` für Verbesserungs- bzw. Anforderungs-Findings) und der Stand
`neu` — der Workshop übernimmt sie danach in seinen Klassifizierungs-Schritt. Formuliere pro
Finding auch die Reproduktion, wo vorhanden (aus `adversarial-probing`) und die Herkunft
(Suite-Lauf, Testqualitäts-Audit oder Probing).

**Die Kante zur geprüften Welle.** Verlinke den neuen Knoten über die Kante `verifiziert` zum
geprüften `build-paket`-Knoten (`VALID_UEBERGABE_PAIRS.verifiziert`, `edge-types.ts:284`:
`['test-findings', 'build-paket']`) — damit ist im Graphen nachvollziehbar, welche Welle dieses
Findings-Dokument geprüft hat, ohne dass du dafür einen eigenen Verweis-Mechanismus erfindest.

**Kein Severity-Feld auf Graph-Ebene.** Anders als `gate_befund` (`wahrscheinlichkeit`/`impact`
für Risk-Reviews) gibt es für `test-findings` kein eigenes, an der Graph-Ebene geprüftes
Schwere-Feld. Ordne Findings stattdessen in der `## Befunde`-Sektion nach Schwere, damit der
Workshop priorisieren kann, ohne dass die Schwere ein erfundenes, ungeprüftes Frontmatter-Feld
wird.

## Grenzen

Findings-Dokumentation fasst zusammen, was die drei vorherigen Schritte bereits festgestellt
haben — sie trifft keine neuen Testqualitäts- oder Probing-Urteile und ändert an dieser Stelle
keinen Code. Ist die Welle sauber, dokumentierst du das ebenso — ein leeres `## Befunde` ist ein
gültiges, positives Ergebnis, keine übersprungene Pflicht.
