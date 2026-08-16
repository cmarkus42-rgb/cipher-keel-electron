# NanoClaw-Rückbau — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das abgelöste NanoClaw-Subsystem entfernen, sodass die laufende App nur noch `voice` als degradiert meldet.

**Architecture:** Reine Entfernung. Eine Klasse geht ersatzlos (Modul, Tests, IPC-Kanäle, Dienst-Verdrahtung, Statusanzeige), eine zweite behält ihre Funktion und verliert nur eine falsche Beschriftung, eine dritte bleibt vollständig unangetastet.

**Tech Stack:** TypeScript, Electron Main + Renderer, vitest. Keine neuen Abhängigkeiten, keine entfernten.

**Spec:** `docs/superpowers/specs/2026-08-17-nanoclaw-rueckbau-design.md`
**Autorität:** M6-Nachtrag `nachtrag-nanoclaw-abloesung_2026-08-16.md` Punkt 4

## Global Constraints

- **Zweig:** `nanoclaw-rueckbau`. Vor jedem Commit `git branch --show-current` prüfen.
- **Sprache:** Code und Kommentare **englisch**; Nutzer-sichtbare Texte und alles unter `docs/superpowers/` **deutsch**.
- **Drei Dinge bleiben unangetastet** — wer sie anfasst, hat den Zuschnitt verlassen:
  1. `LoaderType.NanoClawSkill` in `src/main/preset/capability-schema.ts` — der Ladeweg für Niveau B (M2 §6.4). Nur der Kommentar daneben wird ehrlich gemacht.
  2. Die historischen Notizen in `src/main/session/model-resolver.ts` und `src/main/worker/c-worker.ts` — sie halten die Ablösung fest und wurden dafür geschrieben.
  3. Das `voice`-Subsystem. Seine Degradation ist echt.
