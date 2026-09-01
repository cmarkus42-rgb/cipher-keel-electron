# Übergabe nach Paket D — der MCP-Socket, und die Selbsttests laufen

**Stand:** 2026-08-31 · Zweig `paket-d-mcp-socket-und-selbsttests`, sechs Commits über `a51742e` ·
**3101 Tests** in 224 Dateien, `typecheck`, `lint` und `test` grün · Arbeitsbaum sauber, nicht
gemergt.

Vorgänger: `2026-08-31-uebergabe-nach-paket-c-und-der-auftrag-selbsttests.md`.
Entwurf: `specs/2026-08-31-mcp-unix-socket-und-selbsttests-design.md` ·
Plan: `plans/2026-08-31-paket-d-mcp-socket-und-selbsttests.md`.

> **Wenn du die nächste Inferenz bist:** §1–5 berichten, §8 ist der Auftrag. **Fang nicht an zu
> bauen** — der Zweig ist fertig und wartet auf Christians Durchsicht, und die Frage in §8 ist
> eine, die er beantwortet, nicht du. Lies §4, bevor du irgendetwas am Sandkasten anfasst.

---

## 1. Was gebaut wurde, in einem Satz

keels MCP-Server hat TCP verlassen und lauscht auf einem Unix-Socket unter `userData`; der
Sandkasten erlaubt seither Loopback (damit `flutter test` läuft) und **keine Unix-Sockets**
(damit keels eigene Werkzeuge unerreichbar bleiben). Der Bearer-Schlüssel ist ersatzlos
entfallen.

**Die Lücke, um die es ging, war ein Ausbruch, keine Datenpreisgabe** — und das stand in keiner
Vorgängerübergabe: ein gesandkastetes Kind bekommt Loopback, liest den Bearer aus dem
Projektbaum, ruft `keel_zelle_beauftragen`, und **die beauftragte Niveau-B-Zelle läuft ohne
Sandkasten**. Ein Schlüssel je Sitzung hätte das nicht geschlossen: das Kind stiehlt einen
*gültigen* Schlüssel und spricht danach als die Sitzung, der er gehört.

Damit ist **B5 beantwortet, indem die Frage ihren Gegenstand verliert.**

## 2. Der Beweis — ein echter Lauf, und was er gekostet hat

`/mcp` in einer echten Sitzung, über die Oberfläche angelegt (Kachelklick, kein IPC-Aufruf):

| Prüfung | Ergebnis |
|---|---|
| `services:status` | `mcp: ready`, einzig `voice` degradiert (erwartet) |
| Log | `MCP server listening on /private/tmp/keel-verify/mcp-69a15b81.sock` |
| TCP-Listener des Prozesses | **keiner** |
| `tools/list` über den Socket, **ohne Authorization-Kopf** | 10 Werkzeuge |
| `.claude/settings.local.json` der Sitzung | `command`/`args`/`env`, **0 Treffer** für `Bearer`/`Authorization` |
| `claude mcp list` im Projekt | `cipher-keel · ✔ Connected` |
| Der laufende `claude`-Prozess im Pane | `Called cipher-keel` → `060TVWPQRWQ1K5PHF780W8GMDP` — die exakte uid eines Knotens, der Sekunden vorher über den Socket geschrieben wurde |

**Und der Lauf hat eine Regression gefunden, die ich selbst eingebaut hatte.** Das ist der
wertvollste Teil dieses Pakets:

> Der Doc-Kommentar behauptete seit Paket B, `.claude/settings.local.json` sei *„the path Claude
> Code actually reads a project's local MCP config from"*. **Das ist falsch.** Paket D hatte den
> zweiten Weg (`claude mcp add-json`) gestrichen — er reichte die Konfiguration als
> Kommandozeilenargument weiter, mit einem Bearer darin ein echter Mangel. Danach kannte
> `claude mcp list` den Server nicht mehr.

