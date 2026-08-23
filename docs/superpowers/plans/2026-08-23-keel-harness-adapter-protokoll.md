# Protokoll: der Beweis in der laufenden App — Task 11

Alles hier ist an der laufenden App gemessen (`run-keel`, CDP-Treiber gegen ein
`KEEL_KEEP_PROFILE=1`-Profil unter `/tmp/keel-harness`), nicht aus dem Code geschlossen. Wo eine
Messung einer Annahme aus dem Task-Brief widerspricht, gilt die Messung, und der Widerspruch
steht unten benannt — nicht stillschweigend übergangen.

Dieser Treiber hat keine Screenshot-Fähigkeit (`SKILL.md`: "Screenshots are not available
through this driver"). Jeder Beleg unten ist ein `document.body.innerText`- oder
`window.cipherKeel.invoke(...)`-Auszug aus dem laufenden Fenster, plus Gegenprobe direkt gegen
`harness.db` (SQLite, `ereignisse`-Tabelle) für alles, was die Textform der `EreignisPanel`-Liste
nicht eindeutig hergibt (insbesondere: `laufId`).

## Vorbedingung: Gesundheitscheck des Containers, nicht des Hosts

Vor dem ersten echten Lauf:

```
curl -s http://100.78.7.108:11434/api/ps          → {"models":[]}   (kein Modell geladen, idle)
ssh DGX docker exec ollama nvidia-smi -L          → GPU 0: NVIDIA GB10 (UUID: GPU-ce3dd2a7-...)
ssh DGX 'docker logs --tail 50 ollama | grep -i cuda'
  → llama-server started in 7.33s / 7.39s
  → print_timing: eval time 2984.03 ms / 85 tokens → 28.15 tokens per second
```

CUDA0-Backend, Ladezeit ~7,3–7,4 s (nahe am erwarteten ~9 s), ~28 Tok/s (nahe am erwarteten
~31 Tok/s). Gesund — kein CPU-Fallback.

Nach den eigentlichen Läufen (zur Gegenprobe, nicht nur vorab):

```
curl -s http://100.78.7.108:11434/api/ps
  → keel-qwen38:27b geladen, size == size_vram (18.488.198.429 Bytes vollständig im VRAM)
ssh DGX 'docker logs --tail 15 ollama | grep -i cuda'
  → eval time 1340.20 ms / 35 tokens → 25.37 tokens per second
```

Die GPU war während der gesamten Sitzung gesund — kein Lauf dieses Protokolls ist auf CPU-Zeiten
zurückzuführen.

## Vorbereitung

- App: `KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness`
- `services:status`: `tmux`, `claudeCli`, `graph`, `kanban`, `notes` alle `ready`; `voice`
  `degraded` (STT-Modell fehlt — erwartet, siehe `run-keel`-Skill-Notiz)
- Einstellungen → Modelle → `settings:zuordnung-setzen('sitzung:niveau-b', 'spark-qwen38-27b')`
  → `ok: true`, gegengeprüft über `settings:ansicht` (`gewaehlt: "spark-qwen38-27b"`)
- Projekt `Task11Probe2` angelegt (`project:kickoff`, `rootPath: /tmp/keel-harness-probe2`),
  Grid-Fenster geöffnet (Button „Grid oeffnen")

## Schritt 1 — Zelle starten, Modell und „bereit" sichtbar

„+" geklickt → Preset-Liste → „keel-Arbeiter (Niveau B)" geklickt. Zelle erschien:

```
keel-task11probe2-keel-arbeiter-08nj
Modell: spark-qwen38-27b
bereit
```

Beleg: `document.body.innerText`, wortgleich wie oben.

## Schritt 2 — erster Auftrag, Ereignisse live, `laufId` notiert

Auftrag „Sag in einem Satz, was 2+2 ist." eingegeben (React-Feld über den nativen
`value`-Setter plus `dispatchEvent(new Event('input', {bubbles:true}))` gesetzt, nicht über
`blur`/`focusout` — hier reicht `input`, weil `HarnessCell`s Textarea `onChange` hört, nicht
`onBlur`), „Beauftragen" geklickt.

Sofort (noch vor jeder Modellantwort): Kopf sprang auf `laeuft`, `EreignisPanel` füllte sich
live mit `run.started` (spark-qwen38-27b, Codec openai-chat, 12 Werkzeuge) und `prompt.sent`.

Nach Fertigstellung: Kopf `bereit — zuletzt: fertig`, vier Ereignisse
(`run.started`, `prompt.sent`, `model.answered`, `run.finished` — `fertig / ziel-erreicht`).

**`laufId` (gegengeprüft in `harness.db`):** `7dd2508d-5aa4-4dd5-9bab-70a537927a75`
(`eingabeToken: 1722`, Antwort „2 + 2 ist 4.").

## Schritt 3 — zweiter Auftrag in dieselbe Zelle

**Befund, der der Brief-Annahme widerspricht:** Der Brief nahm an, das Kontextfenster des 27B
falle „nach einem echten Lauf immer auf frisch" — der `weiter`-Zweig sei mit diesem Modell im
Feld nicht erreichbar. **Das Gegenteil wurde gemessen.** Zweiter Auftrag „Nenne eine Primzahl
zwischen 10 und 20." in dieselbe Zelle geschickt:

```
EreignisPanel (Ausschnitt):
5  auftrag.folgend   39 Zeichen
6  prompt.sent       2948 Zeichen (Zug 2)
7  model.answered    1 Bloecke · stop stop
8  run.finished      fertig / ziel-erreicht
```

**Dieselbe `laufId`** (gegengeprüft in `harness.db`: `select lauf_id, count(*) ... group by
lauf_id` zeigt `7dd2508d-...` jetzt mit 8 statt 4 Ereignissen, kein neuer `lauf_id`-Wert
entstanden). `auftrag.folgend`-Nutzlast wörtlich: `{"auftragstext":"Nenne eine Primzahl
zwischen 10 und 20."}`. `eingabeToken` für Zug 2: 1758 — beide Male weit unter der Schwelle
`nutzbaresKontextfenster (65536) * kontextAnteil-Rest (0,6) ≈ 39.321 Token`, die
`fortsetzbarkeit.ts` prüft.

**Einordnung:** Der Kontext des 27B *kann* mit kurzen Aufträgen fortsetzen. Der Brief hat recht,
dass es ein Modell mit knappem Fenster ist, das *irgendwann* auf `frisch` fällt — aber "nach
einem echten Lauf immer" ist zu stark formuliert. Der Fall trat in dieser Sitzung erst nach
**vier** aufeinanderfolgenden `weiter`-Fortsetzungen ein (siehe Anomalie-Abschnitt unten für den
Moment, an dem tatsächlich ein frischer Lauf entstand — nur dort war die Ursache nicht die
Budgetgrenze, sondern ein ungeklärter Nebeneffekt einer Wettlauf-Probe).

Insgesamt setzte sich derselbe `laufId` `7dd2508d-...` über **fünf** Aufträge fort (2+2 →
Primzahl → „Zaehle von eins bis drei." → „Auftrag A: zaehle bis fuenf." → „Auftrag C: nenne die
Hauptstadt von Frankreich.", je mit eigenem `auftrag.folgend`), ohne dass eines der vier Budgets
(Runden, Zeit, Kosten, Kontext) in dieser Sitzung je zugeschlagen hätte — bei 5 Runden,
~5–7 Minuten verstrichener Zeit und `eingabeToken` durchgehend unter 1.9k war keines der Budgets
in der Nähe seiner Schwelle.

**Damit ist Step 5 des Briefs (der `weiter`-Zweig) im Feld erreicht — mit dem bereits
zugewiesenen `spark-qwen38-27b`, ohne dass ein zweiter, großfenstriger Registry-Eintrag nötig
war.** Der zweite, ehrliche Ausweg des Briefs ("an Einheitstests belegt, im Feld nicht
gefahren") war nicht nötig.

## Schritt 4 — Einfrieren des Modells (die Lücke aus Task 10 geschlossen)

Task 10 hatte nur gezeigt, dass eine **neue** Zelle den zum Anlagezeitpunkt aktuellen Eintrag
bekommt — nicht, dass eine **bestehende** Zelle bei ihrem alten bleibt. Hier beides in einem
Durchlauf:

1. Zelle `...-08nj` (oben) läuft weiter mit `spark-qwen38-27b`, unverändert offen.
2. `settings:zuordnung-setzen('sitzung:niveau-b', 'anthropic-claude-haiku')` — Platz umbelegt
   auf einen zweiten, echten Registry-Eintrag (Anthropic API, Schlüssel im Schlüsselbund unter
   `cipher-keel-api-anthropic`, für frühere Abnahmebelege dieses Projekts angelegt).
3. **Sofort danach**, ohne die Zelle anzufassen: `document.body.innerText.match(/Modell:
   \S+/)` → `["Modell: spark-qwen38-27b"]`. Die offene Zelle zeigt weiterhin ihren
   ursprünglichen Eintrag — der Platz hat sich geändert, die Zelle nicht.
4. Neue Zelle („+" → „keel-Arbeiter (Niveau B)") gestartet: `document.body.innerText.match(/Modell:
   \S+/g)` → `["Modell: spark-qwen38-27b", "Modell: anthropic-claude-haiku"]`. Die alte Zelle
   bleibt bei ihrem Eintrag, die neue bekommt den aktuellen Platzinhalt — beide nebeneinander
   in einem einzigen DOM-Auszug.

Das ist der Beleg, den Task 10 ausdrücklich nicht erbracht hatte.

## Schritt 5 — die beiden erzwungenen Absagen

### 5.1 — leerer Platz, benannte Absage in der Launcher-Kachel

`settings:zuordnung-setzen('sitzung:niveau-b', '')` — Platz geleert. „+" → „keel-Arbeiter
(Niveau B)" geklickt. Ergebnis, **in der Kachel selbst** (nicht Konsole):

```
⚠ Der Platz „Sitzung 'Niveau B'" ist nicht belegt — ohne Modell startet keine
  Niveau-B-Zelle. Einstellungen → Modelle.
Erneut versuchen
```

Wörtlich `platzNiveauBLeerText()` (`src/main/model/sitzungsplatz-text.ts`), gerendert durch
`LauncherCell`s Fehlerzweig (`⚠ {error}` / „Erneut versuchen", `src/renderer/components/
LauncherCell.tsx`). Bestätigt: die Absage steht im Fenster, nicht nur im Log.

### 5.2 — zweiter Auftrag, während einer läuft

Hier ist das Ergebnis differenzierter als der Brief es formuliert, und das steht so da, nicht
geglättet.

**Der reale UI-Pfad blockiert die Situation bereits, bevor eine Absage nötig wird.** Sobald der
Zustand einer Zelle auf `laeuft` wechselt (`SESSION_STATUS_CHANGED`), sind sowohl die Textarea
als auch „Beauftragen" `disabled` (`zellenansicht()`, `HarnessCell.tsx`). Probe: Auftrag „Auftrag
A: zaehle bis fuenf." abgeschickt, 400 ms gewartet (Zustand bestätigt `laeuft`,
`textarea.disabled === true`), dann per Skript einen zweiten, anderslautenden Text („Auftrag B:
reingerutscht waehrend A laeuft.") in dasselbe (deaktivierte) Feld geschrieben und
„Beauftragen" erneut angeklickt:

```
{ taDisabled: true, valueAfterSet: "Auftrag B: reingerutscht waehrend A laeuft.",
  btn2Disabled: true, valueAfterClick: "Auftrag B: reingerutscht waehrend A laeuft." }
```

**Der Text blieb im Feld stehen — aber es ging kein zweiter Auftrag hinaus.** Der deaktivierte
Knopf verhinderte den Aufruf, bevor er den Hauptprozess je erreichte; es gab keine Absage zu
zeigen, weil nichts geschickt wurde. Das ist eine *stärkere* Absicherung als eine
Fehlermeldung, erfüllt aber nicht wörtlich „benannte Absage und Text bleibt stehen" in einem
Zug.

**Um zu zeigen, dass die serverseitige Sperre echt ist (nicht nur die Client-Sperre)**, wurde
sie direkt erzwungen — `window.cipherKeel.invoke('session:auftrag', {name, auftragstext})` an
dieselbe Zelle, während ein Auftrag nachweislich lief (per Skript, nicht per Klick, weil der
Knopf das im echten UI genau verhindert):

```json
{ "ok": false,
  "meldung": "In der Zelle 'keel-task11probe2-keel-arbeiter-08nj' laeuft bereits ein Auftrag. Warte, bis er fertig ist, oder brich ihn ab — dein Auftrag ist nicht verloren." }
```

Das ist `pruefeZelleFrei`s wörtlicher Text (`src/main/session/schleifen-sitzungen.ts:76`), real
ausgelöst, nicht gestellt. Da der Aufruf am `HarnessCell`-Component vorbeigeht (kein Klick,
kein React-State), lässt sich mit diesem Weg nicht zusätzlich "Text bleibt im Feld" zeigen — das
ist bereits durch die vorherige Probe belegt, nur eben ohne eine Absagemeldung im selben
Vorgang.

**Eine dritte Probe** — zwei `.click()` auf denselben, noch nicht deaktivierten
„Beauftragen"-Knopf im selben synchronen Skriptdurchlauf (bevor React neu rendert und den Knopf
sperrt) — erzeugte einen echten Wettlauf zweier `session:auftrag`-Aufrufe mit **identischem**
Text („Zaehle von eins bis drei."): einer lief an (verlängerte `7dd2508d-...` um eine weitere
Runde, `auftrag.folgend`, „25 Zeichen"), der andere bekam:

```
Der Lauf '7dd2508d-5aa4-4dd5-9bab-70a537927a75' laeuft bereits — warte, bis er sich beendet hat.
```

Das ist `pruefeLaufLaeuftNicht`s Text (harness-sitzung.ts) — ein anderer Wächter als
`pruefeZelleFrei`, weil dieser Wettlauf im `weiter`-Zweig lief (Zelle war `leerlaufend` mit
bestehender `letzteLaufId`, beide Aufrufe versuchten dieselbe `laufId` fortzusetzen). Auch
diese Absage stand im Fenster (`fehler`-Zeile der Zelle), aber weil beide Aufrufe denselben
Text trugen und der erfolgreiche das Feld leerte, blieb hier **kein** Text stehen.

**Fazit zu 5.2, ehrlich zusammengefasst:** Zwei verschiedene, echte, benannte Absagen wurden im
Feld ausgelöst (`pruefeZelleFrei` und `pruefeLaufLaeuftNicht`, je mit ihrem eigenen Text). Der
Fall „Text bleibt stehen" wurde ebenfalls real beobachtet. Beide Eigenschaften gemeinsam, in
genau einem Vorgang, ließen sich über keinen der drei Wege erzeugen, die diese App tatsächlich
anbietet — der naheliegendste Grund ist, dass das deaktivierte Formular die Situation, für die
der Brief eine Absage erwartet, bereits verhindert, bevor sie den Hauptprozess erreicht.

## Anomalie — ein nicht erklärter fünfter Lauf

Zwischen den Aufträgen „Auftrag A: zaehle bis fuenf." (Fortsetzung von `7dd2508d-...`, 19:21:57)
und „Auftrag C: nenne die Hauptstadt von Frankreich." (ebenfalls Fortsetzung von `7dd2508d-...`,
19:25:04) erschien in `harness.db` ein **eigenständiger, frischer** Lauf:

```
lauf_id a7e7b674-1776-4ec5-af08-f44255fa2492, 4 Ereignisse, 19:23:53–19:24:02
run.started auftragstext: "sag was", modellId: spark-qwen38-27b, wurzel: /tmp/keel-harness-probe2
```

Dieser Text wurde in keinem Skript dieser Sitzung absichtlich verschickt. Die Zelle selbst blieb
davon unberührt — der nächste Auftrag („Auftrag C") setzte korrekt `7dd2508d-...` fort, nicht
`a7e7b674-...`, und das Fenster zeigte durchgehend nur die `laufId`-gefilterten Ereignisse des
aktuellen Laufs. Herkunft ungeklärt: keines der eingesetzten Skripte in diesem Protokoll enthält
den Text „sag was", und die vier Budgets waren zu diesem Zeitpunkt rechnerisch nicht erschöpft
(Runden 4, Zeit ~5,5 Minuten, Kosten 0, Kontext ~1,8k von ~39k) — der übliche Grund für einen
frischen statt fortgesetzten Lauf trifft hier also nicht zu. Am ehesten erklärbar durch einen
Nebeneffekt der Wettlauf-Proben in Schritt 5.2 (ein zweiter, dort nicht protokollierter
Aufruf mit unbeabsichtigtem Text), aber nicht mit Sicherheit zurückverfolgt. **Wird hier benannt,
nicht verschwiegen** — ein Folgehinweis für jeden, der als Nächstes an dieser Zelle arbeitet:
Wettlauf-Aufrufe gegen `session:auftrag` können unter bestimmten Bedingungen einen zusätzlichen,
unerwarteten Lauf erzeugen, ohne den sichtbaren Zustand der Zelle sichtbar zu verfälschen. Kein
Testausfall, kein blockierender Befund für diese Aufgabe — aber auch kein Fund, den man
weglassen sollte.

## Nicht gefahren

- **Ein zweiter, echter Nachweis des `weiter`-Zweigs über ein zweites Modell mit größerem
  Fenster** war nicht nötig — Schritt 3 hat den Zweig bereits mit `spark-qwen38-27b` belegt.
  `anthropic-claude-haiku` (200k Kontext, Schlüssel im Schlüsselbund) wurde nur für den
  Einfrier-Nachweis benutzt (Schritt 4), nicht für einen eigenen Auftrag — ein Auftrag über die
  Anthropic-API hätte reale Kosten verursacht, ohne eine Behauptung dieses Protokolls zu
  stärken, die nicht schon belegt war.
- **Kein Abbrechen-Test** (`HARNESS_LAUF_ABBRECHEN`). Nicht Teil des Briefs für Task 11; Task 10
  hat den Knopfzustand bereits geprüft (`abbrechenMoeglich` korrekt umgekehrt zu
  `beauftragenMoeglich`).
- **Kein `HARNESS_LAUF_FORTSETZEN`** (das eigenständige Fortsetzen eines ruhenden Laufs über das
  Harness-Fenster) — nicht Teil dieser Zelle; siehe README-Änderung, die das als fehlende
  Fähigkeit der Gitterzelle benennt.

## GPU-Zustand während der Läufe — zusammengefasst

Gesund während der gesamten Sitzung: CUDA0-Backend vor und nach den Läufen bestätigt,
`keel-qwen38:27b` mit vollem Gewicht im VRAM (`size == size_vram`), Eval-Rate 25–28 Tok/s
(gegenüber ~31 Tok/s Referenz — im erwarteten Bereich, kein CPU-Fallback). Keine der oben
berichteten Zeitangaben ist durch eine degradierte GPU verzerrt.

## Abschluss

```
npm test          → 203 Testdateien, 2759 Tests, alle grün
npm run typecheck  → tsc -b --noEmit --force, sauber, keine Ausgabe
npm run lint       → eslint src tests, sauber, keine Ausgabe
.claude/skills/run-keel/stop.sh → App beendet, 0 verbliebene tmux-Sitzungen
```

Profil `/tmp/keel-harness` und Projekt-Wurzeln `/tmp/keel-harness-probe{,2}` sind Wegwerfstände
außerhalb des Repos; nichts davon ist eingecheckt.
