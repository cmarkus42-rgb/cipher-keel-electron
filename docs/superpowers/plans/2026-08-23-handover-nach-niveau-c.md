# Übergabe nach der Niveau-C-Strecke — wo keel steht und was als Nächstes zählt

**Stand:** 2026-08-23 · **`main` bei `2f877ed`**, mit `origin/main` synchron, 2678 Tests,
typecheck, lint und CI grün, Arbeitsbaum sauber. Kein offener Zweig.

Diese Datei ist der Einstieg. Sie sagt zuerst, wo das Vorhaben im Ganzen steht — das ist die
Frage, an der man sich sonst verläuft —, und danach, was ansteht und in welcher Reihenfolge.

---

## 1. Das Gesamtbild in einem Absatz

keel existiert für ein **Leistungsgefälle**: starke Modelle oben (Ideation, Requirements,
Systems Engineer), billige oder lokale unten als Worker, und beides **unter Aufsicht statt unter
Vertrauen**. Die Niveaus A/B/C sind der Mechanismus dieses Gefälles, keine Sparvariante.

Bis zum 2026-08-17 sollte **NanoClaw** die billige Ebene tragen; das Subsystem ist entfernt und
durch **keels eigenen Harness** ersetzt — die eigene Agentenschleife um ein Modell. Damit ist
seit gestern und heute Folgendes wahr:

**Die billige Ebene existiert und ist vermessen.** Ein lokales 27B auf dem hauseigenen Spark
läuft durch keels Schleife, ruft Werkzeuge, hält Budgets ein, recherchiert im Netz und liest
seine Fähigkeiten nach, bevor es sie benutzt. Das ist nicht angenommen, sondern an fünf
Messrunden belegt.

**Und sie ist noch keine Arbeitskraft.** Die Schleife ist über IPC fahrbar, aber
`RUNTIMES_WITHOUT_ADAPTER` enthält weiterhin `keel-harness`: kein Preset startet eine
Niveau-B-Sitzung im Grid, mit eigener Zelle, Lebenszyklus und Ausgabeereignissen. **Genau ein
Schritt trennt „Motor läuft" von „Gefälle funktioniert",** und das ist der nächste substanzielle
Bau.

Wer die Reihenfolge sucht: alles, was auf das Gefälle einzahlt, geht vor allem, was nur die
Multi-Harness-Aussage belegt. Codex- und Gemini-Adapter sind wieder Abo-CLIs mit starken
Modellen und zahlen deshalb **nicht** darauf ein.

---

## 2. Was diese Strecke gebracht hat, in Zahlen

Alles gemessen, durch die laufende App, nicht gegen eingespeiste Antworten. Protokolle in
`docs/superpowers/plans/`.

| | am Anfang | heute |
|---|---|---|
| Rechercheur: gelesene Seiten | 3 von 33 | **21 von 32** |
| Recherchen ohne eine einzige Quelle | 7 von 10 | **0 von 10** |
| `gruendlich` erreicht sein Ziel | 0 von 5 | **5 von 5** |
| `faehigkeit_lesen` vor Benutzung gerufen | ungemessen | **40 von 40** |

Der letzte Wert ist der wichtigste: **keels Niveau B ruht schon heute auf der Annahme**, dass ein
Modell dem Satz „lies die Fähigkeit, bevor du sie benutzt" folgt. Für dieses Modell trägt sie —
auch in den zwanzig Läufen, deren Auftrag *nicht* auf eine Hausregel hindeutete.

**Und drei Dinge, die diese Strecke über das Arbeiten gelernt hat und die weitergelten:**

1. **Zwei Messrunden sind verworfen worden**, weil sie die Maschine gemessen haben statt den
   Code — einmal ein Netzfilter, der Erstkontakte hielt, einmal ein Container ohne GPU-Zugriff.
   Beide Male sah die Zahl plausibel aus. Vor jeder Zeitmessung gehört deshalb ein
   Gesundheitscheck, und er gilt dem **Container**, nicht dem Host (siehe 5).
2. **Ein 27B verrechnet sich beim Zusammensetzen, nicht beim Befolgen.** JSON-Typen heilt das
   Schema im Körper vollständig; Buchstaben-Arithmetik heilt nichts (`WKR` statt `WRK`, mit
   korrekter Herleitung daneben). Wer eine Fähigkeit schreibt, **gibt eine Form vor und lässt
   nicht rechnen**.
3. **Eine Zahl, die für einen Verbraucher richtig war, gilt für den zweiten nicht.** Dreimal
   dieselbe Sorte Fehler in dieser Strecke: `aufgeschobenesLaden`, `klemmeMaxZeichen` und zuletzt
   `WORKER_TIMEOUT_MS`, das keels Schleife vom Ein-Schuss-Worker geerbt hatte und bei exakt
   120,0 s zuschlug.

---

## 3. Was ansteht, in der Reihenfolge, in der es zählt

