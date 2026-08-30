# Paket C: der Sandkasten, und Schreiben, Löschen und Ausführen darin

**Stand:** 2026-08-30, `main` bei `00eb0c2`, Arbeitsbaum sauber. Entwurf, nichts gebaut.
Vorgänger: `2026-08-30-uebergabe-nach-transport-und-zweitem-harness.md` §3 und
`../plans/2026-08-30-teststrecke-morphcook.md` §4.

Christians Entscheidungen dieser Sitzung, in der Reihenfolge, in der sie fielen:

1. *„C1 Schreiben zuerst, C2 Shell danach"* — **später von ihm selbst gekippt**, siehe §1.
2. *„Dieselbe Wurzel wie beim Lesen, aber nur bei sauberem Arbeitsbaum"*.
3. *„Regeln entscheiden, das Protokoll trägt es"* — keine menschliche Freigabe je Schreibvorgang.
4. *„warum hört sich das alles so an als sollte man einfach den sandkasten vorziehen? — ziel ist,
   dass der keel prozess software entwickelt - nicht das simuliert"*.
5. *„sandbox-exec (Seatbelt), Toolchains auf dem Host"*.
6. *„Netz zu, ausser fuer benannte Paketbefehle"*.

---

## 1. Der Schnitt, und warum er nach der ersten Antwort ein anderer wurde

Der erste Vorschlag zerlegte Paket C in **C1** (Schreiben, Entscheidungsstelle, Single-Writer,
ohne Prozess und darum ohne Sandkasten) und **C2** (Shell und Sandkasten). Christian wählte
zunächst C1 — und kippte es zwei Fragen später, als jede Antwortliste dieselbe Form hatte: eine
zerstörende Fläche, gerahmt als Risiko, mit dem Sandkasten als Trost in der Zukunft.

**Sein Einwand trifft, und die Begründung gehört hierher, nicht in eine Fussnote.** Ein Lauf, der
schreiben, aber nicht bauen und nicht testen kann, entwickelt keine Software — er erzeugt
Textdateien und erfährt nie, ob sie etwas taugen. Und jede Fläche, die C1 als „gefährlich" nach
hinten schob (Löschen, freie Shell), ist genau die, die der Sandkasten trägt. Die Aufteilung
sortierte also das Risiko vor die Absicherung.

