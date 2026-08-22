# Übergabe: Qwen3.8 27B als Niveau-C-Modell mit Nachschlagen und Rechercheur

**Stand:** 2026-08-22 · **Zweig:** `qwen38-niveau-c`, 14 Commits über `main`, 2627 Tests grün,
typecheck und lint sauber, Arbeitsbaum sauber · **Nicht integriert.**

Diese Datei ist der Einstieg. Lies sie ganz, bevor du etwas anfasst — sie nennt auch, was *nicht*
stimmt, und das ist der teurere Teil.

---

## 1. Worum es geht

Der Nutzer betreibt cipher keel, eine Electron-Anwendung mit eigener Agentenschleife (dem
Harness). Die Schleife steht seit 2026-08-18 in `main`: Prompt bauen, Antwort lesen, Werkzeuge
ausführen, Budgets prüfen, alles ins Ereignisprotokoll. Werkzeuge waren bis dahin nur lesend
(Datei, Verzeichnis, Inhaltssuche, Knowledge-Graph).

Diese Welle bringt **Qwen3.8 27B auf dem hauseigenen DGX Spark als Niveau-C-Modell** — die
billige lokale Ebene des Leistungsgefälles — und gibt ihm zwei Dinge, ohne die es laut Nutzer
nicht gut funktioniert: **Recherche** und **Skill-Unterstützung durch Werkzeuge**.

Die maßgeblichen Dokumente, in dieser Reihenfolge:

1. `docs/superpowers/specs/2026-08-21-qwen38-niveau-c-entwurf.md` — der Entwurf, mit zwei
   Nachträgen am Ende. **Der Nachtrag vom 2026-08-22 ist die gültige Zielfassung.**
2. `docs/superpowers/plans/2026-08-21-messungen-qwen38-spark.md` — was an der laufenden Maschine
   gemessen wurde, samt zwei Stellen, an denen die Messung den Entwurf widerlegt hat.
3. `docs/superpowers/specs/2026-08-18-harness-kern-design.md` — die Kern-Spec. §5.1 und §13 sind
   am 2026-08-22 nachgeführt worden, weil sie das hier Gebaute vorher ausgeschlossen hatten.

---

## 2. Das Ziel in einem Absatz

Zwei Netzwege mit verschiedener Vertrauensstufe.

**Nachschlagen** (`web_suchen`, `seite_lesen`) steht im Hauptlauf, aber nur gegen eine
Positivliste aus Herstellerdokumentation. Der Gewinn ist nicht Bequemlichkeit, sondern Kontext:
das Modell kann im selben Lauf eine Datei lesen und die zugehörige API nachschlagen.

**Recherchieren** (`recherchieren`) ist der gekapselte Unterlauf für alles außerhalb der Liste —
GitHub, Foren, Blogs, das offene Netz. Eigene Registry ohne Datei- und Graph-Werkzeuge, Rückgabe
nur als Text mit Quellenliste. Damit ist auf dem ausführenden Pfad ein Bein der Trifecta entfernt,
statt das Modell darum zu bitten.

Der Unterschied ist genau ein Feld: der Modus der `netzwache` (`'whitelist'` gegen `'offen'`).
Alle übrigen Regeln gelten in beiden.

---

## 3. Was steht, und was du glauben darfst

### Steht und ist an der echten Maschine gemessen

- **Ollama auf dem Spark ist 0.32.15** (war 0.32.5, das Modell verlangt ≥ 0.32.12). Der alte
  Container liegt als `ollama-alt-0325` geparkt und ist ein `docker start` weit weg.
- **`qwen3.8:27b` liegt dort**, dazu das abgeleitete `keel-qwen38:27b` mit Kontext und den drei
  Samplern, die Ollamas `/v1` nicht durchreicht.
- **M1** lädt und antwortet · **M4** `ollama create` reicht Renderer und Parser durch,
  `tool_calls` kommen strukturiert · **M2** `/v1` nimmt `tool`-Nachrichten in beiden Formen —
  die Codec-Entscheidung hält, `ollama-native` bleibt ungebaut · **M3** alle sieben Denkstufen
  werden angenommen · **M5** der Präfix-Cache greift für die Form, die die Schleife wirklich hat
  · **M8** siehe die Falle unten.
- 2627 Tests, typecheck, lint.

### Steht im Code, ist aber **nicht** an einem echten Modell erprobt

