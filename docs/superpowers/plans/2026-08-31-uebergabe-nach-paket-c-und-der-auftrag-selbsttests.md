# Übergabe nach Paket C — und der Auftrag: Selbsttests richtig ermöglichen

**Stand:** 2026-08-31 · `main` bei `9860a06`, Arbeitsbaum sauber · **3077 Tests** in 222 Dateien,
`typecheck`, `lint` und `test` grün · kein offener Zweig.

Vorgänger: `2026-08-30-uebergabe-nach-transport-und-zweitem-harness.md`.

Diese Datei hat zwei Teile. **§1–4 berichten**, was gebaut und gemessen wurde. **§5 ist ein
Auftrag** — Christians Anweisung dazu war: *„lieber gleich richtig"*, also nicht die kleine
Reparatur, sondern die Frage an der Stelle beantworten, wo sie sitzt.

---

## 1. Paket C ist gebaut, gemergt und durch einen echten Lauf belegt

keels eigene Schleife hatte elf Werkzeuge, alle lesend. Sie hat jetzt drei wirkende:
`datei_schreiben`, `datei_loeschen`, `shell_ausfuehren`.

**Der Aufbau in einem Satz:** zwei Schichten, die einander nicht berühren — `pfadwache.ts` prüft
die **Argumente** der In-Prozess-Werkzeuge, macOS-Seatbelt (`sandkasten.ts`) prüft den
**Kindprozess** der Shell. Dazwischen ein Tor (`tor.ts`), das sein Urteil ins Protokoll schreibt
(`tool.entschieden`). Ein Zug mit einem wirkenden Aufruf läuft sequenziell. Ein Lauf startet nur
über einem sauberen Git-Repo.

**Der Beweis war ein Lauf in der echten App, keine grüne Suite:** eine App gebaut, `npm install`
durchgebracht, Tests gefahren, einen Schreibversuch ausserhalb der Wurzel kassiert
(`tool.entschieden` · `erlaubt: false` · Datei nie entstanden · Lauf lief weiter), `.git`
durchgehend unberührt.

### Was ausschliesslich der echte Lauf gefunden hat

Drei Dinge, die keine Testsuite hätte zeigen können:

1. **Der Preset-Rumpf sagte dem Modell die Unwahrheit.** *„Du kannst nichts schreiben und nichts
   ausführen"* stand im **stabilen Präfix**, während die Werkzeuge verdrahtet waren — und das
   Modell hielt sich daran: es verweigerte einen Schreibauftrag wörtlich mit *„Meine Rolle
   verbietet Schreiben: Das System-Prompt legt ausdrücklich fest…"*. Der Satz stand an **zwei**
   Stellen (`ka-body.md` und `harness-praefix-quelle.ts`); die erste wurde repariert, die zweite
   überlebte, bis der Schlussreview sie fand. Es gibt jetzt einen Wächter über **beiden** Quellen.
2. **Die TMPDIR-Schreiberlaubnis hat nie gegriffen.** `os.tmpdir()` gibt `/var/folders/…`, `/var`
   ist ein Symlink auf `/private/var`; Seatbelt vergleicht kanonische Pfade. Unsichtbar war es,
   weil die Testfixture aus einem *anderen* Grund schon `realpathSync` benutzte. Jetzt werden alle
   fünf Kontextpfade aufgelöst, bevor sie ins Profil gehen.
3. **`~/.gradle` war als Zwischenspeicher gelistet** — Gradle führt aber `init.d/*.gradle` bei
   jedem späteren Aufruf aus, in der Sitzung des Menschen, ohne Sandkasten. Verengt auf
   `.gradle/caches` und `.gradle/wrapper`.

### Die Regel, an der alles hängt

