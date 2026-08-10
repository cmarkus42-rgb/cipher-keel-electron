---
name: rolling-summary
description: Rolling Summary über deinen Architect-State pflegen — ein Knoten pro Session, bei jedem Auslöser überschrieben statt angehäuft.
---

# Rolling Summary

## Wann das gilt

Nur auf Niveau A — auf Niveau B ist diese Capability nicht geladen, dort trägst du deinen
Zustand ohne Rolling Summary. Auf Niveau A ist sie Pflicht (`pflicht: true` in deiner
Summary-Konfiguration): Bei jedem der vier Auslöser aktualisierst du deine Zusammenfassung.

## Vorgehen

**Ein Knoten pro Entität, fester Pfad, kein Anhäufen.** Die Rolling Summary lebt als einzelner
`note`-Knoten unter dem Pfad `/summaries/<entityId>/rolling-summary.md`, mit Frontmatter
`{ notetyp: 'rolling-summary', entityId }`. Jeder Aufruf, der eine neue Fassung schreibt,
überschreibt diesen einen Knoten — der feste Pfad wirkt als Natural Key, es entsteht keine
wachsende Liste alter Summaries. Es gibt zu jedem Zeitpunkt genau eine aktuelle Fassung, nie
mehrere Versionen nebeneinander.

**Vier Auslöser für ein Update.** Deine Konfiguration (`ARCHITECT_SUMMARY_CONFIG`) definiert
vier Ereignisse, bei denen du die Summary aktualisierst: `coaching-antwort` (du hast eine
Coaching-Frage beantwortet), `drift-befund` (du hast ein Drift-Signal gemeldet), `adr-update`
(ein ADR wurde neu angelegt oder revidiert), `welle-abschluss` (eine Bau-Welle ist
abgeschlossen). Bei keinem dieser vier Ereignisse ist ein Update optional — die Konfiguration
selbst erzwingt nichts automatisch, das Einhalten der Auslöser ist deine Aufgabe.

**Was hineingehört.** Vier Felder bilden den inhaltlichen Rahmen: `subsystem_status` (Stand der
Zerlegung, welche Subsysteme in welchem Zustand), `aktive_adrs` (welche ADRs aktuell gelten),
`offene_coaching` (welche Fragen noch unbeantwortet sind), `drift_findings` (welche
Drift-Befunde bisher gemeldet wurden). Das sind benannte Erwartungen an den Inhalt, keine vom
Code erzwungene Struktur — der Knoten speichert freien Markdown-Text im `body`-Feld, nicht ein
validiertes JSON-Schema. Halte dich trotzdem an diese vier Felder als Gliederung, damit die
Summary für dich selbst und für einen lesenden SE beim nächsten Einstieg vergleichbar bleibt.

**Lesen vor Schreiben.** Lade zu Beginn einer Session die bestehende Summary, bevor du eine
neue schreibst — sie liefert `null`, wenn noch keine existiert (erster Auslöser in dieser
Session), sonst `{ uid, entityId, content, erstellt }`. Baue deine neue Fassung auf der
vorherigen auf, statt bei Null anzufangen — das ist der Zweck des Mechanismus: Kontinuität über
Wellen hinweg, ohne den vollen Graphen jedes Mal neu durchsuchen zu müssen.

## Grenzen

Die Rolling Summary ersetzt nicht die Knoten selbst — ADRs, Schnittstellen-Verträge und
Anforderungspakete bleiben eigene Knoten mit eigener Historie. Die Summary ist eine
Orientierungshilfe, kein Ersatzarchiv: Schreibe hier keine Inhalte, die nur hier existieren und
sonst nirgends im Graphen stehen.
