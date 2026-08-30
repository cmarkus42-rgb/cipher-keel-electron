# Nächste Schritte: die Harness-Wahl und der MCP-Transport

**Stand:** 2026-08-30 · `main` bei `3935470`, 2783 Tests grün · zwei Arbeitspakete, unabhängig
voneinander, in dieser Reihenfolge sinnvoll.

Diese Datei ersetzt die drei Wege, die der Kimi-Befund vom 2026-08-23 skizziert hat — sie
beantworteten eine falsch gestellte Frage (siehe die Korrektur dort).

---

## Paket A — keel muss den Harness wählen können

### Was gewollt ist

Christians Satz ist die Anforderung: *„es geht … um den cli harness kimicode — dort hinterlege ich
dann das modell was ich will … ich will ja auch cli-harnesse wechseln/probieren können."*

Also: **der Harness ist die Wahl, nicht das Modell.** Welches Modell ein CLI benutzt, ist dessen
eigene Sache — Kimi Code trägt es in seiner Konfiguration, `-m` überschreibt je Aufruf. keel muss
es nicht kennen und soll es nicht vorschreiben.

### Warum das heute nicht geht

Der Harness steckt in `rahmen.runtime` und damit im **Quelltext des Presets**
(`runtime: 'claude-cli-tmux'`, fest). `getForRuntime` bildet das auf einen Adapter ab. Es gibt
keine Fläche, an der ein Mensch sagt „diese Sitzung bitte mit Kimi".

Dazu die Mechanik, die der alte Befund richtig beschreibt und die bleibt:

- `erreichbarkeit.cli` wird beim Start **nirgends gelesen** (nur eine Nichtleer-Prüfung in
  `model/entry.ts`)
- `ClaudeCodeAdapter.buildLaunchCommand` nagelt `cmd: 'claude'` fest

### Der Schnitt, den ich vorschlage

**A1 — Ein `KimiCodeAdapter` als zweiter `CliSitzungsAdapter`.** Seit der Schnittstellentrennung
ist das billig: er unterscheidet sich in `cmd` (`kimi`), im Modell-Schalter (`-m`) und in der
Frage, wie ein Entitäts-Prompt hineinkommt.