**SBPL entscheidet nach der zuletzt passenden Regel** — aber nur zwischen *gleichartig gefilterten*
Regeln. Eine gefilterte Regel schlägt eine ungefilterte unabhängig von der Textstelle. Beides ist
gemessen (§4), beides steht im Modulkopf, und ein Wächter hält die Ordnung „alle Erlaubnisse zuerst,
alle Verbote zuletzt". Die erste Fassung hatte es umgekehrt: `.env`, `id_rsa*` und `*.pem` unter der
Projektwurzel waren **beschreibbar**, und keine Textprüfung konnte es sehen, weil die Zeile dastand.

---

## 2. Flutter ist installiert, die Teststrecke steht bereit

**Flutter 3.47.2** (stable), `/opt/homebrew/share/flutter`, `flutter` und `dart` in
`/opt/homebrew/bin` — also in `EXTRA_PATHS` von `exec-util.ts`, der Kindprozess findet sie.

**Web ist eingeschaltet** (`flutter config --enable-web`). Ein gebautes Beispiel wurde in Chrome
geöffnet, es rendert und reagiert (Zähler 0 → 1 nach Klick). Damit ist ein Ergebnis **ansehbar,
ohne Xcode** — `flutter run -d chrome`. Xcode (~15 GB) fehlt weiter und ist nur für native
macOS-/iOS-Ziele nötig; die Android-cmdline-tools ebenso für Android. Beides bewusst nicht
installiert.

**`~/keel-teststrecke/`** — Christians Entscheidung, ausserhalb von Nextcloud, weil ein Flutter-Lauf
hunderte MB `.dart_tool/` und `build/` erzeugt, die sonst auf jedes Gerät synchronisiert würden.

```
~/keel-teststrecke/
  README.md            die Konvention, und warum hier und nicht im Hub
  neuer-lauf.sh        legt einen Baum an: SPEC.md + git init + Ausgangs-Commit
  referenz/
    SPEC.md            5fb46fa8…
    prompt.txt         der Auftragstext, wortgleich aus dem Referenzlauf
    morphcook/         das Vergleichsrepo, 113 MB
  unten-spark-qwen38-27b-20260831-1925/   ein erster Baum, bereit
```

### Die Teststrecke ist ein schärferes Experiment geworden, als sie geplant war

Der alte Plan wählte die Prüfsumme `4108b23d…` mit **drei** Implementierungen. **Die gibt es nicht
mehr** — das Repo hat inzwischen 25 Verzeichnisse, und **20 davon tragen dieselbe Spec**
(`5fb46fa8…`, 555 Zeilen, ~5.900 Token, passt in jedes Fenster der Registry).

Der eigentliche Fund liegt aber woanders: **`referenz/morphcook/qwen-3.8-27b/` ist ein Lauf
desselben Modells, das keel lokal fährt** (`keel-qwen38:27b` auf dem DGX) — **unter `opencode` als
Harness**, mit `opencode.jsonc` und `prompt.txt` daneben. Die Datei ist Christians eigene Arbeit vom
2026-08-24 und dokumentiert sogar die NVFP4-Umstellung.

Der alte Plan nannte den Vergleich mit dem Repo *„indikativ, nicht streng"*, weil die Referenzen
unter anderen Harnessen liefen. **Für diesen einen Fall ist das kein Nachteil mehr, sondern der
Punkt:** gleiches Modell, anderer Harness. Das trennt Harness-Qualität von Modell-Qualität — die
Frage, auf der keels Prämisse steht. Die drei Varianten `-27b`, `-27b-128k`, `-27b-256k` zeigen
zusätzlich, was allein das Kontextfenster ausmacht.

**Ungeprüft:** ob `keel-qwen38:27b` auf dem DGX wirklich dasselbe Gewicht ist wie der Tag im
Repo-Lauf. Die Namen legen es nahe, gemessen ist es nicht. **Das gehört gemessen, bevor daraus eine
Aussage wird.**

**Der DGX ist ausgeschaltet.** Er wird für die untere Ebene gebraucht (`spark-*`), sonst nicht;
obere Ebene (Claude Code CLI) und Mitte (OpenRouter) laufen ohne ihn. Christian schaltet ihn ein,
wenn man es ihm sagt.

---

## 3. Was offen blieb, benannt und nicht versteckt