- Der **Rechercheur**. Sein innerer Ablauf ist nie gegen ein echtes Modell mit einem echten
  Suchdienst gelaufen. Der Nutzer verlangt ausdrücklich, dass er „ausgetestet und optimiert" ist
  und „einen funktionierenden inneren Flow" hat. **Das ist die wichtigste offene Arbeit.**
  Prüfbar gemacht als **M12** im Nachtrag vom 2026-08-22, mit sechs konkreten Fragen.
- Die **Skill-Mechanik**. Ob ein 27B dem Satz „lies die Fähigkeit, bevor du sie benutzt"
  tatsächlich folgt, ist unbelegt — **M7**, laut Entwurf der wichtigste Messpunkt überhaupt,
  weil keels Niveau B schon heute auf derselben Annahme ruht.
- **Kein einziger Netzlauf** hat stattgefunden: es ist kein Suchanbieter konfiguriert.

---

## 4. Drei Fallen, die Zeit kosten, wenn du sie nicht kennst

**Ollama halbiert `num_ctx` pro Anfrage.** Gemessen: `num_ctx 65536` im Modelfile ergab **32.770**
nutzbare Token, und ein 185.000-Token-Prompt wurde **vorne still abgeschnitten** — das Modell
antwortete „verstanden", als wäre nichts gewesen. `ollama show` und `/api/ps` melden beide 65536;
das ist die Gesamtzuteilung über die parallelen Plätze, nicht das, was eine Anfrage bekommt. Das
Modelfile steht deshalb auf `131072`, damit `nutzbaresKontextfenster: 65536` in der Registry
stimmt. **Wer eine der beiden Zahlen ändert, muss die andere mitändern** — laufen sie auseinander,
feuert keels Kontextbudget nie und der Server kappt lautlos.

**Grüne Tests sagen in diesem Repo nichts über eine Verdrahtung.** Zweimal in dieser Welle war
etwas gebaut, getestet und von der App aus unerreichbar: einmal die ganze Netz-Hälfte (2617 Tests
grün, kein `fetch(` unter `src/main/harness/`), und das Repo hatte denselben Ausgang vorher schon
mit einem Grid-Fenster, das kein Knopf öffnen konnte. Der Wächter dagegen ist
`tests/harness/verdrahtung.test.ts` — er prüft gegen die **echte** Konstruktion
(`baueWerkzeugRegistry` in `harness-handlers.ts`), nicht gegen einen Nachbau. Ein Nachbau war
genau der Grund, warum `werkzeugliste.test.ts` grün blieb.

**Ein falscher Grund im Kommentar ist schlimmer als kein Kommentar.** Der Entwurf behauptete,
`'xhigh'` koste einen HTTP 400. Gemessen ist das falsch — der Server nimmt es an. Der wahre Grund,
es nicht zu senden, ist besser: 106 s für eine *kürzere* Antwort als `medium` in 37 s. Die Tabelle
steht jetzt bei `DENKSTUFEN` in `src/main/model/entry.ts`. Wenn du eine Behauptung im Code findest,
die du nicht nachmessen kannst, miss sie nach oder streiche sie.

---

## 5. Was der Nutzer tun muss, bevor es weitergeht

**Einen Suchanbieter einrichten.** Ohne einen melden `web_suchen` und `seite_lesen` benannt, dass
Netzzugang nicht eingerichtet ist — sie geben keine leeren Treffer zurück, und das ist Absicht.

Drei Möglichkeiten, alle gebaut:

| | Kontingent | Auflage |
|---|---|---|
| **Brave** | 1.000 Anfragen/Monat frei ($5 Guthaben à $5/1.000), Kreditkarte bei Anmeldung | **§3(b)(i): kein Speichern außer transient.** Siehe unten |
| **Tavily** | 1.000 Credits/Monat frei, ohne Kreditkarte | mild, für Agenten gebaut |
| **SearXNG** | unbegrenzt, selbst gehostet auf MS-01 | keine — kann sich aber als DuckDuckGo-Proxy entpuppen (M6) |

Der Nutzer hat ein **Brave**-Konto. Der Anbieter ist gebaut (`BraveAnbieter`), aber Brave trägt
als einziger eine ausdrückliche Auflage: Ergebnisse dürfen nicht „store, cache, or create a
database of" werden, „other than transient storage required for operation of Customer
Applications". keels Ereignisprotokoll ist append-only und hält die Trefferliste in
`tool.completed` dauerhaft. Ob das als „transient storage required for operation" durchgeht, ist
eine Auslegung. **Diese Abwägung gehört dem Nutzer, nicht dem Code** — deshalb fällt Brave
niemandem automatisch zu, sondern muss ausdrücklich gewählt werden.

Die Handgriffe stehen in Abschnitt 7.

---

