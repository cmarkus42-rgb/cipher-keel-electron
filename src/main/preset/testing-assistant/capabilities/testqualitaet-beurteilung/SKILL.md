---
name: testqualitaet-beurteilung
description: Testqualität beurteilen statt Testanzahl zählen — Verhaltens-Tests von Implementierungs-Tests unterscheiden, mit Beispielen aus diesem Repo.
---

# Testqualitäts-Beurteilung

## Wann das gilt

Nach dem Suite-Lauf, bevor du Adversarial Probing beginnst. Ein grüner Lauf beantwortet nur, ob
die vorhandenen Tests bestehen — nicht, ob sie etwas Sinnvolles prüfen. Diese Beurteilung ist der
Unterschied zwischen "die Suite ist grün" und "die Suite ist eine tragfähige Grundlage".

Anders als `suite-lauf-protokoll` brauchst du dafür nichts auszuführen — Testcode lesen und
Testnamen bewerten kommt mit `Read` aus. Deshalb ist diese Capability auch auf Niveau B geladen,
wo `Bash` fehlt (`NIVEAU_B_TOOLS`, `src/main/preset/schema.ts`): Ist kein eigener Suite-Lauf
möglich, beurteilst du die Testqualität rein aus dem gelesenen Testcode. Auf Niveau C — nur
`Read`, kein `Write` — bist du nicht mehr geladen; dort bleibt nur `ta-core-identity`.

## Vorgehen

**Drei Heuristiken für Implementierungs-Verdacht.** Ein Test ist implementierungslastig
verdächtig, wenn mindestens eines zutrifft:

- Der Testname enthält einen Implementierungs-Begriff statt eines Verhaltens-Begriffs
  (`renders`, `calls`, `invokes` statt einer beobachtbaren Konsequenz)
- Der Test prüft Aufrufe interner Methoden statt beobachtbares Verhalten (Mocking-heavy)
- Der Test bröselt bei reinem Renaming, ohne dass sich das Verhalten ändert — das bestätigt den
  Verdacht, es beweist ihn nicht vorab

Ein Verhaltens-Test bleibt stabil, solange die beobachtbare Konsequenz gleich bleibt, auch wenn
die Implementierung sich ändert. Ein Implementierungs-Test bricht bei jeder Refaktorierung, die
am Verhalten nichts ändert — das ist der teuerste, am schwersten sichtbare Test-Schaden, weil er
erst beim nächsten Refactor auffällt.

**Die stärkere gegen die schwächere Assertion.** Dasselbe Prinzip gilt nicht nur für Mocking,
sondern für die Wahl der Assertion selbst — und dieses Repo dokumentiert seine eigenen guten
Beispiele direkt im Testcode. `tests/session/materialise-capabilities.test.ts:48` begründet,
warum eine reine Anzahl-Prüfung eine vertauschte ID bei gleicher Gesamtzahl durchlassen würde,
und verwendet stattdessen Mengen-Gleichheit (`toEqual` auf sortierten Arrays) statt `toContain`.
`tests/preset/registry.test.ts:41` begründet, warum `not.toBeNull()` bestehen würde, selbst wenn
jede Entität dieselbe falsche Persona bekäme, und prüft stattdessen den konkreten erwarteten Wert.
Beide Kommentare benennen explizit den Fehler, den die schwächere Assertion durchlassen würde —
das ist der Maßstab: Eine gute Test-Assertion macht sichtbar, welchen Fehler sie ausschließt, eine
schwache lässt eine Klasse von Fehlern durch, ohne dass es auffällt.

**Output: ein Bericht, keine Einzelurteile.** Halte den Behavioral-Anteil und die
Implementierungs-Verdächtigen fest, nicht als Freispruch oder Verurteilung einzelner Tests,
sondern als Grundlage für dein Findings-Dokument — die Entscheidung, was daraus wird, liegt beim
Workshop, nicht bei dir.

## Grenzen

Du beurteilst, du schreibst nicht um. Ein als implementierungslastig erkannter Test wird
gemeldet, nicht repariert oder gelöscht — das würde die Grenze "ändert keinen Code" verletzen.
Und du zählst keine Deckungsprozente als Ersatz für dieses Urteil: Hohe Testanzahl und hohe
Coverage sagen nichts darüber, ob die einzelnen Tests tragfähig sind.
