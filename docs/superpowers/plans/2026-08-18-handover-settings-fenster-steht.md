# Handover: Das Settings-Fenster steht — und was man braucht, um das Nächste zu prüfen

**Stand:** 2026-08-18
**Für:** die nächste Session
**Kurzfassung:** Die Modell-Schicht hat einen Konsumenten. PR #22 ist offen, 41 Commits,
1982 Tests. Der nächste Schritt ist das **Harness** — und §4 dieses Dokuments ist die
wichtigste Seite, weil dort steht, womit man hinterher prüft.

> **Einstiegsdokument.** Es löst `2026-08-17-handover-modell-schicht-steht.md` ab. Jenes
> bleibt gültig für die Ideations-Landschaft und den DGX-Spark-Zugang.

---

## 1. Was auf dem Zweig `settings-fenster` liegt

**PR #22** — https://github.com/cmarkus42-rgb/cipher-keel-electron/pull/22

Ein eigenes Settings-Fenster mit garantiertem Klickpfad aus dem Projektfenster, drei Reitern
(Modelle, CLI-Start, Sprachausgabe) und neun IPC-Kanälen. `src/main/model/ansicht.ts` ist der
**erste und einzige Aufrufer von `warnungen()`** — der Befund, der die Strecke ausgelöst hat,
ist eingelöst.

**Testsuite 1982 grün · Typecheck 0 · Lint 0 · Bündel-Wächter 0.**

### Vier Zusicherungen, die als Befehl belegbar sind

```bash
# 1. genau ein Aufrufer von warnungen()  -> eine Zeile, ansicht.ts:135
grep -rn "warnungen(" src/ | grep -v "src/main/model/eignung.ts"

# 2. der Renderer kennt den Hauptprozess nicht  -> kein Treffer
grep -rn "from '.*main/" src/renderer/

# 3. alle neun Settings-Kanaele haben einen Renderer-Aufrufer
for k in ansicht zuordnung-setzen eintrag-speichern eintrag-loeschen geheimnis-setzen \
         geheimnis-loeschen startargs-setzen einfachfeld-setzen rueckfall-endpunkt-setzen; do
  grep -rq "settings:$k" src/renderer/ || echo "OHNE AUFRUFER: settings:$k"; done

# 4. eine Redaktionsfunktion fuer Geheimnisse, nicht zwei
grep -rn "ursacheOhneArgv" src/
```

**Zusicherung 1 besser prüfen als per `grep`:** Der Grep trifft auch Kommentare — er hat in
dieser Strecke schon einmal zwei Zeilen gemeldet, weil ein Docblock den Satz *über* die Sache
enthielt. Der Importgraph kann das nicht: `grep -rn "from '.*eignung'" src/` zeigt, dass
`warnungen` von genau einem Modul importiert wird.

### Was dabei mitfiel

- `agent.skipPermissions` → `agent.startArgs` je Adapter, mit Migration. Der Vendor steht nicht
  mehr in der Struktur der Config, nur noch als Schlüssel.
- `ui`, `mcp`, `app.maxSessions`, `windows` hatten **keinen Leser** und sind aus dem Schema
  entfernt. `config:changed` und `config:delete` waren Kanäle ohne Handler und ohne Sender.
- **Zwei Geheimnis-Lecks geschlossen.** `execFile` legt die vollständige Argumentliste in
  `err.message`, und beide Schlüsselbund-Schreibpfade übergeben das Geheimnis als Argument.
  `worker/api-keys.ts` redigiert jetzt an der Quelle; `github/token-store.ts` hatte dieselbe
  Bauweise **ohne jeden `catch`** und hätte einen GitHub-Token in die Oberfläche gerendert,
  erreichbar aus dem Kickoff-Wizard.

## 2. Der nächste Schritt ist das Harness

Unverändert gegenüber dem letzten Handover, und jetzt billiger: Registry, Slot-Tabelle,
Eignungsregeln, Ansichtsmodell und eine Oberfläche stehen. Das Harness bringt den Läufer
`eigene-schleife` und damit Niveau B.

**Danach** die Plausibilitäts-Inferenz (CK-PROC-006 — `graph/plausibility-inference.ts` hat
weiterhin keinen Import und keinen Aufrufer), **zuletzt** das Embedding nach einem vollen
Phasendurchlauf.