### 3.1 Der `keel-harness`-Adapter — der eine Schritt, der das Gefälle schließt

Alles andere in dieser Liste ist Feinschliff daneben. Was fehlt, ist benannt und liegt beieinander:

- `RUNTIMES_WITHOUT_ADAPTER` in `src/main/agent/registry.ts` enthält `keel-harness`; die Zeile
  daneben erklärt auch, warum das bis heute richtig war — *ein Slot vor seinem Adapter wäre eine
  Fläche für einen Platzhalter*.
- Kein Slot in `model/slots.ts` bietet die Laufzeit an.
- Eine Sitzung braucht Gitterzelle, Lebenszyklus und Ausgabeereignisse — heute hat das nur der
  `claude-code`-Adapter über tmux.
- Kein Preset erklärt ein `provider:model`, eine Niveau-B-Sitzung startete also ohne Modellwahl.

Der Motor darunter ist fertig und gemessen. Dies ist Anschlussarbeit, keine Forschung.

### 3.2 Zwei Proben, die von selbst fällig werden — beide ohne `sudo`

**Die GPU-Reload-Probe ist die einzige offene Frage aus der letzten Strecke.** Der Ollama-Container
auf dem Spark hat seine cgroup-Geräterechte verloren, weil `systemctl daemon-reload` die Freigabe
des nvidia-container-toolkit verwirft. Behoben ist es an der Ursache: der Container ist mit
ausdrücklichen `--device`-Flags neu angelegt, damit `DeviceAllow=` als Eigenschaft der
systemd-Unit steht — und die wendet ein Reload **wieder an**, statt sie zu verwerfen. Der
Mechanismus ist nachgemessen; **was fehlt, ist der Ernstfall.**

```bash
ssh DGX 'START=$(docker inspect ollama --format "{{.State.StartedAt}}");
  echo "Reloads seit Umbau: $(journalctl --since "$(date -d "$START" "+%F %T")" | grep -ci "Reloading requested")";
  docker exec ollama nvidia-smi -L'
```

Zahl > 0 **und** GPU wird gezeigt → belegt. GPU fehlt → die Erklärung trägt nicht.

**Es dauert.** Reloads kommen nach dem Journal **alle drei bis vier Tage** (seit dem 7. Juli
32 Stück auf 13 von 47 Tagen), nicht alle dreieinhalb Stunden — die alte Zahl kam von einem weiten
`grep reloading`, das **Logzeilen** zählt statt Ereignissen; ein Reload schreibt drei. Erzwingen
geht nicht: `systemctl daemon-reload` antwortet `Interactive authentication required`, `sudo`
verlangt ein Passwort.

**Die zweite Probe:** bleibt die Little-Snitch-Regel nach einem `npm ci` gültig? Sie hängt an
`node_modules/electron/dist/Electron.app`. Seit dem Setzen (2026-08-22) lief keines, die Frage ist
also nicht beantwortet, sondern nur noch nicht gestellt.

### 3.3 Die Denkstufe des Rechercheur-Unterlaufs

Jetzt die nächste sinnvolle Stellschraube, und zwar **weil** das Rundenbudget nicht mehr bindet:
`gruendlich` nutzte höchstens 6 von 8 Runden und 210 s von 300 s. Vorher lag die Frage dahinter
verborgen, und der Entwurf-Nachtrag legte sie deshalb als „offen, aber nicht bindend" ab. `medium`
gegen `low` an denselben zehn Fragen — das Messwerkzeug steht (siehe 4).

### 3.4 Readability an JS-gerenderten Seiten

Die verbliebene Hälfte des Inhaltsverlusts: 4 von 32 Abrufen scheitern an der Extraktion, darunter
GitHub-Issues. **Die andere Hälfte ist entschieden und bleibt liegen** — 403er von Reddit und
Stack Exchange werden nicht umgangen: *„wir sollten es den plattformen schon bestimmen lassen wie
sie ihre daten freigeben"* (Nutzer, 2026-08-23). Aus demselben Grund bleibt **Brave** draußen,
solange dessen Speicherklausel §3(b)(i) ungelesen ist.

### 3.5 Kleinkram mit Datum

- **`spark-qwen38-27b` trägt `quelle: 'vermutet'`** und behält das, bis es einen Kanarienauftrag
  gibt. Auch die von Hand gemessenen Zahlen machen es nicht zu `'gemessen'` — das ist dessen Wort.
- **`SCHLEIFE_TIMEOUT_MS` ist nicht im Feld provoziert.** Der Wächter fährt das echte `sende` und
  wurde beim Entfernen rot gesehen; ein Feldbeweis bräuchte einen Zug zwischen 120 und 300 s, und
  den liefert die Verteilung selten (p99 = 99,1 s).
- **CI meldet die Node-20-Abkündigung** für `actions/checkout@v4` und `actions/setup-node@v4`.
  Warnung, kein Fehler — läuft aber irgendwann ab.