Aus dem Schlussreview und dem Beweislauf, absteigend nach dem, was ich zuerst anfassen würde:

1. **Ein Abbruch erreicht kein laufendes Kommando.** `u.abgebrochen()` wird einmal je Zug geprüft,
   nie in `fuehreAus` oder `starte`. Wer abbricht, wartet bis zur Wanduhr — bis zu 15 Minuten. Und
   `detached: true` (richtig für den Gruppenkill) heisst: **beendet man keel mitten im Kommando,
   läuft die Prozessgruppe verwaist weiter, ohne jede Uhr**, denn der Timer starb mit dem
   Elternprozess. Das ist der einzige Restposten mit Alltagsschmerz.
2. **Die Git-Vorbedingung gilt seit der Verdrahtung für *jeden* Lauf**, auch rein lesende — weil
   `baueWerkzeugRegistry()` die einzige Registry ist und die drei wirkenden Werkzeuge immer trägt.
   Spec-konform, nicht beabsichtigt. Drei Verengungswege stehen in der Spec (§7).
3. **`package.json` ist schreibbar** — ein Lauf kann sich ein `preinstall`/`postinstall` schreiben
   und *dann* den Paketbefehl rufen, der Netz gewährt. Ehrlich dokumentiert, nicht geschlossen.
4. **`.claude/` ist schreibbar** — ein Lauf kann eine Fähigkeit hinterlegen, die der *nächste* in
   seinen stabilen Präfix lädt. `faehigkeiten.ts` warnt namentlich vor genau dieser Klasse.
5. **`(allow mach-lookup)` ist ungefiltert** — die einzige tragende Zeile im Profil ohne begründenden
   Kommentar. Nicht ausgenutzt, nicht gemessen, als Annahme zu führen.
6. **Ein `"` im Projektpfad** bringt `sandbox-exec` zum Abbruch (`unbound variable`). Fail-closed
   und benannt.
7. **Kein Test belegt, dass `offen` ein IP-Ziel erreicht** — der Netztest läuft seit der Fix-Welle
   über einen Unix-Socket, um offline zu funktionieren. Die ungetestete Richtung ist fail-closed.

---

## 4. Gemessene Tatsachen über Seatbelt, damit sie niemand zweimal erkaufen muss

Alles auf Darwin 25.4, 2026-08-30/31. **Diese Liste ist der wertvollste Teil dieser Übergabe.**

| Frage | Antwort |
|---|---|
| Reihenfolge zweier gleichartig gefilterter Regeln | **die letzte gewinnt** (`deny .env` vor `allow write <wurzel>` → Überschreiben gelang; danach → `Operation not permitted`) |
| Gefilterte Regel gegen ungefilterte | **die gefilterte gewinnt, unabhängig von der Textstelle** (ein `(deny network-outbound)` *nach* `(allow network-outbound (remote ip "localhost:*"))` ändert nichts) |
| `link(2)` von aussen in die Wurzel | **abgewiesen** — Seatbelt mediiert die *Quelle*. Gegenprobe: `ln` innerhalb der Wurzel geht (rc 0, 2 Namen). Der Hardlink-Angriff auf das nicht-gesandkastete `datei_schreiben` scheitert am ersten Schritt |
| Portgenaue Loopback-Regel | **gibt es nicht.** `(remote ip "127.0.0.1:8802")` ist ein Syntaxfehler; `(remote ip "*:8802")` und `(remote tcp …)` werden akzeptiert und **greifen nicht**. Loopback ist ganz zu oder ganz auf |
| `#"…"`-Regex-Literal | **hat keine String-Schicht.** `\\` *ist* der Rückstrich; vier machten die Regel still unwirksam. Gemessen mit einem Verzeichnis `b\c`: `\\` traf, `\\\\` nicht |
| `(allow signal (target self))` | reicht **nicht**, sobald ein Werkzeug seinen Kindprozess beendet — es **hängt** dann. Mit `(target children)`: 1 s statt 2:29 min |
| `os.tmpdir()` im Profil | muss **aufgelöst** werden, sonst greift die Erlaubnis nie (§1) |