## 3. Was für das Harness schon dasteht

- **Ein B-Slot ist eine Zeile** in `src/main/model/slots.ts`. Die Tabelle hält heute fünf
  Slots: drei Tiers (`fremdes-cli`, Niveau A) und zwei Rollen (`ein-schuss`, Niveau C).
- **Die Oberfläche muss dafür nicht angefasst werden.** Sie liest die Slots aus dem
  Ansichtsmodell.
- `LoaderType.NanoClawSkill` wartet weiter auf seine Umbenennung — mit dem Harness, wo der
  Ladeweg seinen neuen Träger bekommt.

---

## 4. Was du brauchst, um hinterher zu prüfen

**Das ist der Abschnitt, den man nicht überfliegt.**

### 4.1 Kein Test dieses Repos erreicht einen `ipcMain`-Handler

Unverändert wahr, und diese Strecke hat es ernst genommen: Die neun IPC-Handler haben
**bewusst keine Unit-Tests**. Ihre Abnahme sind zwölf Belege aus der laufenden App, wörtlich im
Plandokument `2026-08-17-settings-fenster.md` unter `## Messprotokoll 2026-08-17`.

Wer für das Harness Handler baut, hat dieselbe Lage. Die zwölf Belege sind die Vorlage: jeder
mit **gültiger und ungültiger** Eingabe, damit auch das laute Scheitern belegt ist und nicht
nur der Erfolg.

### 4.2 Der Prüfstand kann jetzt etwas, das er vorher nicht konnte

`launch.sh` löschte das Profil vor **jedem** Start. Damit war „die App startet mit einer
vorhandenen Konfiguration" strukturell nicht prüfbar — ausgerechnet die Klasse, zu der jede
Migration gehört, und jeder Fall, in dem die App fremde, bereits vorhandene Daten liest.

```bash
KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-migration
```

Vorgabe unverändert (Profil wird gelöscht). Zwei Belege dieser Strecke waren ohne diesen
Schalter unausführbar und sind erst im zweiten Anlauf gelaufen.

### 4.3 Vier Tests werden fallen, wenn das Harness kommt — das ist ihr Zweck

In `tests/model/ansicht.test.ts`:

```
erreicht werkzeugmodus-text nicht: kein Slot benutzt eigene-schleife
erreicht nicht-gemessen nicht: die Paarung, die es braeuchte, ist gesperrt
erreicht unter-faehigkeit nicht: die C-Slots fahren ein-schuss, der auf C steht
erreicht kontext-zu-klein nicht: nichts liefert heute einen Startkontext
```

Von sechs Warnregeln erreichen heute **zwei** einen Menschen. Diese vier Gegenproben halten
fest, warum die anderen vier es nicht tun.

**Wenn eine davon fällt, ist sie nicht kaputt — sie hat gearbeitet.** Nicht abschwächen, nicht
löschen: prüfen, ob die Regel jetzt zu Recht feuert, und die Gegenprobe in einen positiven Test
umbauen. Drei der vier lösen sich mit einem B-Slot; **`kontext-zu-klein` nicht** — die braucht
zusätzlich einen `WarnKontext` in `ansicht.ts`, der heute nicht übergeben wird. Spec §5.5 sagt
das jetzt richtig, nachdem es dort zwischendurch falsch stand.

Eine Warnung aus eigener Erfahrung: Die `nicht-gemessen`-Gegenprobe war zwischenzeitlich auf
einem `cli-harness`-Eintrag verankert. Damit wurde sie vom **Eintrag** blockiert statt von der
Slot-Tabelle und hätte beim B-Slot nie fallen können. Eine Wächterprüfung, die still aufgehört
hat zu wachen, ist schlechter als keine.

### 4.4 Ein Beleg ist nur teilweise belegt — und was ihn abschließen würde

**Beleg 6** zeigt, dass eine Zuordnung **sofort wirkt** — der Tagging-Aufruf wurde nachweislich
nicht mehr vom lokalen Rückfall bedient. Er zeigt **nicht**, dass der Aufruf beim neuen
Endpunkt ankam. Zwei Gründe:

- `autoTag` (`notes/note-tagging.ts`) fängt jeden Transportfehler und gibt `null` zurück, ohne
  die Meldung zu protokollieren — dabei nennt sie Host und Port.