Der Irrtum konnte drei Wochen stehen, weil **nie einer der beiden Wege allein lief**. Die
Paket-B-Messung („`/mcp` zeigt 10 tools") konnte zwischen ihnen nicht unterscheiden. Erst das
Wegnehmen hat sie getrennt. Gemessen am 2026-08-31:

```
.claude/settings.local.json allein  ->  nicht gelistet
claude mcp add-json -s local        ->  ✔ Connected
.mcp.json im Projektwurzelverzeichnis -> ⏸ Pending approval  (interaktiv, fuer
                                          einen Autostart unbrauchbar)
```

Der CLI-Weg ist wiederhergestellt und trägt jetzt einen `stdio`-Eintrag ohne Geheimnis — womit
der Einwand gegen ihn gegenstandslos ist. Der Dateiweg bleibt für das, was er wirklich kann:
**die Rücknahme**, denn `claude mcp remove` kennt den Vorzustand nicht.

### `flutter test` im Sandkasten

```
rc=0 · "All tests passed" · 1,361 s
```

Und die drei Gegenproben, ohne die der Befund nichts belegt — jede kehrt genau eine Änderung um:

| Gegenprobe | Ergebnis |
|---|---|
| **A** — ohne `(allow signal (target children))` | **hängt**: 75 s Deckel erreicht, „All tests passed" kommt nie. Der Lauf scheitert nicht, er wartet |
| **B** — ohne die drei Netz-Zeilen | scheitert **laut in 0,8 s** (`Operation not permitted` beim Server-Socket) |
| **C** — `nc -U <keels echter MCP-Socket>` aus dem Sandkasten | `rc=1`, kein Byte |
| **C-Mutation** — dasselbe Profil plus `(allow network-outbound)` | `rc=0` — ohne diese Zeile bewiese C nur, dass der Socket nicht da war |

**Abweichung von der Übergabe, benannt:** dort stand, ohne `(target children)` bestehe der Test
und *der Abbau* hänge 2:29 min. Gemessen hängt der Lauf **früher** — die Ausgabe bleibt bei
„loading widget_test.dart" stehen. Die Folge ist dieselbe und schlimmer als beschrieben.

Die Beweisdateien sind **nicht** eingecheckt: sie brauchen ein Flutter-Projekt unter `/tmp` und
einen laufenden App-Socket. Ein Test, dessen Farbe an der Maschine hängt, sagt über den Code
nichts — die Regel steht so in `sandkasten-lauf.test.ts` und gilt auch für meine eigenen Proben.

## 3. Gemessene Tatsachen, damit sie niemand zweimal erkaufen muss

Alles auf Darwin 25.4, 2026-08-31. **Zwei davon widerlegen die Vorgängerübergabe.**

| Frage | Antwort |
|---|---|
| Nimmt Claude Codes `http`-Transport eine Socket-URL? | **Nein.** `unix://…` wird von `claude mcp add` klaglos gespeichert und beim Verbinden abgewiesen: `ERR_INVALID_ARG_VALUE: protocol must be http:, https: or s3:`. **Die Variante aus §5 der Übergabe existiert nicht** |
| Geht es über eine `stdio`-Brücke? | **Ja** — gemessen bis `✔ Connected` und bis zu einem echten Werkzeugaufruf |
| Hält `(deny file-read* file-write* (subpath X))` einen Socket-Connect nach `X` auf? | **Nein**, `rc=0`. Seatbelt vermittelt ihn als `network-outbound`. **Das tragende Argument der Übergabe für den Socket war falsch** |
| Was hält ihn auf? | `(deny network-outbound (literal\|subpath …))` → `rc=1`. Und: `(allow network-outbound (remote ip "*:*"))` gewährt IP-Netz und **gar keine** Unix-Sockets → `rc=1` |
| Reicht `(allow network-bind)` für einen Testrunner? | **Nein.** `listen(2)` scheitert mit `Operation not permitted` selbst **ungefiltert**. Es braucht `network-inbound` — auch der bisherige `offen`-Modus hätte nie einen Testrunner lauschen lassen |
| Was reicht? | `network-bind` + `network-inbound` + `network-outbound`, je auf `localhost:*` |
| Lädt Kimi 0.38.0 einen projektlokalen MCP-Server? | Im `-p`-Modus **nein — weder über `stdio` noch über `http`**. Der Transport ist dort nicht die Variable, und **keels Kimi-Einspritzung war nie als funktionierend gemessen** |
| Wo liest Claude Code projektlokale MCP-Server? | `~/.claude.json` (über `claude mcp add-json -s local`) — **nicht** `.claude/settings.local.json`. `.mcp.json` wird gelesen, braucht aber eine interaktive Zustimmung |
| `sun_path` auf macOS | 104 Byte. Ein zu langer Pfad wird beim `bind` **abgeschnitten**, nicht abgewiesen. Gemessen für diese Maschine: 71 Byte, mit Luft |

## 4. Was offen blieb, benannt und nicht versteckt

Absteigend nach dem, was ich zuerst anfassen würde:

1. **Der Preis des offenen Loopbacks.** Ein gesandkastetes Kind erreicht jeden lokal lauschenden
   Dienst. Auf dieser Maschine gemessen: Ollama (`11433`), ein `llama-server` (`8766`), `adb`
   (`5037`) und mehrere Python-Dienste. **Datenpreisgabe, kein Ausbruch** — der Ausbruchsweg ist
   zu. Aber `adb` etwa erlaubt Kommandos auf einem angeschlossenen Android-Gerät, und das ist
   mehr als Lesen. Bewusst in Kauf genommen, im Modul kommentiert, nicht geschlossen.
2. **`bind(0.0.0.0)` gelingt unter der localhost-Filterung.** Ob ein Rechner aus dem LAN dort
   tatsächlich ankommt, ist **nicht** gemessen — `network-inbound` ist auf `localhost` gefiltert
   und sollte den Accept abweisen. Als Annahme geführt. **Das gehört gemessen.**
3. **Unix-Sockets sind jetzt in beiden Modi zu.** Ein Werkzeug, das einen braucht (Docker über
   `/var/run/docker.sock`, ein Gradle- oder Sprachserver-Daemon), scheitert — laut, nicht als
   Hänger. Wer die Regel dafür erweitert, öffnet denselben Weg zu keels MCP-Server wieder.
4. **Kimis `stdio`-Eintrag ist unbewiesen.** Er wird geschrieben, und dass Kimi ihn lädt, ist
   nicht gemessen (siehe §3). Das war vor Paket D nicht anders.
5. **Die restart-überlebende Sitzung** bleibt unerreichbar — jetzt, weil der Socketpfad je
   App-Start wechselt, vorher, weil der Schlüssel rotierte. Wirkung gleich, Mechanismus anders.
6. **Zellen-Scoping.** Darf Sitzung A den Lauf von Sitzung B über `keel_zelle_ergebnis` auslesen?
   Heute ja. Nach Paket D eine Frage zwischen Sitzungen desselben Menschen und **kein
   Ausbruchsweg mehr**. Benannt, nicht gebaut.

**Unverändert offen aus Paket C** (nichts davon wurde angefasst): ein Abbruch erreicht kein
laufendes Kommando und `detached: true` lässt eine Prozessgruppe verwaist weiterlaufen · die
Git-Vorbedingung gilt für jeden Lauf, auch rein lesende · `package.json` schreibbar · `.claude/`
schreibbar · `(allow mach-lookup)` ungefiltert · ein `"` im Projektpfad bricht `sandbox-exec` ab.
**Punkt 1 dieser Liste ist weiterhin der einzige Restposten mit Alltagsschmerz.**

## 5. Die Teststrecke lädt die Engine jetzt selbst vor — erledigt 2026-09-01

`~/keel-teststrecke/neuer-lauf.sh` ruft `flutter precache`, **bevor** es den Baum anlegt, und
bricht ab, wenn das scheitert. Fehlt `flutter` ganz, warnt es laut und macht weiter — das Skript
legt einen Baum an, es entscheidet nicht über die Maschine.

Der Grund gehört dazu, sonst nimmt ihn die nächste Aufräumrunde wieder heraus: keels Sandkasten
gibt nur vier Dateinamen unter `$FLUTTER_ROOT/bin/cache` frei und **nicht** den Baum darunter
(dort liegen `dart-sdk/bin/dart` und ausführbare Bibliotheken, die der Mensch danach ohne
Sandkasten aufruft — das `.gradle`-Muster). Fährt ein Lauf gegen eine leere Engine, will
`flutter` sie nachladen, darf nicht schreiben und **wartet bis zur Wanduhr, statt zu scheitern**.
Das sähe wie ein langsames Modell aus und verbrennte das ganze Zeitbudget ohne eine Meldung.

Mit einem echten Lauf des Skripts geprüft (`bash -n` grün, Baum angelegt, Spec-Prüfsumme
`5fb46fa8…`, sauberes Repo), Probebaum danach wieder entfernt. Der Grund steht auch in
`~/keel-teststrecke/README.md`.

**Anmerkung für die nächste Inferenz:** `~/keel-teststrecke/` liegt unter `/Users/cipher` und
damit ausserhalb der Vorgabe-Schreibzone. Christian hat den Schreibvorgang für genau diese zwei
Dateien freigegeben; das ist **keine** stehende Erlaubnis für das Verzeichnis.

## 6. Der Zweig

```
f38b1b3  fix(mcp): der CLI-Weg traegt, der Dateiweg nicht -- im echten Lauf gefunden
8194049  feat(sandkasten): Loopback auf, Unix-Sockets zu, Signal an Kinder
955a3b0  feat(mcp)!: die Einspritzung reicht einen Startbefehl statt eines Geheimnisses
24d7d6f  feat(mcp)!: der Server lauscht auf einem Unix-Socket, der Bearer entfaellt
775a73a  feat(mcp): der Socketpfad, mit Laengengrenze und Leichenraeumung
01e3df2  docs(paket-d): Umsetzungsplan, acht Aufgaben
123874a  docs(paket-d): Entwurf -- der MCP-Transport zieht auf einen Unix-Socket
```

Nicht gemergt. Zwei Commits tragen `!`: `AdapterContext` hat `mcpUrl`/`mcpApiKey` verloren, und
das Sandkastenprofil sagt in beiden Netzmodi etwas anderes als vorher.

## 7. Was ich beim nächsten Mal anders machen würde

- **Zwei Wege, die dasselbe Ziel bedienen, machen einander unprüfbar.** Genau derselbe Satz stand
  schon in der Paket-C-Übergabe über zwei Schutzmechanismen mit derselben Meldung. Hier waren es
  zwei Einspritzungswege, und der Preis war ein falscher Satz im Code, der drei Wochen lang wie
  eine Messung aussah.
- **Mein `grep` nach den Bearer-Stellen fand fünf von sieben.** Zwei fand erst der Testlauf
  (`packaging-config.test.ts`, `session-create-injection-rollback-echt.test.ts`) — wieder genau
  der Fehler, vor dem der eigene Plan in §6 warnt.
- **Der `toEqual`-Wächter über `STANDARD_ZWISCHENSPEICHER` hat sich bewährt:** er hat die
  Änderung eingefordert, statt sie durchzulassen. Ein `toContain` hätte geschwiegen.

---

## 8. Der Auftrag

### Zuerst, und ohne das nichts weiter: der Zweig geht durch Christians Durchsicht

Acht Commits, zwei davon mit `!`. Zwei Dinge gehören ausdrücklich vor einen Merge, weil sie
Abwägungen sind und keine Fehler:

1. **Der offene Loopback** (§4.1). Ein gesandkastetes Kind erreicht jetzt Ollama, llama-server
   und `adb` — letzteres erlaubt Kommandos auf einem angeschlossenen Android-Gerät. Das ist der
   Preis dafür, dass ein Lauf seine eigenen Tests fahren kann. Christian trägt ihn, nicht ich.
2. **Unix-Sockets sind in beiden Modi zu** (§4.3). Docker über `/var/run/docker.sock` scheitert
   damit im Sandkasten — laut, nicht als Hänger. Auf dieser Maschine ist Docker nicht
   installiert, also fällt es heute nicht auf; auf einer anderen sofort.

### Danach — die Empfehlung, nicht eine Liste von Möglichkeiten

**Die Teststrecke fahren.** Alles, was sie braucht, existiert jetzt zum ersten Mal: Flutter ist
da, der Sandkasten lässt Tests zu, die Engine wird vorgeladen, keels Werkzeuge sind erreichbar
und der Sandkasten kommt nicht an sie heran. Paket C und Paket D waren beide Vorarbeit dafür —
und das Überziel („trägt die billige Ebene die Arbeit?") ist bisher **nicht einmal gemessen**.

Zwei Dinge davor, beide klein und beide Messungen, keine Bauarbeiten:

- **Ist `keel-qwen38:27b` auf dem DGX dasselbe Gewicht wie der Tag im Referenzlauf?** Die Namen
  legen es nahe, gemessen ist es nicht. Die ganze Aussage „gleiches Modell, anderer Harness"
  hängt daran — ohne diese Prüfung vergleicht die Strecke womöglich zwei Modelle und nennt es
  Harness-Qualität. Steht seit der Paket-C-Übergabe offen.
- **Der DGX ist ausgeschaltet.** Er wird für die untere Ebene gebraucht (`spark-*`), sonst nicht.
  Christian schaltet ihn ein, wenn man es ihm sagt.

### Wovon ich abraten würde, und warum

Der offene Punkt 1 aus Paket C (ein Abbruch erreicht kein laufendes Kommando; `detached: true`
lässt eine Prozessgruppe verwaist weiterlaufen) ist weiterhin der einzige Restposten mit
**Alltagsschmerz** — und genau deshalb wird man ihn in der ersten Teststrecken-Sitzung wirklich
spüren, statt ihn zu schätzen. Ein Fahren-und-dann-Reparieren ist hier besser als andersherum:
ein 50-Stunden-Lauf, den man nicht abbrechen kann, ist eine andere Dringlichkeit als eine Zeile
in einer Liste.

**Was in jeden Aufgabenbrief gehört**, unverändert aus §7 und der Paket-C-Übergabe: `npm run
lint` mitlaufen lassen · Listen messen statt abschreiben · bei jeder neuen Grenze fragen
*scheitert das laut, oder wartet es?* · und **zwei Wege, die dasselbe Ziel bedienen, machen
einander unprüfbar** — dieses Paket hat den Satz teuer bezahlt.