---

## 5. Der Auftrag: Selbsttests ermöglichen, und die Schlüsselfrage dort beantworten, wo sie sitzt

### Die Anforderung

Christian, wörtlich: *„eigene tests sind doch wohl teil des 'cipher-keel-entwicklungsprozesses' —
ohne das lässt sich das doch nicht testen?!?"* — und auf den Vorschlag, es klein zu flicken:
**„lieber gleich richtig"**.

Ein Lauf, der seine Tests nicht fahren kann, entwickelt nicht; er liefert ab und hofft. Das ist
derselbe Einwand, der schon den Schnitt von Paket C gedreht hat.

### Was gemessen ist

`flutter test` läuft im Sandkasten **vollständig durch**, sobald vier Dinge stimmen — gemessen mit
einem echten Flutter-Projekt, Ergebnis `rc=0`, „All tests passed", 1 Sekunde, identisch zu
ausserhalb:

1. **`(allow signal (target children))`** — sonst besteht der Test und der Abbau hängt 2:29 min bis
   zur Wanduhr. Das betrifft **jeden** Testrunner, der einen Kindprozess verwaltet, nicht nur Dart.
2. **`~/.dart-tool`** in die Zwischenspeicher. Nebenbei: **`~/.dart` und `~/.flutter` existieren auf
   dieser Maschine gar nicht** — zwei Einträge der Liste sind aus der Doku abgeschrieben statt
   gemessen.
3. **Vier Dateinamen unter `$FLUTTER_ROOT/bin/cache`** — `engine.stamp`, `engine.realm`,
   `engine.stamp.tmp.<pid>`, `lockfile`. **Nicht den Baum freigeben:** dort liegen `dart-sdk/bin/dart`
   und ausführbare Bibliotheken, die der Mensch danach aufruft — exakt das `.gradle`-Muster.
   Ausserdem `flutter precache` in den Aufbau, sonst **hängt** der erste Lauf beim Nachladen der
   Engine-Artefakte, statt zu scheitern.
4. **Loopback** — der Dart-Testrunner öffnet einen Server-Socket auf `127.0.0.1`. Ohne ihn:
   `Failed to create server socket (OS Error: Operation not permitted)`.

Punkt 1–3 sind unstrittig und klein. **Punkt 4 ist die Entscheidung.**

### Warum Loopback nicht die Schwachstelle ist

Loopback zu öffnen heisst: das Kind erreicht jeden lokal lauschenden Dienst — Ollama auf `11433`,
Postgres, und **keels eigenen MCP-Server**. Dessen Bearer liegt im Projektbaum, den das Kind lesen
darf. Nachgeprüft: in diesem Repo liegt `.claude/settings.local.json` mit einem lebenden
`Authorization`-Header. Das Leck ist real, nicht hypothetisch.

Und Seatbelt kann den einen Port **nicht** aussperren (§4).

**Aber die Schwachstelle ist nicht das Loopback — sie ist ein unbefristeter Schlüssel in einer
lesbaren Datei, der jede Zelle beauftragen darf.** Genau das hat Paket B als offene Frage **B5**
selbst notiert (`2026-08-30-naechste-schritte-harness-wahl-und-mcp-transport.md`, Zeile 128):

> *„Heute kann `keel_zelle_beauftragen` **jede** Zelle adressieren und `keel_zelle_ergebnis`
> **jeden** Lauf der Protokolldatenbank auslesen. Solange niemand rufen konnte, war das folgenlos.
> Mit B1 bis B4 ist es das nicht mehr. Zu entscheiden: darf jede Sitzung jede Zelle beauftragen,
> oder bindet der Schlüssel an eine Sitzung?"*

Den Sandkasten zu verbiegen, um einen falsch geschnittenen Schlüssel zu schützen, kostet die
Selbsttests und lässt das eigentliche Problem stehen. **Also: B5 beantworten, dann Loopback öffnen.**