- `HttpOllamaClient` reicht `timeout` an `http.request` weiter. Das ist ein **Socket**-Timeout:
  er feuert identisch für eine verbundene, stehende Verbindung und für ein unbeantwortetes SYN.
  Die App kann „beim Spark hängengeblieben" und „unterwegs verschluckt" bauartbedingt nicht
  unterscheiden.

**Was ihn in einer Zeile abschließt:** die Transportmeldung sichtbar machen (sie nennt bereits
Host und Port), oder im Ollama-Log des Spark nach der eingehenden Anfrage sehen. **Nicht** ein
weiterer Lauf gegen eine ausgelastete Maschine.

Zum Kontext: Der Spark lief während des Messlaufs mit einem Stimmtraining und war ausgelastet.
Das erklärt den Timeout — es beweist aber nicht, wohin die Anfrage ging.

### 4.5 Zwei geparkte Funde mit ihrer Reproduktion

**Leerer Host oder Port persistiert einen unerreichbaren Rückfall.** Im Rückfall-Endpunkt-Editor
das Host-Feld leeren, „Übernehmen" drücken. `normaliseEndpoint` (`worker/model-client.ts:84-86`)
benutzt `??`, und `''` beziehungsweise `0` sind nicht nullish — die Vorgaben greifen also nicht.
*Urteil:* Die Wurzel liegt in `normaliseEndpoint`, nicht in der Komponente. Dort einmal behoben
schützt es alle Aufrufer.

**Die Anbieterart eines bestehenden Eintrags auf `cli-harness` ändern scheitert.** Einen Eintrag
mit Fähigkeitszeile bearbeiten, Anbieterart auf CLI-Harness stellen, speichern. `normaliseEintrag`
lehnt die mitgeschickte Fähigkeitszeile für `cli-harness` ab — zu Recht. Das Formular hat aber
kein Feld, um sie zu leeren, und für einen **gebündelten** Eintrag gibt es keinen In-App-Ausweg.
*Urteil:* Präzise Meldung, kein Datenverlust — aber es schickt den Nutzer zurück in die
Config-Datei, also dorthin, wo CK-NFR-012 ihn wegholen soll.

### 4.6 Ein Fund außerhalb der Strecke, eigener Issue

`session:create` mit explizitem `name` umgeht `deriveSessionName`. Die entstehenden
tmux-Sitzungen passen nicht auf den `^keel-`-Filter von `stop.sh` und bleiben nach einem
Messlauf stehen. Praktisch trifft das heute den Prüfstand, nicht den Nutzer — die
UI-Pfade der App gehen über `deriveSessionName`.

**Vor jedem Messlauf prüfen**, ob noch etwas läuft: `tmux list-sessions` und
`ps aux | grep -i "[c]ipher-keel"`. Eine zweite Instanz teilt sonst Config und Datenbank.

---

## 5. Die Fallen, die diese Sitzung dazugelernt hat

**Die alten gelten unverändert** (native ABI, Bündel-Wächter, Sprachregel, Zweig vor dem Commit
prüfen, Exit-Codes nie aus abgeschnittener Ausgabe, `grep -i` bei Bestands-Sweeps).

**Neu:**

- **`execFile` legt die vollständige Argumentliste in `err.message`.** Wer ein Geheimnis als
  Argument übergibt und die Ursache weitermeldet, veröffentlicht es. Die Ursache weiterzumelden
  ist sonst genau richtig — deshalb muss redigiert werden, **wo bekannt ist, dass das Geheimnis
  in der Argumentliste steht**, nicht beim Aufrufer.
- **`??` ersetzt `null` und `undefined`, nicht `''` und nicht `0`.** Zweimal in dieser Strecke
  aufgetreten: einmal beim Bearbeiten eines Eintrags, einmal im Endpunkt-Editor.
- **`normaliseEintrag` prüft `name` vor `art`.** Ein Testeintrag `{id, art}` scheitert an der
  fehlenden Bezeichnung und meldet nie die Anbieterart. Ein Test, der die Meldung nicht liest,
  merkt das nicht.
- **`defaultValue` ohne wertgebundenen `key` friert ein.** React sieht die neue Ansicht, das
  Eingabefeld nicht. Jedes unkontrollierte Feld in dieser Oberfläche trägt deshalb
  `key={derselbeWert}`.