## 6. Die Arbeit, die ansteht, in der Reihenfolge, in der sie zählt

1. **M12 — den inneren Ablauf des Rechercheurs austesten und nachstellen.** Zehn echte Fragen
   durch die App, Ereignisprotokoll lesen, die sechs Fragen aus dem Nachtrag beantworten.
   Ergebnis ist eine Quote und eine Liste dessen, was nachgestellt werden muss:
   Beschreibungstexte, Budgets, Denkstufe des Unterlaufs, Aufbau der Rückgabe. Bis dahin gilt der
   Rechercheur als gebaut, nicht als brauchbar.
2. **M7 — folgt ein 27B dem Nachlade-Satz?** Ein Auftrag, dessen Lösung nur in einer Fähigkeit
   steht, die im Präfix bloß mit Namen und Beschreibung erscheint. 20 Läufe, zwei Fähigkeiten,
   `skill.geladen` im Protokoll zählen gegen die Fälle, in denen das Modell stattdessen geraten
   hat.
3. **Das Settings-Fenster** kennt die Netz-Felder nicht. `netz.searxngEndpunkt`,
   `netz.bevorzugt` und `netz.zusaetzlichePositivliste` sind heute nur über die Konfigurationsdatei
   erreichbar. Das ist im Inventar so benannt, aber es ist eine offene CK-NFR-012-Lücke.
4. **M6 — SearXNG gegen Tavily gegen Brave**, an denselben 20 Fragen. Vorher ist die
   Anbieterwahl geraten.
5. **Integration** nach `main` über `superpowers:finishing-a-development-branch`.

Was ausdrücklich **nicht** ansteht: der `ollama-native`-Codec (M2 hat gezeigt, dass er nichts
kaufen würde), Vision und Dokumente über `/v1` (strukturell beschädigt bzw. Sackgasse), YaRN,
vLLM, ein Injektions-Klassifikator. Die Begründungen stehen in Entwurf §7.

---

## 7. Handgriffe

```bash
# Brave-Schluessel hinterlegen (Konto vorhanden), danach ausdruecklich waehlen:
security add-generic-password -s cipher-keel-api-brave -a key -w '<BRAVE_SUBSCRIPTION_TOKEN>'
#   und in der Konfigurationsdatei:  netz.bevorzugt = "brave"

# oder Tavily, ohne Auflage:
security add-generic-password -s cipher-keel-api-tavily -a key -w '<TAVILY_KEY>'

# Zugang zum Spark (NICHT der OpenClaw-Key):
ssh DGX                      # Alias mit nvsync.key, User crimak, Docker-Gruppe ohne sudo

# App treiben (Skill run-keel):
KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness
node .claude/skills/run-keel/driver.mjs settings-window "…"
.claude/skills/run-keel/stop.sh          # immer, sonst bleiben tmux-Sitzungen liegen

# Aufraeumen, wenn sich 0.32.15 bewaehrt hat:
ssh DGX 'docker rm ollama-alt-0325'
```

Die Registry-Zeile für das Modell ist `spark-qwen38-27b` in `src/main/model/defaults.ts`. Sie
trägt `quelle: 'vermutet'` und behält das, bis es einen Kanarienauftrag gibt — auch die von Hand
gemessenen Zahlen machen sie nicht zu `'gemessen'`. Das ist das Wort des Kanarienauftrags.

---

## 8. Wie hier gearbeitet wird

Falls du es nicht aus den Commits ohnehin abliest:

- **Falsifikation statt Bestätigung.** Wer eine Wache baut, erzwingt die Verletzung, sieht den
  Test rot und stellt zurück. Was dabei zu sehen war, steht im Commit. Diese Welle hat drei
  Fehler gefunden, die bei grüner Suite unsichtbar waren, und jeder war ein Test, der aus einem
  Nebengrund grün war.
- **Nichts still verschlucken.** Kein leeres `catch`, kein `?? []` über einem Fehler. Ein `catch`,
  der ein Rechteproblem wie „Verzeichnis gibt es nicht" behandelte, ließ in dieser Welle *alle*
  Fähigkeiten verschwinden, ohne dass irgendwo ein Pfad genannt wurde.
- **Kommentare erklären das Warum**, mit dem konkreten Fehlerfall dahinter.
- **CK-NFR-012:** eine neue einstellbare Fläche ohne Eintrag in `docs/anpassbare-flaechen.md` ist
  ein Prüfbefund. Das gilt auch für Flächen außerhalb der App — das `num_ctx` im Modelfile auf
  dem Spark steht dort, gerade weil es in der App nicht editierbar ist.
