---
name: rolling-summary
description: Rolling Summary im Graph pflegen — ein Knoten pro Entität, bei jedem Auslöser überschrieben statt angehäuft. Geteilt zwischen Architect und Systems Engineer.
---

# Rolling Summary

## Wann das gilt

Nur auf Niveau A — auf Niveau B ist diese Capability für beide Entitäten, die sie tragen
(Architect, Systems Engineer), nicht geladen; dort trägst du deinen Zustand ohne Rolling
Summary. Auf Niveau A ist sie für beide Pflicht (`pflicht: true` in der jeweiligen
Konfiguration): Bei jedem deiner Auslöser aktualisierst du deine Zusammenfassung.

Diese Capability-Datei liegt an einem gemeinsamen Ort, weil ihr Inhalt für beide Entitäten
identisch ist — der Mechanismus selbst kennt keine Rolle, nur eine `entityId`. Was sich je
Rolle unterscheidet, sind Auslöser und Felder deiner eigenen Konfiguration, nicht der
Mechanismus.

## Vorgehen

**Ein Knoten pro Entität, fester Pfad, kein Anhäufen.** Die Rolling Summary lebt als einzelner
`note`-Knoten unter dem Pfad `/summaries/<entityId>/rolling-summary.md`, mit Frontmatter
`{ notetyp: 'rolling-summary', entityId }`. `createSummaryNode` schreibt über `upsertNode` —
jeder Aufruf, der eine neue Fassung schreibt, überschreibt diesen einen Knoten; der feste Pfad
wirkt als Natural Key, es entsteht keine wachsende Liste alter Summaries. Es gibt zu jedem
Zeitpunkt genau eine aktuelle Fassung, nie mehrere Versionen nebeneinander.

**Deine Konfiguration bestimmt Auslöser und Felder, nicht diese Datei.** Der Mechanismus
(`RollingSummaryConfig`) trägt drei Angaben — `pflicht` (Pflicht oder optional für diese
Entität), `updateTriggers` (Ereignisliste, bei der ein Update fällig ist) und `summaryFields`
(inhaltliche Gliederung). Für dich gilt eine der beiden folgenden Konfigurationen, je nachdem,
welche Entität du bist:

- **Architect** (`ARCHITECT_SUMMARY_CONFIG`, Pflicht): Auslöser `coaching-antwort`,
  `drift-befund`, `adr-update`, `welle-abschluss`; Felder `subsystem_status`, `aktive_adrs`,
  `offene_coaching`, `drift_findings`.
- **Systems Engineer** (`SE_SUMMARY_CONFIG`, Pflicht): Auslöser `trigger-erstellt`,
  `gate-urteil`, `handoff`, `kontext-druck`; Felder `aktive_phasen`, `letzte_trigger`,
  `offene_gates`, `teilprojekte`.

Bei keinem dieser Auslöser ist ein Update optional — die Konfiguration selbst erzwingt nichts
automatisch, das Einhalten der Auslöser ist deine Aufgabe. Die Felder sind benannte
Erwartungen an den Inhalt, keine vom Code erzwungene Struktur: Der Knoten speichert freien
Markdown-Text im `body`-Feld, nicht ein validiertes JSON-Schema. Halte dich trotzdem an sie als
Gliederung, damit die Summary für dich selbst und für einen später lesenden SE vergleichbar
bleibt.

**Lesen vor Schreiben.** `loadLatestSummary(graphDb, entityId)` lädt zu Beginn einer Session
die bestehende Summary, bevor du eine neue schreibst — sie liefert `null`, wenn noch keine
existiert (erster Auslöser in dieser Session), sonst `{ uid, entityId, content, erstellt }`.
Baue deine neue Fassung auf der vorherigen auf, statt bei Null anzufangen — das ist der Zweck
des Mechanismus: Kontinuität über Sessions hinweg, ohne den vollen Graphen jedes Mal neu
durchsuchen zu müssen.

## Grenzen

Die Rolling Summary ersetzt nicht die Knoten selbst — ADRs, Trigger, Gate-Befunde und die
übrigen typisierten Knoten bleiben eigene Knoten mit eigener Historie. Die Summary ist eine
Orientierungshilfe, kein Ersatzarchiv: Schreibe hier keine Inhalte, die nur hier existieren und
sonst nirgends im Graphen stehen. Und verwechsle deine Konfiguration nicht mit der einer
anderen Entität — Auslöser und Felder oben sind pro Rolle verschieden, der Mechanismus ist es
nicht.