- **`useState` initialisiert einmal pro Mount.** Ein Formular, das ohne `key` von Eintrag A auf
  B umgeschaltet wird, zeigt weiter A's Werte unter B's Namen — und schreibt sie so.
- **Ein Kommentar, der etwas Falsches sagt, ist teurer als ein fehlender.** Diese Sitzung hat
  drei davon korrigiert, einen davon in derselben Datei, in der der beschriebene Zustand
  entfernt worden war.
- **`launch.sh` löschte das Profil.** Siehe §4.2.

## 6. Was die Methode gezeigt hat

Der Lauf hat rund **zwanzig Defekte** gefunden. **Keiner** davon ging auf die Arbeit eines
Implementierers zurück — alle stammten aus dem Plan, dem Spec oder aus Bestandscode.

Das ist kein Lob für die Implementierer, sondern eine Aussage über die Form: Ein Plan, der
vollständigen Code vorgibt, verlagert die Fehler des Planers in **ausführbaren Quelltext** —
dorthin, wo Tests, Reviewer und die laufende App sie finden. Ein vager Plan hätte dieselben
Fehler in die Implementierung gestreut, wo sie schwerer zuzuordnen sind.

Zwei Funde konnte **nur** das Abschluss-Review über den ganzen Zweig sehen, weil jede einzelne
Aufgabe für sich korrekt war:

- ein neunter IPC-Kanal ohne Aufrufer — der Zweig reproduzierte im Inneren seines eigenen
  Heilmittels genau den Fehler, gegen den er gebaut wurde. Die Lücke lag zwischen Spec §5.2 und
  der Aufgabenzerlegung.
- die Behebung einer Doppelung auf dem **toten** Pfad, während der lebende sie behielt: die vier
  Prompt-Fragmente in `claude-code.ts` haben keinen Produktivaufrufer, materialisiert wird
  `preset/cyber-factory/capabilities/worker-startup-protokoll/SKILL.md`.

**Daraus für die nächste Strecke:** Das Abschluss-Review über den ganzen Zweig ist kein
Formalismus. Es ist die einzige Stelle, an der Nahtstellen zwischen Aufgaben sichtbar werden.

## 7. Wo Belege und Begründungen liegen

- **Messprotokoll**, wörtlich, im Plan: `2026-08-17-settings-fenster.md`, Abschnitt
  `## Messprotokoll 2026-08-17` plus den Nachtrag der Fix-Welle.
- **Spec:** `docs/superpowers/specs/2026-08-17-settings-fenster-design.md`. §5.5 trägt die
  Erreichbarkeits-Analyse der Warnregeln, §5.3 die Geheimnis-Entscheidung.
- **Ledger:** `.superpowers/sdd/2026-08-17-settings-fenster/progress.md` — jede Fix-Runde, jede
  Adjudikation, jeder zurückgestellte Fund. **Nicht in Git**, überlebt ein Aufräumen nicht.
- **Inventar:** `docs/anpassbare-flaechen.md` sagt jetzt die Wahrheit, und
  `tests/docs/anpassbare-flaechen.test.ts` nagelt sie fest — inklusive `modelle.eintraege` und
  `modelle.zuordnung`. Eine neue anpassbare Fläche ohne Inventareintrag ist ein Prüfbefund.

## 8. Die Haltung, unverändert

**Belege schlagen Behauptungen.** Zwölf Belege aus der laufenden App, zwei davon zunächst
unausführbar und dann gemeldet statt geglättet — das war der Fund, der den Prüfstand repariert
hat.

**Stille Fehler sind die teuersten.** Diese Sitzung hat drei gefunden, die alle 1900+ Tests
überlebt hätten: eine Nutzerkonfiguration, die bei einem Schreibfehler verworfen worden wäre;
ein Klartext-Geheimnis auf dem Weg zur Oberfläche; eine Wächterprüfung, die aufgehört hatte zu
wachen.

**Eine Begründung muss wahr sein.** Der letzte Commit dieser Strecke korrigiert drei Aussagen,
die nicht stimmten — darunter eine im eigenen Messprotokoll, die mehr behauptete, als die
Beobachtung trug. Ein Beleg, der aus dem falschen Grund besteht, ist teurer als ein fehlender:
er sieht aus wie eine Absicherung.
