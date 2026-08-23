---
name: ka-graph-abfrage
description: Lesender Zugriff auf den Knowledge-Graph für den keel-Arbeiter — die vier lesenden graph_*-Werkzeuge der eigenen Schleife.
---

# Den Knowledge-Graph abfragen

## Wann das gilt

Wenn eine Antwort strukturierte Information aus dem Graphen braucht — Anforderungen, ADRs,
Handoffs, offene Fragen — statt nur aus dem Dateibaum des Projekts.

## Vorgehen

Vier Werkzeuge, alle lesend. Sie rufen dieselben Funktionen wie der Graph-MCP-Server auf, nicht
den Server selbst — für dich als Nutzer macht das keinen Unterschied, die vier Operationen sind
dieselben:

- **`graph_suchen`** — Volltext-/Vektor-Suche. Pflichtparameter `query`; optional `limit`
  (1–100, Vorgabe 10) und `kind` (Knotenart-Filter). Liefert knappe Treffer — für Details
  danach `graph_knoten_holen`.
- **`graph_knoten_holen`** — lädt einen vollständigen Knoten samt Rumpf und Frontmatter.
  Pflichtparameter `uid`.
- **`graph_ausweiten`** — Nachbarschafts-Expansion um einen Knoten. Pflichtparameter `uid`;
  optional `depth` (1–5, Vorgabe 1), `edge_type`, `direction` (`outgoing` | `incoming` |
  `both`).
- **`graph_abfragen`** — führt eine benannte Abfragevorlage aus. Pflichtparameter `template`;
  optional `params`. Es gibt keine freie Query-Konstruktion, nur die registrierten Vorlagen.

Übliche Reihenfolge: erst `graph_suchen` für den Einstieg, dann `graph_knoten_holen` für den
vollen Inhalt eines Treffers, `graph_ausweiten` für seine Nachbarschaft — und `graph_abfragen`,
wenn die Frage bereits genau einer registrierten Vorlage entspricht.

## Grenzen

Diese vier sind die einzigen graph-bezogenen Werkzeuge deiner Schleife, und alle vier lesen
nur. Schreibende Operationen (Knoten anlegen, Kanten setzen, Wartung) gibt es hier nicht — der
keel-Arbeiter liest den Graphen, er schreibt ihn nicht.

Dieser Text steht nur bis Niveau B zur Verfügung. Auf Niveau C bleiben die vier Werkzeuge in
deiner Werkzeugliste — sie werden hier nicht abgeschaltet —, aber Namen, Parameter und Grenzen
erfährst du dann nur noch aus dem Werkzeugschema selbst, nicht mehr aus dieser Anleitung.
