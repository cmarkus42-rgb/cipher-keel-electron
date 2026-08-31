# Der MCP-Transport zieht auf einen Unix-Socket, und der Sandkasten lernt Selbsttests — Entwurf

**Stand:** 2026-08-31, `main` bei `a51742e`, Arbeitsbaum sauber, 3077 Tests grün.
Beantwortet den Auftrag aus `plans/2026-08-31-uebergabe-nach-paket-c-und-der-auftrag-selbsttests.md`,
§5 — und **korrigiert dessen Prämisse an zwei Stellen** (§3 unten). Beantwortet damit zugleich
die offene Frage **B5** aus `plans/2026-08-30-naechste-schritte-harness-wahl-und-mcp-transport.md`,
Zeile 128, allerdings anders als dort erwartet: nicht durch einen besser geschnittenen Schlüssel,
sondern durch keinen.

Alle Messungen dieses Entwurfs stammen vom 2026-08-31 auf Darwin 25.4, gegen echtes
`sandbox-exec`, echtes `claude` und echtes `/opt/homebrew/bin/kimi` (0.38.0).

---

## 1. Die Anforderung, in Christians Worten

> *„eigene tests sind doch wohl teil des 'cipher-keel-entwicklungsprozesses' — ohne das lässt
> sich das doch nicht testen?!?"*

und auf den Vorschlag, es klein zu flicken:

> **„lieber gleich richtig"**

Ein Lauf, der seine Tests nicht fahren kann, entwickelt nicht; er liefert ab und hofft.

## 2. Die Lücke, um die es wirklich geht

Sie ist ein **Sandkasten-Ausbruch**, und das steht so in keiner der Vorgängerübergaben:

1. Ein gesandkastetes Kind (`shell_ausfuehren`) bekommt Loopback, damit `flutter test` läuft.
2. Es liest den MCP-Bearer aus dem Projektbaum — `.claude/settings.local.json` liegt dort, und
   der Sandkasten erlaubt Lesen.
3. Es ruft `keel_zelle_beauftragen`.
4. **Die beauftragte Niveau-B-Zelle läuft ohne Sandkasten.**

Der Weg führt also aus dem Sandkasten heraus, nicht bloss an Daten heran. Das ist der Grund,
warum die Frage vor den Selbsttests steht und nicht daneben.

