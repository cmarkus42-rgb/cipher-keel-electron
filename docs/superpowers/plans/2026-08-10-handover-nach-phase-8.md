# Handover nach Phase 8 — Stand, offene Zusagen, Einstieg

**Stand:** 2026-08-10
**Für:** die nächste Session, gleich woran sie arbeitet
**Kurzfassung:** Phase 8 (Packaging) ist gebaut und reviewt, liegt aber **unmerged** in
PR #10. Eine Zusage der Roadmap ist noch offen. Die nächste inhaltliche Arbeit sind die
Entitäten/Personas — dafür gibt es ein eigenes Dokument.

> **Dies ist das Einstiegsdokument.** Es sagt, wo die Arbeit liegt, was entschieden wurde
> und was noch aussteht. Alles Tiefere ist verlinkt; nichts hier wird dort wiederholt.

---

## 1. Wo die Arbeit physisch liegt

| | |
|---|---|
| **Branch** | `phase-8-packaging`, gepusht nach `origin` |
| **PR** | [#10](https://github.com/cmarkus42-rgb/cipher-keel-electron/pull/10) — **offen, nicht gemergt** |
| **`main`** | unberührt, steht auf `a6c6bbb` |
| **Testsuite** | 1541 grün / 107 Dateien · Typecheck sauber · Lint sauber |
| **Artefakt** | `release/cipher keel-0.1.0-arm64.dmg` (124 MB, unsigniert) — git-ignoriert, muss neu gebaut werden |

Wer weiterarbeitet, arbeitet auf `phase-8-packaging` — nicht auf `main`, sonst hängt die
Arbeit hinter einem offenen PR.

---

## 2. Was noch offen ist — und wem es gehört

### Beim Nutzer

1. **Erst-Start auf einem zweiten Apple-Silicon-Mac ohne Entwicklungsumgebung.**
   Das ist das Abnahmekriterium der Roadmap für Phase 8 und **die einzige verbliebene
   Zusage der Phase**. Diese Maschine kann es nicht beantworten: hier ist alles installiert,
   was fehlen könnte.
   Zu prüfen: startet die App, trägt sie das Icon, und meldet die StatusBar **genau**
   `⚠ 2 Subsysteme degradiert: nanoclaw, voice`? Stünde dort `graph`, wäre der asar-Fix im
   echten Installationspfad nicht angekommen.
2. **Installation nach `/Applications`** — vom Sandbox blockiert, deshalb vom Nutzer selbst
   auszuführen (`hdiutil attach` → kopieren → `xattr -cr`). Der inhaltliche Kern ist bereits
   belegt: die App wurde aus dem DMG in ein Verzeichnis außerhalb des Bauverzeichnisses
   kopiert und lief dort (tmux verbunden, Graph initialisiert).
3. **PR #10 mergen**, wenn der Zweitrechner-Test durch ist.

### Ungeprüft und als solches dokumentiert

- Der `xattr -cr`-Schritt konnte **nicht** ausgelöst werden: ein lokal gebautes DMG trägt kein
  `com.apple.quarantine`, nur ein heruntergeladenes. Die Anleitung im README stimmt für jeden,
  der von GitHub lädt — nachgestellt wurde sie nie.
- Dass `claudeCli` im Fehlerfall in der StatusBar erscheint. Zwei Simulationsversuche
  scheiterten, weil die Maschine eine zweite Claude-Binary unter `/opt/homebrew/bin` hat, die
  `getEnhancedPath()` immer hinzufügt — `ready` war beide Male die richtige Antwort. Abgedeckt
  durch Unit-Tests und Codelesung, aber es bleibt ein Schluss, kein Beweis.

### Kein Release

Bewusst nicht veröffentlicht (Nutzer-Entscheidung 2026-08-09). Kein Tag, kein GitHub Release.
README, `SECURITY.md` und `CONTRIBUTING.md` sind entsprechend formuliert — sie behaupten
**kein** Release, sondern beschreiben, wie man das DMG selbst baut. Wer das später
veröffentlicht, muss alle drei nachziehen.

---

## 3. Entscheidungen dieser Session — und wer sie getroffen hat

| Entscheidung | Von wem | Konsequenz |
|---|---|---|
| **macOS arm64 only** für 0.1, x64 gestrichen | Nutzer | Gemessen: ein x64-Paket enthielt arm64-Binaries in einer x86_64-Hülle — auf einem Intel-Mac tot. Linux bleibt späteres Ziel, kein Teil dieser Phase. |
| **Icon generieren lassen** statt Default oder eigenem Artwork | Nutzer | `scripts/make-icon.py` erzeugt es reproduzierbar; `build/icon.png` und `build/icon.icns` sind versioniert. Austausch kostet einen Befehl. |
| **Kein Release**, nur pushen | Nutzer | siehe oben |
| **Entitäts-Prompt via `claude --append-system-prompt-file`**, nie in die Projekt-`CLAUDE.md` | Nutzer | Details und verworfene Alternativen im Personas-Handover |
| **Companion zurückgestellt** | Nutzer | Hat die tiefste Rollenbeschreibung, aber sein Capability-Set ist von M5 ausdrücklich an M2 delegiert |
| Zwei plan-bedingte Befunde selbst entschieden statt gefragt | Assistent | Rauchtest-Skript (Diagnose darf vom Cleanup nicht verschluckt werden) und README (kein Release behaupten, das es nicht gibt). Begründungen standen im SDD-Ledger; beide sind trivial rückgängig zu machen. |

---

## 4. Was Phase 8 gebracht hat — in einem Absatz

Die App war vorher **nicht paketierbar**: `directories.output` kollidierte mit dem
electron-vite-Bauverzeichnis, weshalb `electron-builder` mit „entry file is corrupted"
abbrach. Und im Paket starb der Knowledge Graph, weil `sqlite-vec` sqlite3 einen Pfad
*innerhalb* von `app.asar` übergibt und sqlite3s eigenes `dlopen` kein asar kennt. Beides
behoben, beides vorher gemessen. Dazu: Archiv auf die gebaute App begrenzt (vorher fuhren
`src/`, `tests/`, `docs/` und eine nicht versionierte `.claude/settings.local.json` mit),
Icon, `claudeCli`-Subsystemstatus, und ein Rauchtest, der das gepackte Artefakt startet und
`graph=ready` prüft.

**Die Vorhersage des alten Handovers war falsch** — sie verortete die Falle in
`better-sqlite3` und empfahl `asarUnpack`-Einträge, die nie nötig waren. Korrigiert in
`2026-08-07-handover-phase-7ff.md` Abschnitt 3, mit Streichungen statt stiller Löschung.

---

## 5. Was als nächstes ansteht

### Entitäten/Personas — eigenes Dokument

→ **`docs/superpowers/plans/2026-08-10-handover-personas.md`**

Enthält: die getroffene Mechanik-Entscheidung samt Beleg, **fünf gemessene Lücken** zwischen
„`assembleEntityClaudeMd` existiert" und „eine Session bekommt ihren Prompt", die empfohlene
Reihenfolge, und die Spec-Tiefe aller sieben verbliebenen Rollen mit Bau-Urteil.

Die Kernaussage in einem Satz: **Es ist keine Verdrahtungsaufgabe.** Die Funktion hat keinen
Aufrufer, weil die Schichten fehlen, die sie konsumiert — nur zwei von vier Presets haben
überhaupt einen Body.

### Phase 9 (NFR-Verifikation) — jetzt möglich

War von Phase 8 abhängig, weil am Produktionsbuild gemessen werden soll. Das DMG existiert,
also ist der Weg frei. Zu messen: CK-NFR-009 (Idle-RAM < 300 MB), CK-NFR-008 (Start < 5s),
CK-NFR-011 (< 2000 Token für zehn Treffer). Zwei Hinweise zur Messmethode stehen in
`2026-08-07-handover-phase-7ff.md` Abschnitt 4 — insbesondere, dass die Init-Reihenfolge
korrigiert wurde, kurz bevor sie die Startzeitmessung verfälscht hätte.

### Phase 10 (Adapter-Garten) — weiterhin blockiert

Hängt an der Prompt-Assemblierung, also am Personas-Dokument oben.

---

## 6. Offene Befunde

→ **`docs/superpowers/plans/2026-08-07-handover-phase-7ff.md` Abschnitt 10**

Neun Befunde aus Phase 8, jeder mit Bewertung statt Wiederholung des Codes. Keiner blockiert
den Merge (Urteil des Schluss-Reviews). Drei verdienen Aufmerksamkeit, bevor jemand daran
vorbeibaut:

- **Bevor der Rauchtest je in CI läuft**, muss `console.log` vor `process.exit` repariert
  sein — auf gepipetem stdout kann das Verdict abgeschnitten werden. Vorher, nicht als
  Reaktion auf einen ersten unklaren roten Lauf, dessen Ursache sich dann selbst verschluckt.
- **`claudeCli` wird einmal bei Init geprüft, nie erneut.** Genau der Nutzer, für den die
  Diagnose gebaut wurde, installiert die CLI auf ihre Anweisung — und die StatusBar meldet
  sie weiter als fehlend, bis die App neu startet.
- **Der asar-Fix beruht auf einer Heuristik von electron-builder**, nicht auf einem
  `asarUnpack`-Eintrag. Wahr für 26.8.1, aber `^`-gepinnt, und das Einzige, was eine
  Regression auffinge, ist der Rauchtest — der nicht in CI läuft.

---

## 7. Fallen, die Zeit kosten, wenn man sie nicht kennt

**Die native ABI-Falle.** `better-sqlite3` liegt zweimal im `node_modules`: gegen Electrons ABI
(`bin/darwin-arm64-146/`, für die App) und gegen Nodes (`build/Release/`, für vitest). **Jede
Abhängigkeitsoperation und jeder `electron-builder`-Lauf kann eine der beiden zerstören** —
in Phase 7 dreimal, in Phase 8 ein viertes Mal. Symptom: rund 497 fallende Tests bei
unverändertem Code. Gegenmittel immer `npm run rebuild-native`, **nie** eine Quelldatei ändern.
Merkregel: Die Testseite ist genau die, die weiterläuft, wenn die Electron-Seite bricht.

**Kein Test in diesem Repo erreicht je einen `ipcMain`-Handler.** Es gibt kein
`vi.mock('electron')`. Grüne Tests sagen über die Verdrahtung nichts. Gegenmittel:
`.claude/skills/run-keel/` startet die echte App und lässt sie fernsteuern.

**Und zwei Lehren aus dem Prüfen selbst, beide in dieser Session bezahlt:**

- Ein IPC-Aufruf mit selbst gesetzten Parametern beweist den *Handler*, nicht den *Nutzerweg*.
  `session:create` wurde mit einem von Hand gesetzten `command` geprüft — einem Feld, das die
  echte App nie setzt. Der „Beweis" war keiner.
- `stop.sh` meldet „tmux sessions removed: 0" auch dann, wenn eine von der App erzeugte Session
  noch läuft. Nach dem Testen `tmux list-sessions` prüfen und selbst aufräumen.

**Sprachregel.** Code-Kommentare und Tests sind **englisch**; die Dokumente unter
`docs/superpowers/plans/` sind **deutsch**. Phase 8 musste zwei Rückfälle korrigieren.

**`npm run pack` vor `npm run smoke:packaged`.** Der Rauchtest prüft, ob ein Paket *existiert*,
nicht ob es *aktuell* ist. Ohne vorheriges Packen misst er still ein altes Artefakt.

---

## 8. Was zuerst zu lesen ist

1. Dieses Dokument
2. `2026-08-10-handover-personas.md` — wenn es um Entitäten geht
3. `2026-08-07-handover-phase-7ff.md` Abschnitt 10 — offene Befunde aus Phase 8
4. `2026-08-06-fertigstellung-roadmap.md` — Reihenfolge und Abgrenzung der Phasen 6–10
5. `2026-08-09-phase-8-packaging.md` — der Detailplan mit den Messprotokollen, falls jemand
   nachvollziehen will, wie die Befunde zustande kamen

> **Nicht lesen:** `HANDOFF.md` im Wurzelverzeichnis. Es endet am 2026-06-05 bei Wave 4 und
> kennt die Phasen 3a bis 8 nicht. Ein Wegweiser steht inzwischen oben drin.
