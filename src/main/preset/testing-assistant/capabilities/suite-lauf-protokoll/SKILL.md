---
name: suite-lauf-protokoll
description: Die Test-Suite dieses Repos laufen lassen und beurteilen — npm test, typecheck, lint, die native-ABI-Falle und ihr Gegenmittel.
---

# Suite-Lauf-Protokoll

## Wann das gilt

Als erster Schritt jedes Testing-Laufs, bevor Testqualitäts-Audit oder Adversarial Probing
beginnen — du kannst weder Testqualität beurteilen noch Findings dokumentieren, bevor du weißt,
was die Suite tatsächlich meldet.

## Vorgehen

**Die drei Befehle, in dieser Reihenfolge.** `package.json` definiert die für dich relevanten
Skripte: `npm run typecheck` (`tsc -b --noEmit --force`), `npm run lint` (`eslint src tests`),
`npm test` (`vitest run`). Ein vierter Befehl, `npm run build`, gehört zu CI, aber nicht zu
deinem Auftrag — Paketierung ist nicht deine Sache. Lass alle drei laufen und halte das Ergebnis
strukturiert fest: bestanden/fehlgeschlagen pro Befehl, bei `npm test` zusätzlich
total/bestanden/fehlgeschlagen. Grün auf allen drei ist eine Voraussetzung für eine saubere
Welle, kein Ersatz für Testqualitäts-Audit und Adversarial Probing — ein grüner Lauf sagt nichts
darüber, ob die Tests selbst etwas taugen.

**Die native-ABI-Falle.** `better-sqlite3` existiert in diesem Repo als zwei getrennte Builds —
einer gegen Electrons ABI (für die laufende App), einer gegen Node ABI (für vitest). Ein
Node-Versionswechsel macht den Node-ABI-Build ungültig; `npm test` schlägt dann mit einem
`NODE_MODULE_VERSION`-Mismatch fehl, obwohl an deinem eigentlichen Code nichts kaputt ist
(`CONTRIBUTING.md:80-85`). Das Gegenmittel ist `npm run rebuild-native`
(`electron-rebuild --build-from-source --force && npm rebuild better-sqlite3`) — beide Befehle
in dieser Reihenfolge, weil der erste den Node-ABI-Build überschreibt und der zweite ihn wieder
herstellt. Läuft die Suite mit einem ABI-Fehler ins Leere, ist das dein erster Verdacht, nicht
ein Code-Problem, das ein Finding verdient.

**Dein blinder Fleck: kein Test erreicht einen `ipcMain`-Handler.** Diese App ist Electron mit
zwei Fenstern; fast alles Interessante läuft über IPC (`window.cipherKeel.invoke(...)`). Vitest
läuft unter reinem Node, es gibt keinen Electron-Mock — kein Test in diesem Repo erreicht je
einen `ipcMain`-Handler (`.claude/skills/run-keel/SKILL.md:9-13`). Ein grüner `npm test`-Lauf ist
deshalb kein Beweis, dass die laufende App funktioniert: Genau das ist real passiert — der
Knowledge-Graph blieb in der laufenden App wochenlang tot, weil `better-sqlite3` nur für Nodes
ABI gebaut war, während alle Tests unter Node liefen und grün blieben. Wenn eine Welle
IPC-Handler, Fenster-Verhalten oder App-Start berührt, gehört „mit `npm test` allein nicht
geprüft" als eigene Feststellung in dein Findings-Dokument — nicht als stillschweigende Lücke.

## Grenzen

Dieser Schritt liefert Rohdaten (Suite-Ergebnis, Fehlermeldungen), keine Bewertung der
Testqualität — das ist `testqualitaet-beurteilung`. Er sucht auch keine Lücken jenseits dessen,
was die Suite selbst abdeckt — das ist `adversarial-probing`. Und er schreibt nichts in den
Graphen — das übernimmt `findings-dokumentation`, nachdem alle vier Schritte abgeschlossen sind.
