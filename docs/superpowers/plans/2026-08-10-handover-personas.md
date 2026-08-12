# Handover — Entitäten/Personas: Prompt-Assemblierung anschließen und den Katalog erweitern

**Stand:** 2026-08-10
**Für:** eine frische Session, die an den Personas arbeitet
**Vorlauf:** Phase 8 (Packaging) ist gebaut und reviewt, PR #10 offen, Branch `phase-8-packaging`

> **Zweck:** Die naheliegende Formulierung der Aufgabe — „`assembleEntityClaudeMd` verdrahten,
> dann eine fünfte Persona bauen" — ist in beiden Hälften irreführend. Dieses Dokument hält
> fest, was gemessen wurde, welche Entscheidung schon gefallen ist, und in welcher Reihenfolge
> die Arbeit tatsächlich trägt. Wer nur die Roadmap liest, baut an der falschen Stelle.

---

## 1. Die Entscheidung, die schon gefallen ist

**Der zusammengebaute Entitäts-Prompt geht als Datei an `claude --append-system-prompt-file`,
nicht in eine `CLAUDE.md` im Projektverzeichnis.** (Nutzer-Entscheidung 2026-08-10.)

Begründung und verworfene Alternativen:

| Weg | Warum nicht |
|-----|-------------|
| `injectSection` in die Projekt-`CLAUDE.md` | Mutiert eine oft versionierte Datei des Nutzers; `git status` wird bei jedem Session-Start schmutzig. Zusätzlich ist `injectSection` **idempotent im schädlichen Sinn**: ein zweiter Aufruf mit *anderem* Inhalt ist ein No-op (`tests/inject-section.test.ts`), eine Persona ließe sich damit nie aktualisieren. |
| `--append-system-prompt "<text>"` inline | `opts.command` wird per `tmux send-keys` **in die Shell getippt** (`src/main/tmux/tmux-manager.ts`, `createSession`). Ein mehrere KB großer Markdown-Block mit Zeilenumbrüchen wäre dort eine Folge von Enter-Tasten. |
| Zwei Pfade nach Niveau (Datei bei A, Prompt bei B/C) | Doppelter Bau- und Testaufwand, und der riskante Schreibpfad bliebe drin. |

**Verifiziert, nicht angenommen:** `--append-system-prompt-file <file>` existiert in Claude Code
2.1.221. Die Optionsliste von `claude --help` führt es **nicht** — nur der Fließtext erwähnt
`--append-system-prompt[-file]`. Nachgewiesen über den Aufruf ohne Argument:

```
$ claude --append-system-prompt-file
error: option '--append-system-prompt-file <file>' argument missing
```

> **Risiko, das dazugehört:** ein undokumentiertes Flag kann zwischen CLI-Versionen verschwinden.
> Wer darauf baut, sollte den Aufruf an einer Stelle kapseln und einen erkennbaren Fehler
> erzeugen, wenn er wegfällt — nicht still auf einen Prompt-losen Start zurückfallen.