- **Test anpassen, Wert nicht zurückholen.** Ein Test, der NanoClaw als lebend voraussetzt, behauptet etwas Falsches. Wo der Gegenstand eines Tests *war* NanoClaw, fällt er weg — und der Verlust wird im Testfile vermerkt, nicht stillschweigend vollzogen.
- **Exit-Codes nie aus abgeschnittener Ausgabe schließen.** `npm run typecheck >/dev/null 2>&1; echo $?`, ebenso für `lint` und `verify:bundle`.
- **Native ABI:** ~497 fallende Tests heißen `npm run rebuild-native`, nie eine Quelldatei ändern.
- `package-lock.json` nicht anfassen, kein `npm ci`.
- Commit-Rumpf endet auf `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Dateien

| Datei | Was |
|---|---|
| `src/main/nanoclaw/` | **löschen** — fünf Dateien |
| `tests/nanoclaw/` | **löschen** — fünf Dateien |
| `src/shared/ipc-channels.ts` | fünf Kanal-Konstanten und ihre Union-Mitglieder raus |
| `src/shared/service-status.ts` | Subsystem-Id `nanoclaw` aus `SUBSYSTEM_IDS` |
| `src/main/service-lifecycle.ts` | `initNanoClaw()`, Ereignis-Verdrahtung, `disconnect()`-Pfad |
| `src/main/main.ts` | Import und Dienste-Feld |
| `src/main/window-manager.ts` | `nanoClawBridge` aus `AppServices` |
| `src/main/ipc-handlers.ts` | Adapter-Registrierung, drei IPC-Handler, Kanal-Importe |
| `src/renderer/components/StatusBar.tsx` | `NanoClawIndicator`, `nanoClawStatus`-Prop |
| `src/shared/kanban-types.ts`, `src/main/graph/phase-contract.ts`, `src/main/preset/capabilities.ts`, `src/main/graph/plausibility-inference.ts` | nur Beschriftungen |
| `docs/anpassbare-flaechen.md` | drei Inventar-Zeilen, CK-NFR-013-Abschnitt |

**Warum das Entfernen ein Task ist und nicht vier:** Der Typprüfer bindet diese Stellen
aneinander. Wer `SUBSYSTEM_IDS` kürzt, ohne `service-lifecycle` anzufassen, hinterlässt einen
Baum, der nicht übersetzt. Ein Zwischenstand, der nicht baut, ist kein Fortschritt, sondern ein
Commit, den niemand prüfen kann.

---

### Task 1: Das Subsystem entfernen

**Files:** alle oben unter „löschen" und die fünf Verdrahtungs-Dateien.

- [ ] **Step 1: Bestand aufnehmen, bevor etwas verschwindet**

```bash
grep -rn "nanoclaw\|NanoClaw" src/ tests/ | wc -l    # Ausgangswert notieren
grep -rln "nanoclaw\|NanoClaw" src/ tests/ | sort     # Dateiliste notieren
```

Beides in den Report. Am Ende muss die verbleibende Liste genau die Dateien aus Klasse B und C
enthalten — nichts sonst.

- [ ] **Step 2: Die Module löschen**

```bash
git rm -r src/main/nanoclaw tests/nanoclaw
```

- [ ] **Step 3: Die Verdrahtung herausnehmen**

In dieser Reihenfolge, weil jede Stufe die nächste sichtbar macht:

1. `src/main/ipc-handlers.ts` — die drei Handler, die Adapter-Registrierung, die Kanal-Importe.
2. `src/main/service-lifecycle.ts` — `initNanoClaw()`, sein Aufruf, die Ereignis-Verdrahtung, der `disconnect()`-Aufruf beim Herunterfahren.
3. `src/main/main.ts` — Import und Dienste-Feld.
4. `src/main/window-manager.ts` — das Feld im `AppServices`-Typ.
5. `src/shared/ipc-channels.ts` — die fünf Konstanten **und** ihre Mitgliedschaft in den Kanal-Unions.
6. `src/shared/service-status.ts` — die Id aus `SUBSYSTEM_IDS`.
7. `src/renderer/components/StatusBar.tsx` — `NanoClawIndicator` und die Prop.

`npm run typecheck >/dev/null 2>&1; echo $?` nach jeder Stufe. Ein Fehler dort ist der
Wegweiser zur nächsten Stelle, kein Problem.

- [ ] **Step 4: Die Tests nachziehen**

Erwartet betroffen: `tests/service-lifecycle.test.ts`, `tests/service-status.test.ts`,
`tests/status-bar-degradation.test.ts`, `tests/renderer/phase5-statusbar.test.ts`,
`tests/agent/adapter-niveau.test.ts`,
`tests/session/session-create-adapter-selection.test.ts`, `tests/workshop-gate.test.ts`,
`tests/preset/capability-path.test.ts`, `tests/graph/phase5-plausibility.test.ts`.

Je Test entscheiden:

- Prüft er etwas, das es weiterhin gibt, und nennt nur nebenbei NanoClaw? → **anpassen**, Substanz behalten.
- War NanoClaw sein Gegenstand? → **entfernen**, und im Testfile in einem Kommentar festhalten, welche Abdeckung damit wegfällt und unter welcher Bedingung sie zurückkäme.

**Nicht anpassen, um grün zu werden.** Wenn ein Test etwas Wahres prüft und nach dem Rückbau
fällt, ist das ein Fund — melden statt umschreiben.

- [ ] **Step 5: Prüfen**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
npm run lint >/dev/null 2>&1; echo "lint: $?"
npm run verify:bundle >/dev/null 2>&1; echo "bundle: $?"
grep -rln "nanoclaw\|NanoClaw" src/ tests/ | sort
```

Die letzte Liste gegen Step 1 halten und im Report begründen, warum jede verbliebene Datei
verbleiben **darf** — sie muss in Klasse B oder C der Spec stehen.

- [ ] **Step 6: Committen**