- **Unsigniert und nicht notarisiert**, **Leerlauf-RAM und Kaltstart unvermessen**, **Codex- und
  Gemini-Adapter**, **Niveau C** — unverändert aus der README.

---

## 4. Das Messwerkzeug — es lebt, und das spart einen halben Tag

Im Job-Verzeichnis der letzten Sitzung (`$CLAUDE_JOB_DIR/tmp/m12/`), samt den Rohprotokollen
**aller** Runden. Die vorletzte Übergabe erklärte es für verloren; das war falsch und hat die
Wiederholung mit *denselben* zehn Fragen beinahe gekostet.

| Datei | was sie tut |
|---|---|
| `fahre.mjs` | startet je Frage einen Hauptlauf mit dem Auftrag, `recherchieren` zu rufen, pollt auf `run.finished`, legt Haupt- und Unterlauf als JSON ab |
| `fahre-m7.mjs` | dasselbe für Fähigkeiten; zählt getrennt, ob **gelesen** und ob **angewandt** wurde |
| `werte.py` | Netz und Inhalt je Abruf, Erst- gegen Folgekontakt |
| `tiefen.py` | **nach Tiefe**, mit Budget-Tabelle doppelt (`TIEFEN` und `TIEFEN_ALT`), damit eine ältere Runde nicht gegen eine Zusage gelesen wird, die es damals nicht gab |
| `m6.py` | zwei Anbieter nebeneinander, nach Ausgang je Abruf |

`laeufe8` = Runde 3, `laeufe10` = Runde 5, `laeufe11` = SearXNG, `laeufe12` = Tavily. `verworfen/`
enthält, was nicht hineingerechnet wurde, und warum.

**Zwei Fallen des Werkzeugs, beide bezahlt:**

- Der CDP-Treiber von `run-keel` **kappt eine Antwort bei rund 65 KB.** Bei langen Läufen nicht das
  ganze Protokoll zurückgeben, sondern im Fenster zählen.
- Fähigkeiten unter der Messwurzel landen über `rechercheur.ts:625` **auch im Präfix jedes
  Unterlaufs** und verändern damit jede Recherche-Messung. M7 hat deshalb eine eigene Wurzel
  (`/tmp/keel-m7`). Das ist in der letzten Sitzung genau einmal passiert und kostete eine
  Laufwiederholung.

---

## 5. Handgriffe

```bash
# Vor JEDER Zeitmessung — und der Pruefbefehl gilt dem Container, nicht dem Host:
curl -s http://100.78.7.108:11434/api/ps
ssh DGX docker exec ollama nvidia-smi -L
ssh DGX 'docker logs --tail 50 ollama | grep -i cuda'
#   Gesund: CUDA0-Backend, ~9 s Laden, ~31 Token/s. Auf der CPU: 53 s fuer einen Zug.

# SearXNG (Docker auf dem Spark, --restart unless-stopped):
curl -s "http://100.78.7.108:8888/search?q=test&format=json" | head -c 200
#   Konfiguration: /home/crimak/searxng/settings.yml
#   search.formats muss json enthalten, sonst HTTP 403. server.limiter: false.

# App treiben (Skill run-keel) — Profil behalten, sonst ist die Netz-Konfig weg:
KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness
node .claude/skills/run-keel/driver.mjs project-window "…"
.claude/skills/run-keel/stop.sh          # immer

# Ein React-Feld im Settings-Fenster schreiben: onBlur haengt an `focusout`,
# nicht an `blur` — ein dispatchEvent('blur') setzt den Wert, schreibt aber nichts.
```

---

## 6. Wie hier gearbeitet wird

- **Falsifikation statt Bestätigung.** Wer eine Wache baut, erzwingt die Verletzung, sieht den
  Test rot und stellt zurück. Was dabei zu sehen war, steht im Commit.
- **Grüne Tests sagen in diesem Repo nichts über eine Verdrahtung.** Dreimal war etwas gebaut,
  getestet und von der App aus unerreichbar. Der Wächter dagegen ist
  `tests/harness/verdrahtung.test.ts`, und er prüft gegen die **echte** Konstruktion.
- **Nichts still verschlucken.** Kein leeres `catch`, kein `?? []` über einem Fehler.
- **Ein falscher Grund im Kommentar ist schlimmer als kein Kommentar.** Wenn du eine Behauptung
  im Code findest, die du nicht nachmessen kannst, miss sie nach oder streiche sie. In dieser
  Strecke sind vier so gefallen — darunter „`'xhigh'` kostet HTTP 400" und „SearXNG: nur
  DuckDuckGo lief".
- **CK-NFR-012:** eine neue einstellbare Fläche ohne Eintrag in `docs/anpassbare-flaechen.md` ist
  ein Prüfbefund. Das gilt auch außerhalb der App — das `num_ctx` im Modelfile und die
  SearXNG-`settings.yml` stehen dort, gerade weil sie in der App nicht editierbar sind.