### Die Wahl, die zu treffen ist — und sie gehört besprochen, nicht geraten

Drei Richtungen, keine davon gebaut:

- **Unix-Socket statt TCP.** Der MCP-Server lauscht auf einem Socket im `userData`-Verzeichnis
  statt auf `127.0.0.1`. `userData` ist im Sandkastenprofil beidseitig gesperrt — das Kind kommt
  nicht heran, egal wie offen das Loopback ist. Konzeptionell am saubersten, weil die Grenze dann
  am Dateisystem hängt, wo der Sandkasten ohnehin stark ist. Zu prüfen: ob die CLI-Harnesse
  (Claude Code, Kimi) einen Unix-Socket als MCP-Transport überhaupt annehmen — **nachsehen, nicht
  annehmen.**
- **Ein Schlüssel je Sitzung statt einer je App-Start.** Der Bearer bindet an die Sitzung, die ihn
  bekommen hat; `keel_zelle_beauftragen` prüft, ob die rufende Sitzung die Zelle überhaupt
  adressieren darf. Beantwortet B5 wörtlich und schliesst zusätzlich den Fall „Schwestersitzung
  liest fremde Läufe". Teurer, aber es ist die Frage, die Paket B gestellt hat.
- **Beides.** Der Socket schliesst den Weg, das Scoping die Befugnis. Sie lösen verschiedene
  Probleme: der Socket verhindert den *Zugriff*, das Scoping begrenzt den *Schaden*, wenn der
  Schlüssel doch einmal abhandenkommt.

### Der Zuschnitt, den ich vorschlagen würde

**Ein Paket, zwei Teile, in dieser Reihenfolge:**

1. **B5 beantworten und bauen** (Entwurf mit Christian, dann Umsetzung). Ohne das ist Teil 2 nicht
   verantwortbar.
2. **Die vier Sandkasten-Punkte**, davon drei mechanisch (Signal an Kinder, `.dart-tool` statt
   `.dart`/`.flutter`, die vier `bin/cache`-Namen plus `flutter precache` im Aufbau) und einer als
   Folge von Teil 1 (Loopback).

**Was dabei nicht vergessen werden darf**, aus den Fehlern dieser Strecke:

- **`npm run lint` gehört in jeden Aufgabenbrief.** Auf dem Paket-C-Zweig lief es fünf Aufgaben lang
  nicht mit, weil es in den Briefs stand — der Zweig war seit Task 5 lint-rot.
- **Eine Liste wie `STANDARD_ZWISCHENSPEICHER` wird gemessen, nicht abgeschrieben.** Zwei ihrer
  Einträge existieren auf dieser Maschine nicht.
- **Ein `grep` nach Terminzusagen reicht nicht.** In Task 9 fand das vorgegebene Suchmuster einen
  von sechs Treffern; vier trugen kein Suchwort, und der wichtigste stand im *Prompt*, nicht im Code.
- **Ein Hänger ist schlimmer als ein Fehlschlag.** Zwei der drei Flutter-Blocker äusserten sich als
  stilles Warten bis zur Wanduhr. Wo eine neue Grenze gezogen wird, gehört gefragt: *scheitert das
  laut, oder wartet es?*
- **Zwei Schutzmechanismen, die dieselbe Meldung ausgeben, machen einander unprüfbar.** Das kostete
  in Task 7 eine Mutationsprobe, die grün blieb und nichts bewies.

---

## 6. Unverändert offen aus den Vorgängerübergaben

GPU-Reload-Probe noch nicht gefallen · Little-Snitch-Regel nach einem `npm ci` weiter ungeprüft ·
unsigniert und nicht notarisiert · Leerlauf-RAM und Kaltstart unvermessen · Codex- und
Gemini-Adapter · die neustart-überlebende MCP-Sitzung · Kimis erster echter Start ist weiterhin
**nicht** gefahren · `opencode` ist auf dieser Maschine nicht installiert — was inzwischen doppelt
interessant ist, weil der beste Referenzlauf der Teststrecke genau damit gefahren wurde.