**Ein Schlüssel je Sitzung hätte das nicht geschlossen.** Das Kind stiehlt einen *gültigen*
Schlüssel aus dem Baum genau der Sitzung, die Zellen beauftragen darf; es spricht danach als sie.
Scoping begrenzt den Schaden, es verhindert den Ausbruch nicht. Der Zuschnitt der Übergabe
(„B5 beantworten, dann Loopback öffnen") hätte den Aufwand bezahlt und die Lücke behalten.

## 3. Was am 2026-08-31 gemessen wurde — zwei Prämissen der Übergabe fallen

| Frage | Antwort |
|---|---|
| Nimmt Claude Codes `http`-Transport eine Socket-URL? | **Nein.** `unix://…` wird von `claude mcp add` klaglos gespeichert und beim Verbinden abgewiesen: `ERR_INVALID_ARG_VALUE: protocol must be http:, https: or s3:`. Die Variante, wie §5 der Übergabe sie beschreibt, existiert nicht |
| Geht es über eine `stdio`-Brücke? | **Ja.** `initialize`, `notifications/initialized` und `tools/list` kamen am Unix-Socket an |
| Hält `(deny file-read* file-write* (subpath X))` einen Socket-Connect nach `X` auf? | **Nein** — `nc -U` bekam `rc=0` und seine Daten. Seatbelt mediiert den Connect als `network-outbound`, nicht als Dateioperation. **Damit ist das tragende Argument der Übergabe für den Socket falsch**: „`userData` ist beidseitig gesperrt — das Kind kommt nicht heran" stimmt nicht |
| Was hält ihn dann auf? | `(deny network-outbound (literal "<sock>"))` → `rc=1`, kein Byte. `(deny network-outbound (subpath "<dir>"))` → `rc=1` |
| Und ohne jedes Verbot? | `(allow network-outbound (remote ip "*:*"))` gewährt IP-Netz und **keine** Unix-Sockets → `rc=1`. Die Zusage kommt aus der Form der Erlaubnis, nicht aus einer Verbotsliste |
| Reicht `(allow network-bind)` für einen Testrunner? | **Nein.** `listen(2)` scheitert mit `Operation not permitted` selbst bei *ungefiltertem* `network-bind`. Es braucht `network-inbound`. **Auch der heutige `offen`-Modus könnte also keinen Testrunner lauschen lassen** |
| Was reicht? | `network-bind` + `network-inbound` + `network-outbound`, je auf `localhost:*` gefiltert → Server-Socket, Connect und Accept auf 127.0.0.1 laufen durch |
| Lädt Kimi 0.38.0 einen projektlokalen MCP-Server? | Im `-p`-Modus **nein — weder über `stdio` noch über `http`**. Beide Sonden bekamen null Treffer. Der Transport ist dort nicht die Variable |

Der letzte Befund hat eine Folge, die über diesen Entwurf hinausgeht: **keels Kimi-Einspritzung
war nie als funktionierend gemessen.** Der Umzug verliert dort nichts Bewiesenes.

### 3.1 Der Nebenbefund, der nicht verschwiegen wird

Unter `(allow network-bind (local ip "localhost:*"))` gelang zusätzlich ein `bind` auf `0.0.0.0`
samt `listen`. Ob ein Rechner aus dem LAN dort tatsächlich ankommt, ist **nicht** gemessen —
`network-inbound` ist auf `localhost` gefiltert und sollte den Accept abweisen. Als Annahme
geführt, nicht als Zusage. Gehört in den Umsetzungsplan als eigene Messung.

## 4. Der Entwurf

### 4.1 Der Transport

`mcp-http-server.ts` behält HTTP und tauscht nur das Ohr: `server.listen(pfad)` statt
`server.listen(0, '127.0.0.1')`. Das ist der kleinste Schnitt, der die Sache erledigt — die
Fehlerpolitik (404 für falsche Route, 413 für zu grossen Rumpf, −32700 für kaputtes JSON, −32603
als letztes Netz) und ihre Tests überleben unverändert. **Nur der 401-Zweig fällt weg**, samt
`safeEqual`/`isAuthorized`: die Grenze liegt danach nicht mehr an einem Vergleich im
Anfragekopf.

Der Socketpfad ist **frisch je App-Start**: `<userData>/mcp-<8 hex>.sock`. Das erhält genau die
Eigenschaft, für die seinerzeit Port 0 gewählt wurde — zwei Instanzen, oder ein Neustart über
einem noch lebenden alten Prozess, kollidieren nie. Ein fester Pfad täte das.

Zwei Eigenheiten von Unix-Sockets, die in den Code gehören und nicht in eine Fussnote:

- **Längengrenze.** `sun_path` fasst auf macOS 104 Zeichen. Gemessen für diese Maschine:
  `/Users/cipher/Library/Application Support/cipher-keel` sind 53, mit `/mcp-<8hex>.sock` also
  71 — Luft, aber kein Naturgesetz. Ein Nutzer mit längerem Kurznamen kommt näher heran. Der
  Start prüft die Länge und scheitert **laut**, statt einen abgeschnittenen Pfad zu binden.
- **Leichen.** Ein Absturz lässt die Socketdatei liegen, und `listen` scheitert dann mit
  `EADDRINUSE` auf einer Datei, hinter der niemand mehr lauscht. Vor `listen` wird ein
  vorhandener Pfad entfernt; beim Herunterfahren ebenfalls (`service-lifecycle.ts` schliesst den
  Server schon, das Löschen kommt dazu).

### 4.2 Die Brücke

Eine mitgelieferte Datei, gestartet über `process.execPath` mit `ELECTRON_RUN_AS_NODE=1` — **die
App braucht kein Node auf dem System**, sie hat ihres dabei. Rund fünfzehn Zeilen: eine Zeile von
stdin, ein POST über `socketPath`, eine Zeile nach stdout.

Sie muss in `build.files` der `package.json` und darf nicht in der asar-Archivierung verschwinden,
weil ein Kindprozess sie als echten Pfad braucht.

### 4.3 Die Einspritzung — hier verschwindet der Bearer

`AdapterContext` verliert `mcpUrl` und `mcpApiKey` und bekommt stattdessen die Startbeschreibung
der Brücke (`command`, `args`, `env`). Der Vertrag sagt danach, was er meint: nicht „hier ist eine
Adresse und ein Geheimnis", sondern „so startest du den Weg zu mir".

- **Claude Code:** `.claude/settings.local.json` bekommt einen `stdio`-Eintrag. Der zweite Weg,
  `claude mcp add-json`, fällt ersatzlos — er trug den Schlüssel als CLI-Argument, also in `ps`
  sichtbar für jeden Prozess des Nutzers. Er war ohnehin der nicht zurücknehmbare der beiden.
- **Kimi:** dieselbe Form in `.kimi-code/mcp.json`. Die Rücknahmelogik dort begründet sich heute
  ausdrücklich damit, dass die Datei „einen gültigen Bearer wörtlich enthalten kann" — dieser
  Satz wird falsch und gehört mitkorrigiert, die Rücknahme selbst bleibt.

**Was das für B5 heisst.** Die Frage war: *„darf jede Sitzung jede Zelle beauftragen, oder bindet
der Schlüssel an eine Sitzung?"* Die Antwort dieses Entwurfs ist: **es gibt keinen Schlüssel
mehr.** Der Modulkopf von `mcp-server.ts` argumentiert heute, ein Schlüssel je Sitzung kaufe
Authentisierungs- ohne Autorisierungsschärfe, weil nichts eine Zelle an eine Sitzung bindet —
das Argument bleibt richtig und wird nur um seine Voraussetzung erleichtert. Die *Autorisierungs*-
frage (darf Sitzung A den Lauf von Sitzung B auslesen?) bleibt offen und ist nach diesem Paket
kleiner als vorher: sie betrifft nur noch Sitzungen desselben Menschen untereinander, nicht mehr
einen ausgebrochenen Sandkasten. Sie wird **benannt, nicht gebaut** (§7).

### 4.4 Der Sandkasten

```
zu     (allow network-bind     (local  ip "localhost:*"))
       (allow network-inbound  (local  ip "localhost:*"))
       (allow network-outbound (remote ip "localhost:*"))

offen  dieselben drei Zeilen, je mit "*:*"
       — und (deny network-outbound (remote ip "localhost:*")) entfällt ersatzlos
```

Keine dieser Zeilen nennt Unix-Sockets, also bleiben sie unter `(deny default)`. **keels MCP ist
aus dem Sandkasten nicht mehr erreichbar, und zwar per Vorgabe-Verbot, nicht per Verbotszeile.**

Die Ordnung „alle Erlaubnisse zuerst, alle Verbote zuletzt" bleibt unangetastet; die drei neuen
Zeilen sind Erlaubnisse und gehören nach oben. Der wegfallende `localhost`-Deny war die einzige
Zeile im Verbotsblock, die vom Netzmodus abhing — der Block wird dadurch einfacher, nicht
komplizierter.

**Der Preis, laut gesagt.** Loopback öffnen heisst: das Kind erreicht jeden lokal lauschenden
Dienst. Auf dieser Maschine sind das gerade unter anderem Ollama (`11433`), ein `llama-server`
(`8766`), `adb` (`5037`) und mehrere Python-Dienste. Das ist **Datenpreisgabe, kein
Sandkasten-Ausbruch** — der Ausbruch lief über keels MCP, und der ist danach zu. Aber es ist ein
Preis, und er gehört als Kommentar an die drei Zeilen, nicht in ein Dokument, das niemand liest,
wenn er das Profil ändert.

### 4.5 Die drei mechanischen Punkte

| Punkt | Änderung | Warum |
|---|---|---|
| Signal an Kinder | `(allow signal (target self))` → `… (target children)` | Ohne das besteht `flutter test` und der Abbau **hängt** 2:29 min bis zur Wanduhr statt 1 s. Betrifft jeden Testrunner mit Kindprozess, nicht nur Dart |
| Zwischenspeicher | `.dart` und `.flutter` **raus**, `.dart-tool` **rein** | Die beiden alten Einträge existieren auf dieser Maschine nicht — sie sind aus der Doku abgeschrieben, nicht gemessen |
| Flutter-Engine | vier **Dateinamen** unter `$FLUTTER_ROOT/bin/cache` freigeben: `engine.stamp`, `engine.realm`, `engine.stamp.tmp.<pid>`, `lockfile`; plus `flutter precache` in den Aufbau | **Nicht den Baum**: dort liegen `dart-sdk/bin/dart` und ausführbare Bibliotheken, die der Mensch danach aufruft — exakt das `.gradle`-Muster, das bei Paket C schon einmal korrigiert wurde. Ohne `precache` **hängt** der erste Lauf beim Nachladen der Engine, statt zu scheitern |

`engine.stamp.tmp.<pid>` ist ein Muster, kein Name — das braucht eine Regex-Regel, und für die
gilt die gemessene Regel aus Paket C: im `#"…"`-Literal *ist* `\\` der Rückstrich, vier machen
die Regel still unwirksam.

## 5. Wie das bewiesen wird

**Nicht durch eine grüne Suite.** Das war die Lehre aus Paket C: alle drei Funde, die zählten,
kamen aus einem echten Lauf, keiner aus 3077 Tests. Der Beweis ist ein Lauf in der gebauten App:

1. App bauen und starten, Sitzung über das Gitterfenster anlegen (Kachelklick, kein direkter
   IPC-Aufruf).
2. `/mcp` im echten tmux-Pane zeigt `cipher-keel · ✔ connected · 10 tools` und `Auth: ✔`.
3. Im Pane ein `graph_search` nach einem Knoten, der Sekunden vorher direkt geschrieben wurde —
   der laufende Prozess muss die uid zurückgeben, nicht die Testsuite.
4. `flutter test` über `shell_ausfuehren` im Sandkasten: `rc=0`, „All tests passed", **und keine
   2:29 Minuten**. Die Dauer ist Teil des Beweises, nicht Beiwerk.
5. **Die Gegenprobe:** `nc -U <socketpfad>` aus dem Sandkasten heraus muss scheitern. Ohne diesen
   Schritt ist nur belegt, dass etwas funktioniert, nicht dass etwas zu ist.
6. Ein Schreibversuch ausserhalb der Wurzel wird weiter kassiert (`tool.entschieden`,
   `erlaubt: false`), `.git` bleibt unberührt — die Zusagen aus Paket C gelten unverändert.

Ein Mutationstest gehört zu Schritt 5: die drei Netz-Zeilen versuchsweise auf `*:*` erweitern,
und `nc -U` muss dann **gelingen**. Sonst beweist das Scheitern in Schritt 5 nur, dass der Socket
nicht da war. Aus Paket C, Task 7: zwei Schutzmechanismen mit derselben Meldung machen einander
unprüfbar.

## 6. Was in jeden Aufgabenbrief gehört

Aus den Fehlern der Paket-C-Strecke, wörtlich übernommen, weil sie sonst wieder passieren:

- **`npm run lint` gehört in jeden Brief.** Der Paket-C-Zweig war seit Task 5 lint-rot, fünf
  Aufgaben lang, weil es nur in manchen Briefs stand.
- **Listen werden gemessen, nicht abgeschrieben.** `STANDARD_ZWISCHENSPEICHER` trägt heute zwei
  Einträge, die es nicht gibt.
- **Ein `grep` nach einer Zusage reicht nicht.** In Task 9 fand das vorgegebene Suchmuster einen
  von sechs Treffern; der wichtigste stand im Prompt, nicht im Code. Hier betrifft das den Satz
  über den Bearer, der an mindestens vier Stellen steht: `mcp-http-server.ts` (Modulkopf und
  `McpHttpServerHandle`), `mcp-server.ts` (Modulkopf, B5-Absatz), `kimi-code.ts` (Rücknahme),
  `agent-adapter.ts` (`AdapterContext`), dazu `docs/anpassbare-flaechen.md`.
- **Ein Hänger ist schlimmer als ein Fehlschlag.** Zwei der drei Flutter-Blocker äusserten sich
  als stilles Warten. Bei jeder neuen Grenze gehört gefragt: *scheitert das laut, oder wartet es?*

## 7. Was dieser Entwurf nicht tut, und das absichtlich

- **Kein Zellen-Scoping.** Darf Sitzung A den Lauf von Sitzung B auslesen? Bleibt offen, ist nach
  diesem Paket aber eine Frage zwischen Sitzungen desselben Menschen und keine Ausbruchsfrage
  mehr. Wenn sie gebaut wird, dann als eigenes Paket mit eigenem Entwurf.
- **Kein Beweis für Kimi.** Dass Kimi 0.38.0 im `-p`-Modus keinen projektlokalen MCP-Server lädt,
  ist gemessen; was Kimi *interaktiv* tut, ist es nicht. Der `stdio`-Eintrag wird geschrieben und
  bleibt **unbewiesen benannt**, so wie der HTTP-Eintrag es vorher schon war.
- **Keine Portfilterung.** Seatbelt kann sie nicht (Paket C, §4): `(remote ip "127.0.0.1:8802")`
  ist ein Syntaxfehler, `(remote ip "*:8802")` wird angenommen und greift nicht. Loopback ist ganz
  zu oder ganz auf. Deshalb muss der MCP-Server das Loopback verlassen und nicht sich darauf
  verstecken.
- **Kein CIDR-Filter für `offen`.** Unverändert: Seatbelt kann `100.64/10` nicht ausdrücken, das
  Tailnet bleibt unter `offen` erreichbar. Benannt seit Paket C, nicht geschlossen.
- **Die offenen Punkte 1 bis 7 aus der Übergabe** (Abbruch erreicht kein laufendes Kommando,
  Git-Vorbedingung für rein lesende Läufe, `package.json` schreibbar, `.claude/` schreibbar,
  `mach-lookup` ungefiltert, `"` im Projektpfad, kein IP-Test für `offen`) bleiben offen. Punkt 1
  ist weiterhin der mit dem Alltagsschmerz.

## 8. Reihenfolge der Umsetzung

1. Brücke schreiben, Paketierung, Längen- und Leichenprüfung am Socketpfad.
2. `mcp-http-server.ts` auf den Socket, 401-Zweig raus, Tests nachziehen.
3. `AdapterContext` umstellen; Claude-Code- und Kimi-Einspritzung, zweiter Claude-Weg raus.
4. Alle Sätze über den Bearer korrigieren (§6, dritter Punkt — die Liste ist dort vollständig).
5. Sandkasten: die drei Netz-Zeilen, der wegfallende Deny, Signal an Kinder, Zwischenspeicher,
   `bin/cache`, `flutter precache`.
6. Der echte Lauf (§5), inklusive Gegenprobe und Mutationstest.

Schritt 2 und 3 gehören zusammen — dazwischen ist die App nicht lauffähig, und das ist in
Ordnung, solange kein Zwischenstand gemergt wird.