**Konzept-Nachzug:** `src/main/preset/niveau.ts` legt für Niveau A `bodyForm: 'CLAUDE.md'` fest.
Der gewählte Weg liefert denselben Inhalt, aber nicht als projekteigene `CLAUDE.md`. Nach der
Regel in `CLAUDE.md` („Weichen Konzept und Bau voneinander ab, wird das Konzept präzisiert —
in den Ideation-Verzeichnissen, nicht im Repo") gehört das in
`/Users/Shared/Nextcloud/Claude/cipher-keel-entitaeten-ideation/` nachgezogen.

---

## 2. Warum „nur verdrahten" nicht geht — fünf gemessene Lücken

`assembleEntityClaudeMd` (`src/main/session/assemble-entity.ts`) hat null Produktionsaufrufer.
Das ist **keine vergessene Zeile**: die Schichten, die es konsumiert, existieren nicht
einheitlich. Alles unten am 2026-08-10 im Code nachgesehen.

| # | Lücke | Belegt durch |
|---|-------|--------------|
| 1 | **Keine Registry `entityId → Preset.**` `PRESET_CATALOG` kennt vier IDs, aber nichts bildet sie auf ein Preset-Objekt ab. | `src/shared/preset-catalog.ts` vs. fehlender Registry-Export in `src/main/preset/index.ts` |
| 2 | **Die vier Presets haben unterschiedliche Form.** Drei exportieren eine Konstante (`ARCHITECT_RAHMEN`, `CF_RAHMEN`, `SE_RAHMEN`), Workshop nur eine Fabrik `createWorkshopRahmen(niveau)`. | `grep "export const.*RAHMEN"` findet drei; `workshop-preset.ts:107` |
| 3 | **Nur zwei von vier haben einen Body.** `architect-body.md` und `cf-body.md` existieren; Systems Engineer und Workshop haben keinen. Beide vorhandenen Bodies werden **ausschließlich von ihren eigenen Tests gelesen** — kein Produktionscode. | `find src/main/preset -name "*body*"`; `grep -rn "body.md" src/ tests/` |
| 4 | **`persona-loader` zeigt ins Leere.** `DEFAULT_PERSONAS_DIR = path.join(__dirname, 'personas')` — das Verzeichnis existiert nicht, `loadPersona()` liefert damit immer `null`. | `src/main/preset/shared/persona-loader.ts`; `ls src/main/preset/shared/personas/` → nicht vorhanden |
| 5 | **`buildLaunchCommand()` hat keinen Produktionsaufrufer.** Die injektionssichere `{cmd, args}`-Form existiert, aber `session:create` baut den Start nicht darüber. | `grep -rn "buildLaunchCommand("` findet nur Definitionen und einen Test |

**Was daraus folgt:** Wer „schnell verdrahtet", bekommt eine Lösung, die für zwei von vier
Personas etwas tut und für die anderen beiden still nichts — genau die Fehlerklasse, an der
dieses Projekt wiederholt Zeit verloren hat (Graph tot bei grünen Tests, Grid-Fenster ohne
Öffner, totes `session:create`-Gate). **Halbe Verdrahtung ist schlechter als keine.**

---

## 3. Empfohlene Reihenfolge

### Zuerst: die Startstrecke vollständig machen — mit den vier bestehenden Presets als Prüfstein

Kein neues Preset, bis eine Session nachweislich ihren Entitäts-Prompt bekommt. Die vier
vorhandenen sind der ehrlichere Test als eine frisch gebaute fünfte, weil sie sich in der Form
unterscheiden (Lücke 2) und damit die Registry wirklich fordern.

Grober Schnitt, jeder Schritt einzeln testbar:

1. **Bodies für Systems Engineer und Workshop schreiben.** Inhaltliche Arbeit, kein Klebstoff.
   Vorlage: `architect-body.md` (42 Zeilen) ist die schlankste gebaute Form. Quelle für den
   Inhalt: M5 v1.1 Abschnitt 4 (SE) und 8.5 (Workshop) in
   `cipher-keel-entitaeten-ideation/deliverables/konzept_v1.1.md`.
2. **Registry `entityId → { body, capabilities, niveau, persona }`** in `src/main/preset/`.
   Sie muss Konstante *und* Fabrik (Workshop) gleich behandeln.
3. **`personas/`-Verzeichnis anlegen** und die in `persona-defaults.json` referenzierten
   Personas hinterlegen, sonst bleibt die Persona-Schicht leer.
4. **Prompt-Datei schreiben** — unter `app.getPath('userData')`, **nie** ins Projektverzeichnis.
   Ein Pfad pro Session, damit parallele Sessions sich nicht überschreiben.
5. **`session:create` an `buildLaunchCommand()` anschließen** und den Aufruf um
   `--append-system-prompt-file <pfad>` ergänzen. Das schließt zugleich Lücke 5.
6. **In der laufenden App beweisen** (siehe Abschnitt 5) — dass der Prompt in der Session
   ankommt, sagt keine Testsuite dieses Repos.

### Danach: die fünfte Persona

Erst wenn Schritt 6 grün ist, kostet eine neue Persona nur noch Body + Capabilities +
Registry-Eintrag.

---

## 4. Welche Persona als nächste — Spec-Tiefe je Rolle

M5 v1.1 behandelt drei Rollen ausführlich (Systems Engineer §4, Architekt §5, Companion §6)
und die übrigen in einem Katalog (§8). Der Katalog ist **kein Stichwortzettel**: jede Rolle
nach demselben Schema — Identität, Zweck, Platz in der Ordnung, Verhältnisse, Grenzen.

| Rolle | Quelle | Baubar? | Anmerkung |
|-------|--------|---------|-----------|
| **Testing Assistant** | §8.4 | ja | Schärfste Grenzen aller sieben: „läuft die Suite, beurteilt Testqualität, adversarial probing, dokumentiert — **fixt nicht**". |
| **Debugger** | §8.6 | ja | Direkt vom Nutzer beauftragbar, steht außerhalb des SE-Trigger-Schemas. Klarer Ablauf Repro → Fix-Plan → Verhaltens-Test → Verifikation → Walkthrough. |
| **Audit** | §8.7 | ja | „Schleife, kein Finale" — innerhalb einer Welle mehrfach aufrufbar. |
| **Ideation** | §8.1 | ja | Erste Phase der Kette. |
| **Refinement** | §8.2 | ja | RE-Phase, liefert Detail-Spec mit REQ-IDs. |
| **Companion** | §6 (volle Sektion) | **nein — zurückgestellt** | Nutzer-Entscheidung 2026-08-10. Hat die *tiefste* Beschreibung und ist trotzdem nicht baubar: sein definierendes Merkmal, welche Tools die lesend-darstellende Klasse abdecken, ist von M5 ausdrücklich an **M2** delegiert. Sein Capability-Set ist der undefinierte Teil. |
| **Release Manager** | §8.8 | **nein** | M5 selbst: „bewusst nur benannt und verortet — die Detaillierung ist späterer Arbeit überlassen". |

**Empfehlung: Testing Assistant zuerst.** Nicht als wichtigste Rolle, sondern als ehrlichster
Prüfstein — eine Rolle mit so scharfen Grenzen zeigt sofort, ob die Assemblierung wirklich
wirkt. Und sie hätte in diesem Repo ab Tag eins echte Arbeit: 1541 grüne Tests bei einer
dokumentierten blinden Stelle, die kein Test erreicht (Abschnitt 5).

**Zwei Rückenwinde, die man leicht übersieht:**

- `src/main/preset/shared/persona-defaults.json` kennt bereits Einträge für
  **`debugger`** und **`testing-assistant`** — die Persona-Zuordnung nimmt beide vorweg.
- M5 §8 hält fest, die Rollen seien „im cyber-factory-pack bereits als Entitäten vorhanden;
  M5 schärft sie und ordnet sie ein". Es ist **Portieren und Schärfen, kein Erfinden**.

**Und eine bewusste Grenze:** Die vier sind der ratifizierte 0.1-Schnitt (M6 §3.1 / BG-1), so
dokumentiert in `preset-catalog.ts` und im README. Eine fünfte Persona verschiebt diese Grenze.
Das ist eine Entscheidung, keine Hürde — aber sie sollte benannt werden, nicht nebenbei fallen,
und beide Dokumente sind dann nachzuziehen.

---

## 5. Fallen, die diese Session kosten werden, wenn sie unbekannt sind

**Kein Test in diesem Repo erreicht je einen `ipcMain`-Handler.** Es gibt kein
`vi.mock('electron')`. `src/main/ipc-handlers.ts` ist genau der Ort, an dem
`session:create` komponiert — und damit der Ort, den diese Arbeit anfasst. Grüne Tests sagen
über die Verdrahtung nichts.

**Gegenmittel:** `.claude/skills/run-keel/` startet die echte App und lässt sie fernsteuern.
Für diese Aufgabe die Mindestprüfung:

```bash
.claude/skills/run-keel/launch.sh
D=".claude/skills/run-keel/driver.mjs"
node $D project-window "window.cipherKeel.invoke('services:status')"
.claude/skills/run-keel/stop.sh
```

Und danach in der erzeugten tmux-Session nachsehen, ob `claude` mit dem Flag gestartet wurde
(`tmux list-panes -t <name> -F '#{pane_start_command}'`) und ob die Prompt-Datei am erwarteten
Pfad liegt.

> **Zwei Warnungen zum Prüfen selbst**, beide in Phase 8 am eigenen Leib erfahren:
> - Ein IPC-Aufruf mit selbst gesetzten Parametern beweist den *Handler*, nicht den
>   *Nutzerweg*. In Phase 8 wurde `session:create` mit einem von Hand gesetzten `command`
>   geprüft — ein Feld, das die echte App nie setzt. Der Beweis war keiner.
> - `stop.sh` meldet „tmux sessions removed: 0" auch dann, wenn eine von der App erzeugte
>   Session noch läuft; sein Aufräumen deckt offenbar nur das eigene Namensmuster ab.
>   Nach dem Testen `tmux list-sessions` prüfen und selbst aufräumen.

**Die native ABI-Falle.** `better-sqlite3` existiert zweimal im `node_modules` — gegen Electrons
ABI (`bin/darwin-arm64-146/`, für die App) und gegen Nodes (`build/Release/`, für vitest).
**Jede Abhängigkeitsoperation und jeder `electron-builder`-Lauf kann eine der beiden zerstören.**
In Phase 7 dreimal zugeschnappt, in Phase 8 ein viertes Mal. Symptom: rund 497 fallende Tests
bei unverändertem Code. Gegenmittel immer `npm run rebuild-native`, nie eine Quelldatei ändern.

**Sprachregel.** Code-Kommentare und Tests sind **englisch** — die zwei Commits vor dem
Phase-8-Branch haben den Bestand umgestellt, und Phase 8 musste zwei Rückfälle korrigieren.
Die Dokumente unter `docs/superpowers/plans/` sind **deutsch**. Nicht verwechseln.

---

## 6. Was zuerst zu lesen ist

1. Dieses Dokument
2. `cipher-keel-entitaeten-ideation/deliverables/konzept_v1.1.md` — M5, die Rollenquelle
   (§4 SE, §5 Architekt, §6 Companion, §8 Katalog der übrigen)
3. `src/main/preset/architect/` — die schlankste gebaute Persona, 238 Zeilen in drei Dateien,
   und damit die Formvorlage
4. `src/main/session/assemble-entity.ts` — was die Assemblierung erwartet
5. `docs/superpowers/plans/2026-08-07-handover-phase-7ff.md` Abschnitt 10 — offene Befunde
   aus Phase 8

---

## 7. Offene Punkte, die diese Arbeit berührt

- **Phase 10 (Adapter-Garten) hängt hieran.** Die Roadmap nennt die angeschlossene
  Prompt-Assemblierung als Voraussetzung. Ein zweiter Adapter ist erst sinnvoll, wenn es
  etwas zu übertragen gibt.
- **`AdapterRegistry` hat weiterhin genau eine Implementierung** (`claude-code`). Die
  Schnittstelle ist damit unbewiesen. Wer Schritt 5 baut, sollte sie so anfassen, dass ein
  zweiter Adapter später nicht alles umwirft — aber ohne ihn zu bauen (YAGNI).
- **Der Erst-Start von 0.1 auf einem fremden Mac steht noch aus** und ist das Abnahme-
  kriterium von Phase 8. Unabhängig von dieser Arbeit, aber offen.
