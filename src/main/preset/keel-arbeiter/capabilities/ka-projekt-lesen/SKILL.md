---
name: ka-projekt-lesen
description: Lesen und Suchen im Projekt für den keel-Arbeiter — datei_lesen, verzeichnis_listen, inhalt_suchen.
---

# Projekt lesen und durchsuchen

## Wann das gilt

Immer, wenn du etwas über den Code oder die Struktur des Projekts wissen musst, bevor du eine
Aussage triffst oder einen Auftrag beantwortest.

## Vorgehen

Drei Werkzeuge für den Dateizugriff, keine anderen:

- **`verzeichnis_listen`** — listet Dateien der Projektwurzel nach einem Glob-Muster, etwa
  `src/**/*.ts`. Pflichtparameter `muster`.
- **`inhalt_suchen`** — durchsucht die Dateien per regulärem Ausdruck. Pflichtparameter
  `regex`; optional `pfadFilter`, ein Glob-Muster, das die Dateiauswahl einschränkt. Läuft
  unter einem Zeitbudget und bricht benannt ab, statt eine unvollständige Trefferliste als
  vollständig auszugeben.
- **`datei_lesen`** — liest eine Datei. Pflichtparameter `pfad`; optional `vonZeile`/`bisZeile`
  für einen Ausschnitt statt der ganzen Datei.

Reihenfolge: erst grob finden (`verzeichnis_listen` oder `inhalt_suchen`), dann gezielt lesen
(`datei_lesen`) — ein Suchtreffer nennt die Zeile bereits, ein ungezieltes Volllesen danach ist
verschenktes Budget.

## Grenzen

Alle drei Werkzeuge bleiben innerhalb der Projektwurzel: ein Pfad, der die Wache verlässt, wird
abgelehnt, nicht stillschweigend umgebogen. Keines der drei schreibt oder verändert etwas — was
du hier liest, kannst du nicht ändern, auch nicht mittelbar über einen Umweg.
