# autoTag — Konfigurationsfehler laut scheitern lassen — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In `NoteTagging.autoTag()` einen Konfigurationsfehler von einem Transportfehler unterscheiden — der eine propagiert, der andere degradiert weiter still.

**Architecture:** Zwei getrennte `try`-Bereiche statt eines. Der Schnitt ist zeitlich: Was beim **Auflösen** von Rolle zu Endpunkt wirft, ist Konfiguration; was beim **Senden** wirft, ist Transport. Keine Fehlermeldung wird gelesen.

**Spec:** `docs/superpowers/specs/2026-08-17-autotag-laute-fehler-design.md`

## Global Constraints

- **Zweig:** `autotag-laute-fehler`. Vor jedem Commit `git branch --show-current` prüfen.
- Code und Kommentare **englisch**; Nutzer-sichtbare Meldungen **deutsch**.
- **Der Erfolgsfall ändert sich nicht.** Kein Anfassen von `parseTagResponse`, dem Timeout, oder dem Prompt-Bau.
- Exit-Codes richtig prüfen: `npm run typecheck >/dev/null 2>&1; echo $?`, ebenso `lint`.
- Native ABI: ~497 fallende Tests heißen `npm run rebuild-native`.
- `package-lock.json` nicht anfassen, kein `npm ci`.
- Commit-Rumpf endet auf `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Die beiden Klassen trennen

**Files:** `src/main/notes/note-tagging.ts`, `tests/notes/` (bestehende Tests prüfen, neue ergänzen)

- [ ] **Step 1: Die bestehenden Tests lesen und den Transport-Fall festhalten**

Finde den Test, der belegt, dass ein nicht erreichbarer Dienst `null` ergibt. Er muss **unverändert** grün bleiben — er ist der Beleg, dass das stille Degradieren erhalten ist.

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

Ein Konfigurationsfehler beim Auflösen propagiert, statt `null` zu ergeben. Die Auflösung mocken, sodass sie wirft; erwarten, dass `autoTag` ablehnt und die Meldung trägt.

- [ ] **Step 3: Laufen lassen, Fehlschlag bestätigen**

Erwartet: der Test fällt, weil heute `null` zurückkommt statt einer Ablehnung.

- [ ] **Step 4: Die Trennung bauen**

Die Auflösung (`endpointForRole`) aus dem `try` herausziehen, das den Transport umschließt. Der Kommentar am verbleibenden `catch` wird berichtigt: Er nennt CK-NOTES-002 für das stille Degradieren bei Transportfehlern und hält fest, dass CK-NFR-010 die **Unterscheidbarkeit** verlangt und deshalb gerade nicht das Schlucken trägt.

- [ ] **Step 5: Prüfen**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
npm run lint >/dev/null 2>&1; echo "lint: $?"
```

Der Transport-Test aus Step 1 muss unverändert grün sein. Musste er angepasst werden, ist der Schnitt falsch — melden statt umschreiben.

- [ ] **Step 6: Committen**

---

### Task 2: Beleg in der laufenden App

- [ ] **Step 1: Den Fall erzwingen**

Über `.claude/skills/run-keel/`. Config sichern. `modelle.zuordnung.rollen.tagging` auf `claude-opus-cli` setzen — dieselbe Zuordnung wie in Beleg 4 der Registry-Strecke, die dort in einem stillen `null` verschwand.

- [ ] **Step 2: Tagging auslösen und die Meldung aufnehmen**

Erwartet: eine benennbare Fehlermeldung statt `null`. Wörtlich aufnehmen, Ablage unter `.superpowers/sdd/2026-08-17-autotag-laute-fehler/beleg/`.

**Falls die Meldung nirgends ankommt:** Das ist ein Ergebnis, kein Fehlschlag — die Spec sagt voraus, dass ohne Notizen-Oberfläche keine Meldung einen Nutzer erreicht. Dann festhalten, wo sie endet.

- [ ] **Step 3: Die Gegenprobe**

Zuordnung entfernen, Tagging erneut auslösen: Es muss wieder normal durchlaufen. Config MD5-identisch zurücksetzen und das prüfen, nicht annehmen.

- [ ] **Step 4: Messprotokoll** an das Ende dieses Plans.

---

## Was diese Strecke nicht tut

- Keine Notizen-Oberfläche, kein Klickpfad zum Tagging.
- Keine Änderung an `parseTagResponse`, am Timeout oder am Erfolgsfall.
- Keine neue Anforderung — CK-NFR-010 trägt die Unterscheidung bereits.

---

## Messprotokoll — 2026-08-17, laufende App

Durchgeführt über `.claude/skills/run-keel/`. Rohbelege unter
`.superpowers/sdd/2026-08-17-autotag-laute-fehler/beleg/`.

### Der erzwungene Konfigurationsfehler

`modelle.zuordnung.rollen.tagging = "claude-opus-cli"` — dieselbe Zuordnung, die beim Messlauf
der Registry-Strecke in einem stillen `null` verschwand. Zurück kam, wörtlich:

```
EXCEPTION: Error: Error invoking remote method 'notes:auto-tag':
Error: Ein cli-harness-Eintrag hat keinen Endpunkt
```

Nach **0,109 s**, ohne Timeout. Vorher an derselben Stelle:

```json
{ "type": "object", "subtype": "null", "value": null }
```

Der Fehler ist damit **benennbar** — er sagt, was falsch ist, statt zu schweigen.

### Wo er landet — und hier lag die Spec daneben

§4 dieser Strecke schrieb, ohne Notizen-Oberfläche könne die Meldung *„keinen Nutzer
erreichen"*, und legte nahe, sie lande nirgends. Die erste Hälfte stimmt, die zweite nicht:

**Electron protokolliert eine abgelehnte `ipcMain.handle`-Promise von sich aus** ins
Main-Log — mit vollem Stacktrace bis `toModelEndpoint`. Dazu erscheint sie als abgelehnte
Promise im Renderer.

Der Fehler ist also fuer **jemanden, der ins Log sieht, sichtbar** — nur nicht für einen Nutzer
der Oberfläche. Das ist ein spürbar besserer Zustand als der vorherige, in dem gar nichts
irgendwo auftauchte, und die Spec hat ihn unterschätzt. Was fehlt, ist allein die Anzeige.

### Gegenprobe

Zuordnung entfernt, App neu gestartet, Tagging erneut ausgelöst:

```
["domain:infra", "phase:testing"]
```

Echte Tags, kein `null`, kein Stacktrace. Der Erfolgspfad ist unberührt, und der stille
Transport-Rückfall ist es auch.

### Rücksetzung

Config MD5-identisch mit dem Backup (`2817cac00853252dc795d7e5f75be546`), zusätzlich per `diff`
geprüft — keine Abweichung. Keine zweite App-Instanz lief mit; geprüft, nicht angenommen.