```bash
git branch --show-current
git add -A
git commit -m "refactor: remove the superseded NanoClaw subsystem

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Beschriftungen und Dokumentation

**Files:** `src/shared/kanban-types.ts`, `src/main/graph/phase-contract.ts`, `src/main/preset/capabilities.ts`, `src/main/graph/plausibility-inference.ts`, `src/main/preset/capability-schema.ts`, `docs/anpassbare-flaechen.md`

- [ ] **Step 1: Die vier Beschriftungen richtigstellen**

Jeweils so, dass die Aussage **wahr** wird, nicht so, dass das Wort verschwindet:

- `kanban-types.ts:38` — die Schenkel-Achse bleibt; der zweite Schenkel ist heute das eigene Harness.
- `phase-contract.ts:9` — dasselbe.
- `capabilities.ts:8` — verweist auf die Kanalroute des `nanoclaw-skill`-Ladewegs. Der Ladeweg bleibt (siehe unten), die Formulierung soll nicht suggerieren, dass dahinter ein laufendes NanoClaw steht.
- `capability-schema.ts` — **den Enum-Wert nicht anfassen.** Nur der Kommentar wird ehrlich: Dies ist der Ladeweg für Niveau B, sein ursprünglicher Träger ist abgelöst, eine Umbenennung ist eine Datenmigration und gehört zum Harness-Bau.

- [ ] **Step 2: Den Docblock der Plausibilitäts-Inferenz ehrlich machen**

`src/main/graph/plausibility-inference.ts` beginnt mit *„local model assessment via NanoClaw"*.
Das Modul hat **keinen Import** — es nimmt ein ententypisiertes `BridgeLike` entgegen, geformt
nach dem abgelösten Kanal. Es hat außerdem keinen Produktiv-Aufrufer.

Den Docblock so schreiben, dass beides dort steht: welchen Zweck das Modul hat (CK-PROC-006,
die inhaltliche Hälfte der Gates), dass seine Schnittstellenform vom abgelösten Kanal stammt,
und dass die Umverdrahtung auf die Modell-Schicht eine offene Entwurfsfrage ist.

**Das Modul selbst nicht umbauen.** Welcher Läufer, welcher Vertrag, wer aufruft — das ist ein
eigener Strang.

- [ ] **Step 3: `docs/anpassbare-flaechen.md`**

Drei Inventar-Zeilen und der Abschnitt zum CK-NFR-013-Konflikt. Der Konflikt ist **erledigt**,
nicht verschwunden: Das Dokument soll festhalten, dass er der Anlass war, das Harness selbst zu
bauen. Ein Konflikt, dessen Auflösung man löscht, wird in einem halben Jahr neu entdeckt.

- [ ] **Step 4: Prüfen und committen**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
npm run lint >/dev/null 2>&1; echo "lint: $?"
git add -A
git commit -m "docs: relabel what outlived NanoClaw, keep what it explains

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Beleg in der laufenden App

Grüne Tests sagen über die Statuszeile nichts — kein Test erreicht einen `ipcMain`-Handler.

- [ ] **Step 1: Starten und ablesen**

Über `.claude/skills/run-keel/`. Die Statuszeile am unteren Rand ablesen und den Text wörtlich
aufnehmen (innerText genügt), Ablage unter
`.superpowers/sdd/2026-08-17-nanoclaw-rueckbau/beleg/`.

**Erwartet:** genau ein degradiertes Subsystem, `voice`. Die Zeile muss `nanoclaw` **nicht mehr**
nennen und `voice` **weiterhin**.

- [ ] **Step 2: Die Gegenprobe**

`voice` muss weiter gemeldet werden. Verschwindet die Warnung ganz, ist nicht der Rückbau
gelungen, sondern die Anzeige kaputt — das wäre der zweite Fehler und schlimmer als der erste.
Ausdrücklich prüfen und im Protokoll festhalten.

- [ ] **Step 3: Messprotokoll**

Am Ende dieses Plans, mit der wörtlichen Zeile und dem Datum. Was nicht gezeigt werden konnte,
wird als nicht gezeigt notiert.

---

## Was diese Strecke nicht tut

- **Kein Ersatz für Niveau B.** Das eigene Harness ist ein anderer Strang.
- **Keine Umbenennung von `LoaderType.NanoClawSkill`** — Datenmigration, gehört zum Harness-Bau.
- **Keine Umverdrahtung der Plausibilitäts-Inferenz** — Entwurfsfrage, eigener Strang.
- **Keine Änderung an den historischen Notizen** in `model-resolver.ts` und `c-worker.ts`.
- **Kein Anfassen von `voice`.**