> **Der Vorbehalt ist am 2026-08-30 ausgeräumt — A1 ist baubar.** Die Frage war, ob Kimi Code
> überhaupt einen Entitäts-Prompt annimmt; es hat kein `--append-system-prompt-file`. Aus der
> Dokumentation (`moonshotai.github.io/kimi-code`, Abschnitt „Custom Agents"), wörtlich:
>
> > *„Each file describes one agent: the frontmatter (YAML metadata at the top of the file)
> > declares its name, description, and tool access, and the file body is its **system prompt**."*
>
> `--agent-file <pfad>` ist damit das Gegenstück. keel schreibt den zusammengesetzten Prompt
> ohnehin schon in eine Datei (`writeEntityPromptFile`); für Kimi muss eine Frontmatter davor.
> **Das ist der Unterschied, den ein `KimiCodeAdapter` trägt** — nicht bloß ein anderer `cmd`.
>
> **Drei Einschränkungen, die aus derselben Quelle kommen und den Adapter formen:**
>
> - `--agent-file` **kann nicht mit `--session`/`--continue` kombiniert werden** („the agent is
>   bound at session creation and resuming restores the bound agent automatically"). Der
>   Claude-Adapter benutzt `--resume` und `--fork-session`. Für Kimi heißt das: Prompt beim
>   Anlegen binden, beim Fortsetzen **weglassen** — nicht beides.
> - `--agent-file` und `--agent` schließen einander aus, und der Schalter ist nicht wiederholbar.
> - `-p` (nicht-interaktiv) verträgt sich nicht mit `--yolo`, `--auto` oder `--plan`.
>
> **Für Paket C nebenbei interessant:** Kimi bringt ein eigenes Rechtemodell mit (`auto`, `yolo`,
> Plan-Modus, „static deny rules"), und die Dokumentation warnt ausdrücklich, `--yolo` überspringe
> die Freigabe *„including file writes and shell command execution"*. Ein fremder Harness hat für
> die Frage, die Paket C stellt, also schon eine Antwort — die man ansehen sollte, bevor man eine
> eigene erfindet.
>
> **`opencode` ist auf dieser Maschine nicht installiert** — als dritter Harness bleibt es
> vorerst hypothetisch.

**A2 — `kimi-cli-tmux` in `KNOWN_RUNTIMES` und `RUNTIME_TO_ADAPTER_ID`.** Der Zweig in
`getForRuntime`, der „gültig, aber nicht gebaut" wirft, ist genau dafür stehengeblieben.

**A3 — Die Harness-Wahl bekommt eine Fläche.** Hier liegt die eigentliche Entwurfsentscheidung,
und sie gehört besprochen, nicht geraten. Zwei Richtungen:

- **Am Preset, überschreibbar.** Das Preset nennt weiter einen Vorgabe-Harness; eine neue
  Zuordnung (`harness:vorgabe` oder je Preset) überschreibt ihn. Passt zum bestehenden
  Platz-Muster, und `wirkung: 'naechste-session'` wäre dieselbe Semantik wie bei den Tiers.
- **An der Launcher-Kachel.** Beim Starten einer Zelle wählt man Entität **und** Harness. Direkter,
  aber eine zweite Wahl an einer Stelle, die heute genau eine trägt.

**A4 — Was mit den Tier-Plätzen passiert.** Sie tragen heute Claude-Handles (`opus`, `sonnet`,
`haiku`). Für einen Kimi-Harness bedeuten die nichts. Entweder werden Tier-Plätze
harness-spezifisch, oder ein CLI-Harness bekommt gar kein Modell von keel — und dann ist die
Frage, was `cliHandleFuerTier` künftig überhaupt tut.

> **Der ehrlichste Weg ist vermutlich der zweite**, und er deckt sich mit Christians Satz: ein CLI
> bringt sein Modell selbst mit. Dann verlieren die drei Tier-Plätze ihren heutigen Zweck und
> müssten entweder verschwinden oder etwas anderes bedeuten. Das ist ein Eingriff in eine
> freigetestete Fläche und braucht ein Gespräch, keinen Alleingang.

---

## Paket B — die MCP-Fläche erreichbar machen

### Der Befund

Beim Bau der drei Zellen-Werkzeuge gefunden und im Kopf von `mcp-server.ts` benannt:

- `handleRequest` hat **keinen** Produktionsaufrufer
- `startStdioServer` wird nirgends gerufen, es gibt keinen `bin`-Eintrag
- **`ClaudeCodeAdapter.postLaunchInjection` hat keinen Aufrufer** — die Registrierung beim
  Sitzungsstart läuft also nie

Damit sind alle zehn Werkzeuge unerreichbar, die sieben `graph_*` seit jeher. Nachgeprüft: es gibt
im ganzen `src/main` **keinen** HTTP-Server und **keinen** Port-Konfigurationsschlüssel. Das ist
Bau von Null.

### Der Schnitt

**B1 — Ein lokaler HTTP-Server im Hauptprozess.** Node-`http`, gebunden auf `127.0.0.1`,
**niemals** auf `0.0.0.0`. Eine Route, `POST /mcp`, Rumpf ist JSON-RPC, Antwort desgleichen.
Lebenszyklus an `service-lifecycle.ts`, wie die anderen Subsysteme, mit Statuseintrag.

**B2 — Ein Schlüssel je App-Start.** `randomUUID()` beim Start, nur im Speicher, **nicht** in die
Konfigurationsdatei — dort gehören keine Geheimnisse, das sagt `config-store.ts` über sich selbst.
Jede Anfrage ohne passenden `Authorization: Bearer` bekommt 401, ohne Rumpf.

**B3 — Der Port.** Ephemer (Port 0) und nach dem Binden auslesen, statt eine feste Zahl zu
erfinden, die kollidiert. Er ist dann eine anpassbare Fläche im Sinne von CK-NFR-012 nur, wenn er
konfigurierbar wird — als ephemerer Port ist er es nicht und braucht keinen Eintrag, aber der
Server als solcher schon.

**B4 — `postLaunchInjection` wirklich rufen.** In `SESSION_CREATE`, im tmux-Zweig, **nach**
`createSession`. Der `AdapterContext` wird dort gebaut (`projectPath`, `mcpUrl` aus B1/B3,
`mcpApiKey` aus B2, `sessionId`). Achtung: die Methode ist optional auf `CliSitzungsAdapter` und
der Schleifen-Zweig hat sie nicht — dort wäre sie auch sinnlos.

**B5 — Scoping, und das ist keine Zugabe.** Heute kann `keel_zelle_beauftragen` **jede** Zelle
adressieren und `keel_zelle_ergebnis` **jeden** Lauf der Protokolldatenbank auslesen. Solange
niemand rufen konnte, war das folgenlos. Mit B1 bis B4 ist es das nicht mehr. Zu entscheiden:
darf jede Sitzung jede Zelle beauftragen, oder bindet der Schlüssel an eine Sitzung?

**B6 — Der Fehlerweg.** Ein Werkzeug, das wirft, muss als JSON-RPC-Fehler herauskommen, nicht als
500 ohne Rumpf. `startStdioServer` hat dafür seit der letzten Runde die richtige Aufteilung
(`-32700` für Parse, `-32603` für den Rest) — der HTTP-Weg soll dieselbe benutzen, nicht eine
zweite bauen.

### Was zuerst zu prüfen ist

Ob `claude mcp add-json` und der `settings.local.json`-Weg, die `postLaunchInjection` fährt, mit
einem **ephemeren** Port überhaupt zusammenpassen: die Konfiguration wird je Sitzung geschrieben,
der Port ändert sich je App-Start. Für eine laufende Sitzung ist das egal; für eine, die nach
einem Neustart fortgesetzt wird, nicht. **Nachsehen, nicht annehmen.**

---

## Reihenfolge und Begründung

**B vor A.** Paket B schließt eine Lücke, die heute schon zehn Werkzeuge lahmlegt, und es hat
keine offene Entwurfsfrage außer dem Scoping — der Rest ist Handwerk mit einer Sicherheitsfläche.
Paket A hat mit A3 und A4 zwei Fragen, die ein Gespräch brauchen, und A1 steht unter einem
Vorbehalt, der erst nachzusehen ist.

**Beide sind unabhängig.** Wer B baut, fasst A nicht an und umgekehrt.

---

## Was dabei nicht vergessen werden darf

- **Vor jedem Merge eine Schlussrunde über die eigenen Terminzusagen.** In der Vorgängerstrecke
  standen elf veraltete „kommt in einer späteren Aufgabe"-Kommentare, jede zum Zeitpunkt ihres
  Reviews wahr. Die Suche allein reicht nicht — zwei Treffer lagen über Zeilenumbrüche verteilt,
  einer enthielt kein Suchwort.
- **`npm run typecheck`, nie ein handgeschriebenes `tsc --noEmit -p .`** — letzteres ist in diesem
  Repo stumm erfolgreich und prüft nichts.
- **Die Läufer-Wache liest rohen Dateitext, Kommentare eingeschlossen.** Wer über
  `fremdes-cli`/`eigene-schleife`/`ein-schuss` schreibt, benutzt die Konstanten oder lässt die
  Anführungszeichen weg. Sie hat an einem Tag viermal zugeschlagen.
- **Grüne Tests sagen hier nichts über eine Verdrahtung.** Für Paket B heißt das: der Beweis ist
  ein echter Aufruf durch den laufenden Server, nicht ein Test gegen `handleRequest`.
