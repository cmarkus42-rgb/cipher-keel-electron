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

`nvidia-smi -L` im Container sieht die GPU, Ladezeit ~7,3–7,4 s (nahe am erwarteten ~9 s),
~28 Tok/s (nahe am erwarteten ~31 Tok/s) — beides Werte, die eine CPU-only-Auslieferung nicht
liefert. **Korrektur:** kein Log-Ausschnitt dieser Sitzung enthält die Zeichenkette „CUDA0"
wörtlich; die Aussage „CUDA0-Backend" stand in einer früheren Fassung dieses Protokolls, ohne
dass sie zitiert war. Belegt sind Ladezeit, Tok/s und (nach den Läufen) `size == size_vram` —
nicht mehr.

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
`nutzbaresKontextfenster (65536) * kontextAnteil-Rest (0,6) ≈ 39.322 Token`, die
`fortsetzbarkeit.ts` prüft.

**Einordnung:** Der Kontext des 27B *kann* mit kurzen Aufträgen fortsetzen. Der Brief hat recht,
dass es ein Modell mit knappem Fenster ist, das *irgendwann* auf `frisch` fallen kann — aber
"nach einem echten Lauf immer" ist zu stark formuliert. **Korrektur (M-3):** in dieser Sitzung
ist `weiterOderFrisch` für diese Zelle **kein einziges Mal** auf `frisch` gefallen — der einzige
zweite `run.started`, der in `harness.db` auftaucht (`a7e7b674-...`), stammt nicht von dieser
Zelle oder ihrem Budget, sondern von einer parallel bedienten zweiten Zelle eines Menschen (siehe
Anomalie-Abschnitt unten). Eine frühere Fassung dieses Protokolls hatte hier fälschlich
behauptet, „der Fall" (gemeint war jener zweite Lauf) sei „nach vier aufeinanderfolgenden
`weiter`-Fortsetzungen" als Rückfall auf `frisch` eingetreten — das war falsch in zwei Punkten
zugleich: es gab in dieser Zelle keinen Rückfall, und selbst wenn es einen gegeben hätte, wäre
der andere Lauf nicht dessen Beleg gewesen.

Insgesamt trug derselbe `laufId` `7dd2508d-...` **fünf** Aufträge (2+2 → Primzahl → „Zaehle von
eins bis drei." → „Auftrag A: zaehle bis fuenf." → „Auftrag C: nenne die Hauptstadt von
Frankreich.") — der erste hat den Lauf eröffnet, die **vier** übrigen kamen als echter
`auftrag.folgend` hinzu (nicht fünf, wie eine frühere Fassung dieses Protokolls, das README und
die erste Fassung von Christians eigener Spec-Korrektur an dieser Stelle zählten — alle drei
korrigiert).

**Korrektur (M-2):** „keines der Budgets in der Nähe seiner Schwelle" stand hier vorher, und das
ist falsch — zwei der vier Budgets waren bereits gut zur Hälfte verbraucht. Beim fünften Auftrag
(letzter `model.answered`, `run.finished` um 19:25:07.890Z, `run.started` um 19:18:19.052Z):

| Budget | Verbraucht | Knappe Schwelle (·0,75) | Anteil |
|---|---|---|---|
| Runden | 5 (`model.answered`-Ereignisse) | 9 (12·0,75) | **56 %** |
| Wanduhrzeit | 408,8 s | 675 s (900·0,75) | **61 %** |
| Kontext | 1.865 Token (letztes `eingabeToken`) | 39.322 (65536·0,8·0,75) | 4,7 % |
| Kosten | 0 Cent (lokales Modell) | 150 (200·0,75) | 0 % |

Weit weg war nur der Kontext. Ein sechster oder siebter Auftrag im selben Tempo wäre plausibel an
der **Wanduhrzeit** gekippt (nicht am Kontextfenster, das der Brief als Ursache unterstellte) —
die Pausen zwischen den Aufträgen in dieser Sitzung kamen vom manuellen Testen, nicht vom Modell,
und trugen einen guten Teil der 408,8 s bei.

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

## Der zweite `laufId` in der Datenbank — `a7e7b674-...`, geklärt, kein Befund über den Code

Zwischen den Aufträgen „Auftrag A: zaehle bis fuenf." (Fortsetzung von `7dd2508d-...`, 19:21:57)
und „Auftrag C: nenne die Hauptstadt von Frankreich." (ebenfalls Fortsetzung von `7dd2508d-...`,
19:25:04) erschien in `harness.db` ein zweiter, eigenständiger Lauf:

```
lauf_id a7e7b674-1776-4ec5-af08-f44255fa2492, 4 Ereignisse, 19:23:53–19:24:02
run.started auftragstext: "sag was", modellId: spark-qwen38-27b, wurzel: /tmp/keel-harness-probe2
```

**Ursache, geklärt:** Christian hat während dieser Messsitzung selbst dieselbe App bedient — an
einer Stelle für Niveau B nichts hinterlegt, in den Einstellungen einen Eintrag gesetzt, dann
einmal eine eigene Zelle gestartet und einen Satz hineingeschickt. Das *ist* dieser Lauf. Ein
Mensch, der parallel dieselbe laufende App bedient, während dieses Protokoll misst — nicht ein
Skript dieser Sitzung, kein Wettlauf, keine Code-Lücke. Der Text selbst ist im Rückblick der
beste Beleg dafür: „sag was" ist, was ein Mensch als Probesatz tippt, nicht was eines der Skripte
in diesem Protokoll erzeugt hätte (keines enthält diesen Text).

Damit ist diese Beobachtung **vollständig erklärt und kein Befund über den Code**. Sie hatte in
dieser Aufgabe zwei aufeinanderfolgende, beide plausible und beide falsche Erklärungsversuche:

