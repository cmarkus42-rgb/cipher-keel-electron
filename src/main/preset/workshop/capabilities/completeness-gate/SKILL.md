---
name: completeness-gate
description: Vierstufiges kalibrierbares Completeness-Gate (Phase 5) — Kriterien, Kalibrier-Level und die drei Prüf-Modi je Niveau.
---

# Completeness Gate

## Wann das gilt

Phase 5 (`completeness-gate`) des Sechs-Phasen-Flows — nicht überspringbar, auch bei einem
einzigen Item (`workshop-flow.ts:1-4`). Läuft nach dem Monitoring und vor der Konsolidierung.

## Vorgehen

**Vier Kriterien, `completeness-gate.ts` (107 Zeilen).** `evaluateCompleteness(items, fixes,
level)` prüft gegen ein `Fix`-Array (`itemId`, `status`: `'behoben' | 'zurueckgestellt' |
'nicht-reproduzierbar'`, `testcaseIds: string[]`, `completeness-gate.ts:19-26`) vier Kriterien
(`GateCriteria`, `completeness-gate.ts:30-39`):

1. `forwardTraceability` — jedes Item hat einen Fix (`missingItems`, Zeilen 71-74).
2. `backwardTraceability` — jeder Fix verweist auf ein existierendes Item (Zeile 77).
3. `testsPassed` — jeder `behoben`-Fix hat mindestens eine Testcase-ID; Rückstellung und
   Nicht-Reproduzierbarkeit sind davon ausgenommen (Zeilen 80-83).
4. `kalibrierbarkeit` — im aktuellen Code immer `true` (Zeile 86), reines Platzhalter-Signal.

Drei Kalibrier-Level bestimmen, welche Kriterien für `passed` zählen (Zeilen 96-104):
`production` verlangt alle vier, `staging` nur Forward-Traceability plus bestandene Tests,
`experimental` nur Forward-Traceability.

**Drei Prüf-Modi je Niveau, `niveau-config.ts`.** Getrennt von den Kalibrier-Leveln liefert
`getNiveauWorkshopConfig(niveau).completenessCheckMode` (`CompletenessCheckMode`,
`niveau-config.ts:18`) einen von drei Werten — wörtlich aus dem Code, nicht aus dem
Gedächtnis: `'graph-query'` auf Niveau A, `'prose'` auf Niveau B, `'checkpoint-prompt'` auf
Niveau C (`niveau-config.ts:87,96,106`). Das beschreibt, **wie** du den Gate-Befund auf dem
jeweiligen Niveau herstellst: Niveau A als eigenständige Graph-Abfrage, Niveau B als
Prosa-Urteil, Niveau C als Checkpoint-Prompt an den Nutzer. Kein Code-Pfad verzweigt heute
tatsächlich auf diesen Wert — `completenessCheckMode` wird nirgends sonst im Repo gelesen; es
ist eine Vorgabe an dich als Workshop, keine automatisierte Weiche.

**Zwei getrennte Implementierungen, nicht verwechseln.** `workshop-flow.ts` trägt eine eigene,
einfachere `completenessGate()`-Funktion (Zeilen 186-197) als Phase-5-Schritt des
Sechs-Phasen-Flows — sie prüft nur `stand !== 'abgeschlossen' && stand !== 'zurueckgestellt'`,
ohne die vier Kriterien und ohne Kalibrier-Level. Für den vollen, kalibrierbaren Befund nutze
`evaluateCompleteness` aus `completeness-gate.ts`.

## Grenzen

Das Gate bewertet, es fixt nicht — offene oder ohne Testcase gebliebene Items gehen zurück in
den Dispatch, nicht in eine Ad-hoc-Korrektur an dieser Stelle. Und die Kalibrier-Level
(`production`/`staging`/`experimental`) sind eine andere Achse als die Niveau-Prüf-Modi
(`graph-query`/`prose`/`checkpoint-prompt`) — beide zusammen zu nennen heißt nicht, sie zu
verschmelzen.