**Also ein Bogen:** `sandkasten.ts` zuerst, dann die drei Werkzeuge hinein. Die vorgezogene
Reihenfolge ist damit die, die in der ersten Frage als dritte Option stand und aus einem falschen
Grund verworfen wurde („der Sandkasten wird ohne einen echten Nutzer entworfen") — der Einwand
war formal richtig und praktisch unerheblich, weil die Nutzer (`datei_schreiben`,
`datei_loeschen`, `shell_ausfuehren`) im selben Bogen entstehen und den Rand mitformen.

---

## 2. Zwei Schichten, die einander nicht berühren

Der tragende Schnitt steht bereits, wörtlich, im Kopf von `pfadwache.ts`:

> *„It is not an execution boundary and does not replace one. It holds as long as no tool starts a
> process. When the shell arrives the sandbox arrives with it, and this stays alongside: it checks
> tool arguments, the sandbox checks the process."*

Daraus folgt eine Aufteilung, die nicht zu erfinden, sondern nur einzuhalten ist:

| | läuft wo | wird geprüft von |
|---|---|---|
| `datei_lesen`, `verzeichnis_listen`, `inhalt_suchen`, **`datei_schreiben`**, **`datei_loeschen`** | im Electron-Hauptprozess, in-Prozess | **Pfadwache** — Argumentprüfung |
| **`shell_ausfuehren`** | eigener Kindprozess | **Seatbelt** — Kernelgrenze über dem Prozess |

Die In-Prozess-Werkzeuge *können* nicht in den Sandkasten: sie laufen im Hauptprozess, und der
darf schreiben, wohin keel schreiben muss (`harness.db`, Konfiguration, Transkripte). Ein Seatbelt
um den Hauptprozess wäre ein Sandkasten um keel, nicht um den Lauf. Deshalb bleibt für sie die
Pfadwache die Grenze — und das ist kein Kompromiss, sondern ihre eigentliche Aufgabe: gegen ein
Pfadargument, das das Werkzeug selbst auflöst, ist eine Prüfung die Sache selbst.

**Die Pfadwache sieht ein Shell-Kommando nicht einmal an.** Kein Parsen, keine Positivliste
erlaubter Befehle, keine Argumentprüfung am Kommando. Ihr eigener Kopf nennt den Grund: gegen
`$(…)` und ein umgeschriebenes npm-Skript ist eine Zeichenkettenprüfung Theater. Wer sie hier
anwendete, bekäme das Gefühl von Sicherheit ohne die Sache.

### Was das für die Kommando-Freiheit heisst

**`shell_ausfuehren` nimmt ein beliebiges Kommando.** Es gibt keine Liste erlaubter Befehle. Der
Sandkasten ist die Grenze, und eine Liste daneben wäre die Prüfung, gegen die eben argumentiert
wurde.

Die Liste der Paketbefehle in §4.3 ist **kein** Gegenbeispiel: sie entscheidet nicht, *ob* ein
Kommando laufen darf, sondern *unter welchem der zwei Profile*. Ein nicht gelistetes Kommando
läuft — nur ohne Netz. Verwechselt man die beiden, entsteht genau die Positivliste, die hier
abgelehnt wird, und sie hätte dann Sicherheitsgewicht zu tragen, das sie nicht trägt.

---

## 3. Was gemessen ist, bevor irgendetwas gebaut wird

Sechs Läufe gegen `sandbox-exec` auf Darwin 25.4, alle am 2026-08-30. Der Beweis ist ein Lauf,
kein Test — dieselbe Regel wie bei Paket B.

| Probe | Ergebnis |
|---|---|
| Schreiben **im** erlaubten Baum | geht |
| Schreiben **ausserhalb** | `Operation not permitted`, die Datei entstand nie |
| `rm -rf` auf einen fremden Baum | abgewiesen, Inhalt überlebte wortgleich |
| `~/.ssh/id_rsa_openclaw` lesen | abgewiesen (`deny file-read*`, Subpath) |
| `~/.cipher-*.env` lesen | abgewiesen (`deny file-read*`, Regex) |
| Netz ohne / mit `allow network-outbound` | `http=000` / `http=200` |
| Schreiben in `<wurzel>/.git` | abgewiesen, `HEAD` unverändert |
| `rm -rf <wurzel>/.git` | abgewiesen |

**Kein Deprecation-Rauschen auf stderr.** Apple nennt `sandbox-exec` seit Jahren „deprecated" und
liefert es seit Jahren mit; auf dieser Maschine warnt es nicht. Das ist eine Beobachtung, keine
Zusage für kommende macOS-Versionen — siehe §10.

### Der Fund, der aus dem Lauf kam und nicht aus dem Entwurf

Ein Leseverbot auf `.env` deckt nur `file-read*`. Gemessen:

```
d) .env lesen           : Operation not permitted
e) .env ueberschreiben  : rc=0        <-- erlaubt
```

Ein Lauf konnte die `.env` also **vernichten, ohne sie je gelesen zu haben** — die Regel schützte
die Vertraulichkeit und nicht die Datei. Mit `(deny file-read* file-write* (regex …))` daneben,
sauber nachgestellt:

```
Versuch: echo zerstoert > <wurzel>/.env  ->  Operation not permitted
Inhalt danach: GEHEIM=original
```

**Das ist Vertragsbestandteil, nicht Anekdote:** jede Regel, die ein Geheimnis vor dem Lesen
schützt, schützt es auch vor dem Schreiben. Ein Wächter-Test hält das fest (§9).

---

## 4. `sandkasten.ts` — neu

### 4.1 Die Bauform: eine reine Funktion und ein dünner Starter

```ts
export function profilText(ktx: SandkastenKontext, netz: NetzModus): string
export function starte(kommando: string, ktx: SandkastenKontext, netz: NetzModus): Promise<Lauf>
```

**Das Profil wird als Text erzeugt und über `sandbox-exec -p` inline übergeben** — nicht als Datei
mit `-D`-Parametern. Drei Gründe, und der erste wiegt am schwersten:

1. `profilText` ist **rein und ohne einen einzigen Prozessstart testbar**. Die Regeln des
   Sandkastens sind damit prüfbar wie die der Pfadwache — und sie sind der Teil, der falsch sein
   kann.
2. Kein temporäres Profil auf der Platte, das selbst einen sicheren Ort und eine Aufräumzusage
   bräuchte.
3. Die Verbote sind **Regexe über Pfaden** (§4.2). Die als `-D`-Parameter zu bauen hiesse, sich
   auf `string-append` in SBPL zu verlassen; erzeugter Text hat diese Abhängigkeit nicht.

Der Preis ist Maskierung: ein Projektpfad mit `"` oder `\` muss beim Einsetzen entwertet werden,
und dieselbe Zeichenkette wird einmal als SBPL-Literal (`(subpath "…")`) und einmal als
SBPL-Regex (`#"^…"`) eingesetzt — **zwei verschiedene Entwertungsregeln**. Sie bekommen zwei
Funktionen mit je eigenen Tests, nicht eine mit einem Schalter.

### 4.2 Das Profil

```
(version 1)
(deny default)

; Prozesse duerfen starten — sonst laeuft kein Build-Werkzeug
(allow process-exec* process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)

; Lesen: grundsaetzlich ja — die Verbote unten ueberstimmen das
(allow file-read*)

; Schreibziele: die Wurzel und die Zwischenspeicher (4.4)
(allow file-write* (subpath "<wurzel>"))
(allow file-write* (subpath "<tmpdir>"))
(allow file-write* (subpath "<zwischenspeicher-1>") …)
(allow file-write-data (literal "/dev/null"))

; ── Ab hier nur noch Verbote, und keine Erlaubnis darf ihnen folgen ──
(deny file-read* file-write*
  (subpath "<heim>/.ssh")
  (subpath "<userData>")
  (regex #"^<heim>/(.*/)?\.cipher-")
  (regex #"^<heim>/(.*/)?\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$")
  (regex #"^<wurzel>/(.*/)?\.env(\..*)?$")
  (regex #"^<wurzel>/(.*/)?(id_rsa|id_ed25519|id_ecdsa|id_dsa)$")
  (regex #"^<wurzel>/(.*/)?[^/]*\.(pem|key|p12|keystore|jks)$"))

; Die Verwaltung des Rueckwegs ausdruecklich nicht
(deny  file-write* (regex #"^<wurzel>/(.*/)?\.git(/|$)"))
```

**Die Reihenfolge ist die Aussage, nicht das Vorhandensein der Zeile.** Der erste Entwurf stellte die Verbote nach oben — nach dem Muster von M8 §4.6 und der Pfadwache, wo *„deny rules never yield to an allow rule"* gilt. **SBPL funktioniert nicht so.** Beim Bau von Paket C gemessen, mit zwei Profilen, die sich nur in der Reihenfolge zweier Zeilen unterschieden:

```
deny .env  VOR  allow file-write* <wurzel>   ->  echo zerstoert > .env  gelingt
deny .env  NACH allow file-write* <wurzel>   ->  Operation not permitted, Inhalt unveraendert
```

Seatbelt entscheidet nach der **zuletzt passenden** Regel. Ein Verbot vor einer umfassenderen Erlaubnis sieht im Profiltext aus wie Schutz und ist keiner — und zwar unsichtbar für jede Prüfung, die nur fragt, ob die Zeile da ist. Deshalb: alle Erlaubnisse zuerst, alle Verbote zuletzt, und ein eigener Wächter, der genau diese Ordnung hält.

**Jede dieser Regeln trägt `(.*/)?`, und das ist beim Review aufgefallen, nicht beim Entwurf.** Die erste Fassung sperrte nur direkte Kinder — die Pfadwache prüft aber den **Basename** und `istIn(pfad, heim)`, also jede Tiefe (`pfadwache.ts:99-101`), und ihr `.git`-Verbot trifft *jedes* Segment mit diesem Namen. Ein Sandkasten, der nur `<wurzel>/.git` schützt, lässt das `.git` eines Submoduls offen und ist damit schwächer als die Wache, die er spiegeln soll. Gegen echtes `sandbox-exec` nachgemessen: mit `(.*/)?` fallen verschachteltes `.git` und verschachteltes `.cipher-` beide, ohne es beide nicht.

**Die Endungsverbote sind auf die Wurzel und das Heimverzeichnis verankert, nicht global.** Ein
globales `deny` auf `*.pem` sperrt `/etc/ssl/cert.pem` und bricht jedes TLS im Kindprozess — also
ausgerechnet `npm ci`. Das ist der Unterschied zwischen einer Regel, die schützt, und einer, die
den Sandkasten unbenutzbar macht und deshalb wieder herausgenommen wird.

**`.git` wird vom Schreiben ausgenommen, obwohl es unter der Wurzel liegt.** Sonst nimmt ein
`git reset --hard` oder ein verirrtes `rm -rf` genau den Rückweg weg, auf dem die Vorbedingung aus
§7 beruht — die Vorbedingung prüft beim Start, das Verbot hält sie über den ganzen Lauf. Die Folge
ist gewollt: **der Lauf kann nicht committen.** Übernehmen ist Christians Akt, mit Diff.

### 4.3 Zwei Netzmodi

`NetzModus` ist `'zu' | 'offen'`. Vorgabe ist **`zu`**: kein `allow network-*`, gemessen
`http=000`.

`offen` (`(allow network-outbound)` und `(allow network-bind)`) gilt **nur**, wenn das Kommando
gegen die Paketbefehl-Liste trifft — `flutter pub get`, `dart pub get`, `npm ci`, `npm install`,
`npm ci --omit=dev`, `pip install`, `cargo fetch`, `go mod download` und Geschwister.

**Warum das keine Zeichenkettenprüfung mit Sicherheitsgewicht ist:** trifft die Erkennung daneben,
läuft das Kommando trotzdem — nur **ohne** Netz. Der Fehlerfall ist ein scheiternder Build, kein
offener Kanal. Die Erkennung ist damit eine Bequemlichkeit, die fail-closed irrt, und genau
deshalb darf sie ungenau sein.

**Was das nicht schliesst — und die erste Fassung dieses Absatzes hat es um einen Schritt zu klein
gemacht:** ein `postinstall`-Skript läuft unter `offen` mit vollem Netz. Hier stand, das sei
dieselbe Lücke, die entsteht, wenn ein Mensch selbst `npm ci` tippt. Das stimmt nicht: der Mensch,
der `npm ci` tippt, hat die `package.json` nicht auch geschrieben. Der Lauf kann beides — er
schreibt sich ein `preinstall`/`postinstall` in die `package.json` und ruft danach den
Paketbefehl auf, der Netz freischaltet. Aus „eine fremde Abhängigkeit könnte das tun" wird damit
„der Lauf kann es selbst wollen". Der Weg ins Netz steht ihm also offen, wenn er ihn sucht; was
bleibt, ist der Rest des Profils (kein `~/.ssh`, kein `~/.cipher-*`, keine `.env`, kein `.git`,
kein Schreiben ausserhalb der Wurzel und der Zwischenspeicher). Benannt, nicht geschlossen — der
Abgleich in `PAKETBEFEHLE` wird deswegen *nicht* geändert, weil ein schärferer Abgleich denselben
Weg nicht verstellt.

**Was es schliesst, und das ist der Grund für den ganzen Modus:** `netzwache.ts` sagt über sich,
keels §1.1 rechtfertige den Verzicht auf einen Sandkasten damit, *„the only channel out is the
model endpoint"*, und sie schliesse *„the class where the destination itself is the attack: the
internal network"*. Eine Shell mit freiem Netz hebt beides auf, und zwar konkret: Paket B legt
einen gültigen MCP-Bearer **in den Projektbaum** (`.claude/settings.local.json` bzw.
`.kimi-code/mcp.json`) und lauscht auf `127.0.0.1`. Ein Kindprozess, der den Baum lesen und
`localhost` erreichen kann, hat keels zehn Werkzeuge. Dazu das Tailnet (MS-01 `100.67.95.13`, VPS,
DGX), das von dieser Maschine aus erreichbar ist.

**Seatbelt kann `100.64/10` nicht ausdrücken.** Ein Profil kann `localhost` gezielt sperren, aber
keine CIDR-Bereiche filtern. Das ist eine Grenze des Werkzeugs, keine Entwurfswahl — und der
Grund, warum die Vorgabe `zu` heisst und nicht „offen ausser innen".

**Nachgetragen am 2026-08-30:** das „kann" oben war lange nur ein Können — das gebaute Profil
sperrte `localhost` unter `offen` *nicht*, und damit war der MCP-Server aus Paket B unter jedem
Paketbefehl erreichbar, genau der Fall, den der Absatz darüber beschreibt. `(deny network-outbound
(remote ip "localhost:*"))` steht jetzt hinter den Erlaubnissen im `offen`-Zweig. Gemessen gegen
echtes `sandbox-exec`, in beide Richtungen: ohne die Zeile antwortete ein `http.createServer` auf
`127.0.0.1` mit 200, mit ihr kam 000, während `https://example.com` weiter 200 lieferte. Das
Tailnet bleibt davon unberührt — dafür bräuchte es den CIDR-Filter, den es nicht gibt.

### 4.4 Die Zwischenspeicher — eine anpassbare Fläche (CK-NFR-012)

Nur die Wurzel zum Schreiben freizugeben heisst: **jede Installation scheitert.**
`flutter pub get` schreibt nach `~/.pub-cache` und in `$FLUTTER_ROOT/bin/cache`, `npm ci` nach
`~/.npm`. Ein Sandkasten, der das verbietet, ist einer, der nach dem zweiten Fehlschlag
abgeschaltet wird.

Also eine **benannte Vorgabeliste** von Schreibzielen ausserhalb der Wurzel — `TMPDIR`,
`~/.npm`, `~/.pub-cache`, `~/.dart`, `~/.flutter`, `~/Library/Caches/…` — mit einem Eintrag in
`docs/anpassbare-flaechen.md`, wie `preise.ts` und `model/entry.ts` ihn haben.

**Zwei Dinge, die daran ehrlich bleiben müssen:**

- Die Liste ist die weichste Stelle des ganzen Sandkastens. Jeder Eintrag ist ein Loch, und die
  Liste wächst mit jeder Toolchain. Sie gehört deshalb an **eine** Stelle, sichtbar, mit
  Begründung je Eintrag — nicht verteilt und nicht stillschweigend erweitert.
- `$FLUTTER_ROOT/bin/cache` heisst: der Lauf darf in die Flutter-Installation schreiben. Das ist
  keine Nachlässigkeit, sondern was Flutter verlangt. Es steht als Wermutstropfen im Inventar,
  nicht als gelöstes Problem.

### 4.5 Zeitgrenze und Ausgabedeckel

`shell_ausfuehren` bekommt eine Wanduhrgrenze (Vorgabe 120 s, anpassbar) und einen Ausgabedeckel
in Bytes. Beides mit demselben Muster wie `werkzeug-datei.ts`: eine benannte Konstante, ein
Testsaum, eine Ablehnung mit Zahl im Text statt stillem Abschneiden.

Der Deckel ist kein Komfort: die Ausgabe geht in den Modellkontext. Ein `npm ci` mit 4 MB Ausgabe
sprengt das Fenster eines lokalen 27B-Modells in einem Zug — und dann misst die Teststrecke, wer
`--silent` erraten hat.

---

## 5. `tor.ts` — die Entscheidungsstelle

Die Übergabe nennt den Befund: `intent-vor-effekt.ts` ist **ein Prüfer, kein Tor**.
`effekteOhneIntent` hat keinen Produktionsaufrufer; die Invariante entsteht in `lauf.ts`, die
Funktion bewacht sie im Test.

**Was gebaut wird:** eine Stelle, die auch nein sagen kann, mit drei Schritten im Protokoll.

```
tool.intent   ->   tool.entschieden   ->   tool.completed | tool.failed
Ankuendigung       Entscheidung            Wirkung
```

`tool.entschieden` ist ein **neues Ereignis** in `EREIGNIS_ARTEN`, Nutzlast
`{aufrufId, name, erlaubt: boolean, grund}`. Damit gilt:

- Ein **Nein** steht im Protokoll, mit Grund. Heute ist eine Ablehnung nur an einem ausbleibenden
  Effekt zu erkennen — also gar nicht.
- `effekteOhneIntent` bekommt einen Geschwisterprüfer (`effekteOhneEntscheidung`), und **beide
  bekommen einen Produktionsaufrufer**, weil `lauf.ts` die Kette wirklich schreibt.
- Der neue Ereignistyp muss in die Farbtabelle und die Kurzfassung des Ereignis-Panels — der
  Wächter aus `tests/renderer/ereignis-panel.test.ts` fängt das Vergessen, und `skill.geladen` ist
  der Präzedenzfall, an dem es einmal schiefging.

**Woraus entschieden wird**, und mehr ist es nicht:

1. Bei `datei_schreiben` und `datei_loeschen`: die Pfadwache über dem Zielpfad. Hier sagt das Tor
   wirklich nein.
2. Bei `shell_ausfuehren`: nichts über dem Kommando (§2). Das Tor hält fest, **dass** ausgeführt
   wird, und mit welchem Netzmodus; die Grenze setzt der Sandkasten.

**Kein Schreibbudget.** Der erste Entwurf hatte eines und es ist beim Nachsehen gefallen:
`Budgets` (`budget.ts:40`) trägt `runden`, `wanduhrMs`, `kostenCent`, `kontextAnteil`, und
`pruefeBudgets` gibt einen **`Abschlussgrund`** zurück — ein erschöpftes Budget *beendet den Lauf*.
Ein Schreiblimit soll aber den einzelnen Aufruf ablehnen und den Lauf weiterlaufen lassen. Ein
fünftes Feld dort hätte also entweder die falsche Wirkung gehabt oder `Budgets` zwei verschiedene
Dinge bedeuten lassen. Und es wird nicht gebraucht: das Rundenbudget begrenzt schon, wie oft ein
Lauf überhaupt zum Zug kommt.

Ein Nein wird dem Modell als gewöhnlicher Werkzeugfehler zugestellt — der Lauf läuft weiter, und
das Modell erfährt den Grund. Dieselbe Regel wie bei den Lesewerkzeugen: *„A model that reaches
too far should find out, not die."*

**Nur die drei neuen Werkzeuge laufen durch das Tor.** Die elf lesenden gehen weiter direkt durch
`fuehreAus` — die Kette künstlich auch über sie zu legen hiesse, jedem Lesevorgang ein Ereignis zu
spendieren, dessen Antwort immer „ja" ist. Das Protokoll würde länger und nicht wahrer.

**Was das Tor heute wirklich beiträgt — und es ist weniger, als dieser Abschnitt zuerst nahelegte.**
Beim Bau von Task 7 gemessen und vom Review unabhängig bestätigt: **das Tor verhindert nie einen
Effekt allein.** Jeder seiner Ablehnungszweige ist stromabwärts byte-gleich gespiegelt —
Pfadablehnungen von `werkzeug-schreiben.ts` (das die Pfadwache absichtlich selbst noch einmal
fragt, §6), fehlende Felder von denselben Stellen, und `shell_ausfuehren` lässt es ohnehin immer
durch. Nimmt man den Abbruch im Tor heraus, sieht das Protokoll identisch aus.

Sein Beitrag ist damit **der Eintrag `tool.entschieden`**: der prüfbare Nachweis, dass entschieden
wurde und warum. Das ist kein kleiner Beitrag — eine Ablehnung war vorher nur an einem
ausbleibenden Effekt zu erkennen, also gar nicht —, aber es ist ein anderer als „es hält die
Wirkung auf".

**Tragend wird es in dem Moment, in dem ein wirkendes Werkzeug nicht selbst nachprüft.** Genau
diese Lage stellt der Test mit einem vertrauenden Werkzeug her, und nur dort beisst die
Mutationsprobe. Das ist zugleich die Warnung an den nächsten Bau: wer ein viertes wirkendes
Werkzeug ohne eigene Prüfung hinzufügt, verlässt sich auf das Tor — und dann muss es halten.

**Ein Nebenbefund derselben Messung:** zwei Schutzmechanismen, die dieselbe Meldung ausgeben,
machen einander unprüfbar. Die erste Fassung der Probe hätte das Tor bestätigt, ohne etwas zu
zeigen.

---

## 6. Die Werkzeuge

### `datei_schreiben` (`werkzeug-schreiben.ts`, neu)

Pfad plus **vollständiger Inhalt**; fehlende Elternverzeichnisse werden angelegt.

**Kein `Edit`-artiges Suchen/Ersetzen.** Der Grund ist keels Zweck: die Teststrecke soll die
*billige* Ebene messen. Ein Werkzeug, das exakte Zeichenkettenübereinstimmung verlangt, verfehlen
schwache Modelle systematisch — dann misst die Strecke die Treffsicherheit am Werkzeug statt der
Fähigkeit am Werkstück.

**Der Gegeneinwand steht hier, damit er nicht verlorengeht:** eine 500-Zeilen-Datei zu ändern
heisst, sie ganz neu zu schreiben, und ein kleines Ausgabefenster reisst dabei. Wenn die Messung
das zeigt, kommt ein Änderungswerkzeug **danach, mit Beleg** — nicht vorher, auf Verdacht.

Geöffnet wird mit **`O_NOFOLLOW`** auf der letzten Komponente. Die Pfadwache löst Symlinks vor der
Prüfung auf; zwischen Prüfung und Öffnen kann ein Symlink getauscht werden (TOCTOU). Das schliesst
`O_NOFOLLOW` konstruktiv, statt es als Restrisiko zu notieren.

### `datei_loeschen` (`werkzeug-schreiben.ts`)

Eine Datei, durch dasselbe Tor. **Keine Verzeichnisse, nicht rekursiv.** Wer einen Baum wegräumen
will, hat die Shell, und dort hält der Kernel die Grenze — ein rekursives Löschen als In-Prozess-
Werkzeug hätte dieselbe Wirkung ohne dieselbe Grenze.

### `shell_ausfuehren` (`werkzeug-shell.ts`, neu)

Kommando, Arbeitsverzeichnis ist die Laufwurzel. Läuft über `sandkasten.starte`. Rückgabe:
Ausgabe (gedeckelt), Rückgabecode, und bei Zeitüberschreitung eine benannte Ablehnung.

**Die Herkunft der Ausgabe bekommt einen dritten Wert.** `WerkzeugQuelle` (`form.ts:21`) kennt heute `'netz' | 'lokal'`, und beides wäre hier eine falsche Auskunft: `netz` heisst laut eigenem Kommentar *„von einer Gegenstelle, die niemand von uns kontrolliert"* — ein `npm ci` kommt von keiner Gegenstelle; `lokal` heisst *„aus dieser Maschine"* und verschwiege, dass ein Paket in diesen Text schreiben kann und er im Modellkontext landet. Also `'fremd'` daneben. Beim Planen nachgeprüft: kein Produktionszweig verzweigt über den Wert, der Zusatz ist additiv, alte Protokolle behalten ihre Bedeutung. **Und er braucht zwei Stellen** — `quelleAus` in `projektion.ts:18` lässt unbekannte Werte *stumm* wegfallen, ein `'fremd'` ohne Anpassung dort verschwände lautlos aus dem Verlauf.

**Der Stummel im stabilen Präfix ist einzeilig**, und das ist keine Kosmetik: `faehigkeiten.ts`
warnt bereits namentlich davor, dass ein mehrzeiliger Beschreibungstext einen erfundenen
`shell_ausfuehren`-Eintrag in den Präfix schmuggeln kann, der von keels eigener Liste nicht zu
unterscheiden ist. Das Werkzeug jetzt wirklich zu haben, macht diese Warnung nicht kleiner,
sondern schärfer — der Wächter dort bleibt und wird in der Umsetzung gegen eine Mutation belegt.

---

## 7. Die Vorbedingung: sauberer Arbeitsbaum

Ein Lauf, dessen Registry ein schreibendes oder ausführendes Werkzeug enthält, startet **nur**,
wenn die Wurzel ein Git-Repo ist **und** `git status --porcelain` leer antwortet. Sonst bricht der
Start ab, benannt, vor `run.started`.

**Warum das trägt und nicht bloss beruhigt:** `.git` ist in der Pfadwache geschützt
(`pfadwache.ts:101`) und im Sandkastenprofil vom Schreiben ausgenommen (§4.2). Der Rückweg
`git diff` / `git checkout` gehört damit über den ganzen Lauf ausschliesslich dem Menschen — kein
Werkzeug und kein Kindprozess kann ihn wegnehmen. Die Vorbedingung stellt sicher, dass es zu
Beginn etwas gibt, worauf man zurückkann.

**Kein Git-Repo heisst: kein Start.** Nicht „Start mit Warnung" — eine Warnung, die man einmal
weggeklickt hat, ist beim zweiten Mal keine mehr, und der Preis ist die Arbeit eines ganzen Tages.
Für die Teststrecke ist das folgenlos: ein Wegwerf-Baum wird mit `git init` und einem leeren
Commit aufgesetzt, das gehört in den Aufbauschritt.

**Was die Vorbedingung nicht ist:** Schutz vor Zeitverlust. Ein Lauf kann Stunden Arbeit
zerschreiben; wiederherstellbar ist, was committet war. Das ist der Preis der Entscheidung aus
Christians Antwort 2, und er wird hier benannt, nicht weggeredet.

### Die Reichweite ist grösser, als dieser Abschnitt zuerst nahelegte

Der Satz oben sagt „ein Lauf, dessen Registry ein wirkendes Werkzeug enthält" — und liest sich, als
beträfe das manche Läufe. **Seit der Verdrahtung (Task 9) betrifft es alle.** `baueWerkzeugRegistry()`
ist die einzige Registry der App und trägt die drei wirkenden Werkzeuge immer; die Bedingung ist
damit unbedingt. Praktisch heisst das: **keel startet über keinem Verzeichnis mehr, das kein
Git-Repo mit sauberem Arbeitsbaum ist** — auch nicht für eine rein lesende Aufgabe.

Das ist spec-konform und war nicht beabsichtigt. Beim Review von Task 9 gefunden. Wer es ändern
will, hat drei Wege, und keiner davon ist in diesem Paket gebaut:

1. Die Registry je Lauf zuschneiden, statt eine für alle zu bauen — dann tragen lesende Aufgaben
   die wirkenden Werkzeuge gar nicht erst.
2. Die Bedingung an das Preset hängen statt an die Registry.
3. Sie so lassen: ein Projektverzeichnis ohne Git ist für keel ohnehin ein Sonderfall.

**Die Entscheidung gehört Christian**, weil sie seinen Alltag ändert und nicht bloss eine
Innenkante berührt.

---

## 8. Single-Writer

`lauf.ts:372` führt heute alle Aufrufe eines Zugs mit `Promise.all` aus, mit dem Kommentar:
*„All tools in this stretch read… The mechanism for it arrives with the writing tools."* Der
Zeitpunkt ist da.

**Die Regel** (M8 §3.2, Entwurfstabelle: *„Ein schreibender Aufruf in der Menge erzwingt
sequenzielle Ausführung"*): enthält die Aufrufmenge eines Zugs **einen** schreibenden oder
ausführenden Aufruf, läuft der **ganze** Zug sequenziell, in der Reihenfolge der Blöcke. Sonst
weiter `Promise.all`.

Nicht „nur die schreibenden serialisieren, die lesenden nebenher": ein Lesevorgang parallel zu
einem Schreibvorgang auf derselben Datei liefert je nach Zeitpunkt Altes oder Neues, und das
Protokoll sähe in beiden Fällen gleich aus. Die Reproduzierbarkeit eines Laufs ist genau das, was
die Teststrecke misst.

Der veraltete Kommentar an dieser Stelle wird ersetzt — er ist eine der Terminzusagen, deren
Schlussrunde die Vorgängerübergabe ausdrücklich verlangt.

---

## 9. Tests und Wächter

Nichts davon ist mit grünen Tests bewiesen. Der Beweis ist ein Lauf (§11). Was Tests halten:

| Was | Wie |
|---|---|
| `profilText` — jede Regel aus §4.2 | reine Funktion, Textvergleich, ohne Prozessstart |
| Die zwei Maskierungen (Literal, Regex) | je eigene Tests, mit `"`, `\`, Leerzeichen im Pfad |
| **Jedes Leseverbot ist auch ein Schreibverbot** | Wächter über `profilText`: für jede `deny file-read*`-Regel existiert dieselbe mit `file-write*` — der Fund aus §3 |
| Endungsverbote sind verankert | Wächter: keine `deny`-Regel ohne `<wurzel>`- oder `<heim>`-Anker (sonst fällt `/etc/ssl/cert.pem`) |
| `.git` ist schreibgeschützt | Wächter über `profilText`, plus ein echter `sandbox-exec`-Lauf |
| Kette Intent → Entscheidung → Wirkung | `effekteOhneIntent` **und** `effekteOhneEntscheidung` über einem echten `starteLauf` |
| Ein Nein steht im Protokoll | Lauf mit einem Schreibversuch ausserhalb der Wurzel; `tool.entschieden` mit `erlaubt: false` und Grund |
| Single-Writer | Lauf mit Lese- und Schreibaufruf im selben Zug; Reihenfolge im Protokoll |
| `tool.entschieden` im Ereignis-Panel | der bestehende Wächter aus `tests/renderer/ereignis-panel.test.ts` |
| Präfix-Schmuggel | der bestehende Wächter in `faehigkeiten.ts`, gegen eine Mutation belegt |

**Für jeden Wächter gilt die Lehre aus der Kimi-Strecke:** ein Test, der nie rot war, hat nichts
bewiesen. Jeder Wächter hier wird gegen eine absichtlich falsche Fassung gefahren, und das
Ergebnis gehört in den Bericht — nicht „war mal rot", sondern „beisst".

---

## 10. Was Annahme bleibt und als solche gekennzeichnet wird

1. **`sandbox-exec` bleibt verfügbar.** Apple nennt es seit Jahren „deprecated" und liefert es
   seit Jahren mit; auf Darwin 25.4 warnt es nicht einmal. Fällt es weg, fällt der Sandkasten —
   dann ist Docker die Antwort, die heute mangels Installation ausschied. Das gehört in den Kopf
   von `sandkasten.ts`, mit dem Ausweg, nicht nur mit der Sorge.
2. **Die Zwischenspeicher-Liste ist vollständig genug.** Sie ist gegen `npm` und `flutter`
   begründet, aber nicht gegen jede Toolchain gemessen. Der erste Fehlschlag einer fremden
   Toolchain wird sie erweitern; wichtig ist, dass er als *Sandkasten*-Fehlschlag erkennbar ist
   und nicht als rätselhafter Build-Fehler. Also: eine Zeitüberschreitung und ein
   `Operation not permitted` bekommen unterschiedliche, benannte Meldungen.
3. **`postinstall` mit Netz.** Benannt in §4.3, nicht geschlossen.
4. **Kein CIDR-Filter.** Seatbelt kann `100.64/10` nicht; die Vorgabe `zu` ist die Antwort darauf.
5. **Die TOCTOU-Lücke im Frisch-Zweig** (aus der Vorgängerübergabe, reiner Lesebefund) wird von
   diesem Paket **nicht** angefasst. `O_NOFOLLOW` in §6 betrifft die Schreibwerkzeuge, nicht sie.
6. **`O_NOFOLLOW` ist unbelegt, und §6 hat das zunächst anders behauptet.** Der Review von Task 5
   hat den Kontrollfluss verfolgt: `pruefePfad` gibt den **aufgelösten** Pfad zurück, `openSync`
   sieht im Normalbetrieb also nie einen Symlink. Das Flag greift ausschliesslich, wenn die letzte
   Pfadkomponente *zwischen* Auflösung und Öffnen getauscht wird — und dieser Fall ist ohne Mocks
   nicht synchron herstellbar, also von keinem Test belegt. Der grüne Symlink-Test belegt die
   Pfadwache, nicht das Flag. Es bleibt als Tiefenverteidigung gegen ein echtes Rennen; die Zusage
   ist zurückgenommen.
7. **Dasselbe Rennen um ein Zwischenverzeichnis ist gar nicht gedeckt.** `mkdirSync(…, recursive)`
   läuft vor dem bewachten Öffnen und hat kein Gegenstück zu `O_NOFOLLOW`. Ein zur Prüfzeit
   vorhandener Symlink im Pfad fällt bei der Pfadwache; einer, der erst danach entsteht, fällt
   nirgends. Benannt, nicht geschlossen.

---

## 11. Der Beweis

Grüne Tests sagen über eine Verdrahtung nichts — dieselbe Regel wie bei Paket B. Paket C gilt als
belegt, wenn **ein echter Lauf** in einem Wegwerf-Baum:

1. eine Datei schreibt, die vorher nicht da war,
2. ein `npm ci` (oder `flutter pub get`) durchbringt — also Netz unter `offen` bekommt,
3. einen Test fährt und dessen Ausgabe im Protokoll hat,
4. an einem Schreibversuch **ausserhalb** der Wurzel scheitert, mit `tool.entschieden`
   `erlaubt: false` im Protokoll,
5. und dessen `.git` danach unverändert ist.

Punkt 4 und 5 sind die, die zählen: 1 bis 3 zeigen, dass es *geht*, 4 und 5 zeigen, dass die
Grenze *hält*.

---

## 12. Was ausdrücklich nicht gebaut wird

- **Kein Änderungswerkzeug** (`datei_ersetzen`) — §6, kommt mit Beleg oder gar nicht.
- **Kein rekursives Löschen** als In-Prozess-Werkzeug — §6.
- **Keine menschliche Freigabe je Schreibvorgang** — Christians Antwort 3. Die zuschaltbare
  Variante wurde mit dem Argument abgelehnt, dass der selten gefahrene Pfad der schlecht geprüfte
  ist; das gilt weiter.
- **Kein Committen aus dem Lauf** — §4.2.
- **Kein Container**, solange Docker nicht installiert ist — Christians Antwort 5. Der Schnitt in
  §4.1 (`profilText` rein, `starte` dünn) lässt eine zweite Umsetzung später zu, ohne sie heute zu
  bauen.
- **Die Teststrecke selbst** — sie ist der Nutzer dieses Pakets, nicht sein Inhalt. Flutter ist am
  2026-08-30 nachgeprüft **nicht** auf dieser Maschine: kein Binary, kein SDK-Verzeichnis, kein
  brew-Paket, kein Archiv. Das bleibt Voraussetzung der Strecke, nicht dieses Pakets.