1. **Meine erste These:** ein Nebeneffekt der Wettlauf-Proben aus Schritt 5.2. Widerlegt — beide
   dortigen Wettlaufaufrufe trugen identischen Text und liefen über den `weiter`-Zweig, den
   `pruefeLaufLaeuftNicht` abdeckt (er hat dort nachweislich gefeuert, siehe 5.2).
2. **Die zweite These** (unten als eigener Befund festgehalten, weil sie unabhängig vom Code her
   plausibel bleibt): eine TOCTOU-Lücke in `pruefeZelleFrei`. Ebenfalls nicht die Ursache dieser
   Beobachtung — sie erklärt, wie ein Doppelklick auf den allerersten Auftrag *einer Zelle ohne
   Vorlauf* einen Waisenlauf erzeugen könnte, trifft aber auf keine der hier tatsächlich
   gefahrenen Proben zu (der Doppelklick in 5.2 traf eine Zelle mit bereits bestehender
   `letzteLaufId`, also den geschützten `weiter`-Zweig).
3. **Die tatsächliche Ursache:** ein Mensch, nicht ein Mechanismus.

Solange keine der beiden Thesen bestätigt war, war „Herkunft ungeklärt, ohne Favoriten" die
richtige Zeile im Protokoll — das ist die eigentlich nützliche Lehre aus diesem Abschnitt, mehr
als die Klärung selbst.

## Offener Befund aus dem Lesen des Codes — ausdrücklich ohne Feldbeleg

Unabhängig von der jetzt geklärten Beobachtung oben bleibt ein Befund stehen, den der Reviewer
allein durch Lesen des Codes gefunden hat, **nicht** durch etwas, das in dieser Sitzung
tatsächlich beobachtet wurde:

- `pruefeZelleFrei` (`src/main/session/schleifen-sitzungen.ts:76`, aufgerufen in
  `src/main/ipc-handlers.ts:431`) liest den Zellenzustand **vor** mehreren `await`s im
  `SESSION_AUFTRAG`-Handler. Der Zellenzustand kippt erst über `beiStart`
  (`ipc-handlers.ts:467`) auf `laeuft`.
- Für den **`weiter`-Zweig** ist das abgesichert: `beauftrageSchleife`
  (`src/main/harness-sitzung.ts`) prüft dort zusätzlich `pruefeLaufLaeuftNicht(laufId,
  laufendeLaeufe)` (Zeile ~504) und trägt die `laufId` **vor** dem eigenen Await-Fenster in
  `laufendeLaeufe` ein (Zeile ~516) — genau das hat in Schritt 5.2 den Wettlauf mit identischem
  Text korrekt aufgefangen.
- Für den **`frisch`-Zweig** (der untere, unbedingte Pfad in `beauftrageSchleife`, ~Zeile
  561–566: `randomUUID()`, `opts.beiStart?.(laufId)`, `await starteHarnessLauf(...)`) gibt es
  **keinen** zweiten Wächter dieser Art. Zwei nahezu gleichzeitige `session:auftrag`-Aufrufe, die
  beide `pruefeZelleFrei` passieren, bevor der jeweils andere `beiStart` aufgerufen hat, und die
  beide in den `frisch`-Zweig fallen (typischerweise: der allererste Auftrag einer Zelle ohne
  `letzteLaufId`), würden beide eine eigene `laufId` erzeugen; der zweite `beiStart`-Aufruf
  überschreibt den Zellen-Eintrag der Registry, und der erste Lauf liefe unsichtbar für die
  Zelle in `harness.db` weiter — ein Waisenlauf, den kein `SESSION_STATUS_CHANGED` und kein
  `EreignisPanel` je zeigt, weil beide auf die zuletzt eingetragene `laufId` gefiltert sind.

**Das ist eine Codetatsache, keine Feldbeobachtung.** Sie wurde ursprünglich mit dem
`a7e7b674-...`-Lauf oben begründet — diese Begründung entfällt, seit dessen tatsächliche Ursache
(ein Mensch, siehe oben) feststeht. Kein Ablauf in dieser Sitzung hat diese Lücke tatsächlich
ausgelöst oder auch nur versucht auszulösen. Sie steht hier als Fundstelle für den
Abschluss-Review über den ganzen Zweig — der Code selbst wurde dafür nicht geändert, das ist eine
Entscheidung für diesen Review, nicht für dieses Protokoll.

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

Gesund während der gesamten Sitzung, belegt durch das, was tatsächlich gemessen wurde — nicht
durch eine unbelegte „CUDA0"-Behauptung (siehe Korrektur oben): `nvidia-smi -L` im Container
sah die GPU vor den Läufen, `keel-qwen38:27b` lag nach den Läufen mit vollem Gewicht im VRAM
(`size == size_vram`, 18.488.198.429 Bytes), Ladezeit ~7,3–7,4 s und Eval-Rate 25–28 Tok/s lagen
beide nahe an der Referenz (~9 s / ~31 Tok/s). Keine dieser Zahlen ist mit einem CPU-Fallback
vereinbar (dessen Referenzwert im Brief 53 s für einen Zug wäre). Keine der oben berichteten
Zeitangaben ist durch eine degradierte GPU verzerrt.

## Abschluss

```
npm test          → 203 Testdateien, 2759 Tests, alle grün
npm run typecheck  → tsc -b --noEmit --force, sauber, keine Ausgabe
npm run lint       → eslint src tests, sauber, keine Ausgabe
.claude/skills/run-keel/stop.sh → App beendet, 0 verbliebene tmux-Sitzungen
```

Profil `/tmp/keel-harness` und Projekt-Wurzeln `/tmp/keel-harness-probe{,2}` sind Wegwerfstände
außerhalb des Repos; nichts davon ist eingecheckt.
