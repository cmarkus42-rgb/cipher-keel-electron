/**
 * sandkasten — the process boundary, and the only place that writes SBPL.
 *
 * pfadwache checks tool *arguments*; this checks the *process*. Its own header says so, and this
 * module is the "sandbox arrives with the shell" it names. Nothing here parses a command: against
 * a shell a string check is theatre, because `$(...)` and a rewritten npm script walk past it.
 *
 * ASSUMPTION, measured on Darwin 25.4 on 2026-08-30 and not guaranteed beyond it: `sandbox-exec`
 * exists and is enforced. Apple has called it deprecated for years and shipped it for years. If it
 * ever disappears, the answer is a container (Docker was not installed on this machine, which is
 * why it was not the answer in 2026-08) — `profilText` and `starte` are separate exactly so a
 * second implementation can arrive without touching the rules.
 *
 * The profile is generated as text and passed inline via `-p`, not written to a file with `-D`
 * parameters: this way `profilText` is a pure function, testable without ever starting a process,
 * and the rules — the part that can be wrong — are checkable like pfadwache's.
 *
 * DIE NAHT ZWISCHEN DEN BEIDEN SCHICHTEN, GEMESSEN — 2026-08-30
 *
 * Die naheliegende Sorge, und sie kommt beim naechsten Lesen wieder: das Kind im Sandkasten legt
 * eine **harte Verknuepfung** von einem Geheimnis ausserhalb der Wurzel *in* die Wurzel, und
 * danach kuerzt das in-Prozess-Werkzeug `datei_schreiben` — das keinen Sandkasten hat — den Inode
 * ab. `realpathSync` sieht eine harte Verknuepfung nicht (sie hat keinen Zielpfad, sie *ist* der
 * Inode), `pruefePfad` liesse den Pfad also durch. Damit haetten die zwei Schichten, die einander
 * nicht beruehren sollen, ueber eine Datei doch aneinander gerueckt.
 *
 * Der Kernel schliesst das im ersten Schritt, und die Gegenprobe zeigt den Mechanismus statt eines
 * Zufalls — beides in einem echten Profil gefahren:
 *
 *   ln <datei-ausserhalb>  <wurzel>/notiz.txt   ->  Operation not permitted
 *   ln <wurzel>/a.txt      <wurzel>/b.txt       ->  rc=0, Verknuepfungszahl 2
 *
 * `ln` ist also nicht pauschal gesperrt: Seatbelt vermittelt die **Quelle** von `link(2)`, und die
 * liegt beim Angriff ausserhalb der Erlaubnis. Der Angriff scheitert vor seinem ersten Schritt.
 *
 * Deshalb steht hier **kein** `fstat`/`nlink`-Waechter in `werkzeug-schreiben.ts`: er bewachte
 * einen Weg, den der Kernel schon zu hat, und eine Datei mit mehreren Verknuepfungen ist im
 * Normalbetrieb nichts Verdaechtiges. Und deshalb steht die Messung hier und nicht in einer
 * Notiz: sie ist es, die "die zwei Schichten beruehren einander nicht" von einer Hoffnung zu einer
 * Aussage macht.
 */

import type { WacheKontext } from './pfadwache'

export interface SandkastenKontext extends WacheKontext {
  /** Absolute write targets outside the root: toolchain caches. Adjustable surface, CK-NFR-012. */
  zwischenspeicher: string[]
  tmpdir: string
  /**
   * `$FLUTTER_ROOT`, aufgeloest — oder `null`, wenn auf dieser Maschine kein Flutter liegt.
   *
   * `null` heisst "keine Regel", nicht "Vorgabepfad": eine geratene Wurzel gaebe eine
   * Schreiberlaubnis auf ein Verzeichnis, von dem niemand weiss, was darin liegt. Genau
   * diesen Fehler hat `STANDARD_ZWISCHENSPEICHER` zweimal gemacht (siehe dort).
   */
  flutterWurzel: string | null
}

/**
 * Die vier Dateien unter `$FLUTTER_ROOT/bin/cache`, die `flutter test` beschreiben muss.
 *
 * **Vier Namen, nicht der Baum** — und das ist derselbe Schnitt wie bei `.gradle` und `.cargo`
 * (siehe STANDARD_ZWISCHENSPEICHER): unter `bin/cache` liegen `dart-sdk/bin/dart` und
 * ausfuehrbare Bibliotheken, die der Mensch danach in seiner eigenen Sitzung aufruft, ohne
 * Sandkasten. Ein Lauf, der dort schreiben darf, hat Codeausfuehrung auf dem Rechner *nach*
 * seinem Ende.
 *
 * `engine.stamp.tmp.<pid>` ist ein Muster und braucht deshalb eine Regex-Regel; die uebrigen
 * drei sind Literale. Am 2026-08-31 gegen einen echten `flutter test`-Lauf gemessen, nicht
 * aus der Doku abgeschrieben.
 *
 * Und: `flutter precache` gehoert in den Aufbau einer Teststrecke. Ohne die vorgeladenen
 * Engine-Artefakte **haengt** der erste Lauf beim Nachladen bis zur Wanduhr, statt zu
 * scheitern — und ein Haenger ist schlimmer als ein Fehlschlag.
 */
export const FLUTTER_CACHE_DATEIEN = ['engine.stamp', 'engine.realm', 'lockfile']

export type NetzModus = 'zu' | 'offen'

/**
 * Home-relative by design: the list is a statement about tool conventions, not about one machine.
 * Adjustable surface (CK-NFR-012), documented in docs/anpassbare-flaechen.md.
 *
 * Only the root would mean every install fails: `flutter pub get` writes to ~/.pub-cache, `npm ci`
 * to ~/.npm. This is the softest spot in the whole sandbox — every entry is a hole — so it lives
 * in exactly one place, visible, and never grows silently.
 */
export const STANDARD_ZWISCHENSPEICHER = [
  // `.cargo/registry` und nicht `.cargo`: unter `.cargo/bin` liegen Binaries, die der Mensch
  // spaeter selbst aufruft, und `.cargo/config.toml` kann einen eigenen Linker vorgeben.
  // `.dart-tool` und NICHT `.dart`/`.flutter`: die beiden standen hier bis Paket D und
  // existieren auf dieser Maschine gar nicht — sie waren aus der Doku abgeschrieben statt
  // gemessen. `.dart-tool` ist das, was `flutter test` wirklich beschreibt (2026-08-31,
  // gegen einen echten Lauf). Eine Liste wie diese wird gemessen, nicht abgeschrieben; ein
  // Eintrag zuviel ist ein Loch, und ein Eintrag, den es nicht gibt, ist eine Zusage, die
  // niemand je gepruft hat.
  '.npm', '.pub-cache', '.dart-tool', '.cargo/registry',
  // `.gradle/caches` und `.gradle/wrapper` und nicht `.gradle`: unter `~/.gradle/init.d/` fuehrt
  // Gradle **jede** `*.gradle` bei jedem spaeteren Aufruf aus, in der Sitzung des Menschen und
  // ohne Sandkasten. Ein Lauf, der dort eine Datei ablegt, hat damit Codeausfuehrung auf dem
  // Rechner *nach* seinem Ende — die Einschraenkung ist also nicht Sparsamkeit, sondern derselbe
  // Schnitt, der bei `.cargo` schon gemacht wurde und hier vergessen worden war. `~/.gradle`
  // war der einzige Eintrag der Liste, der eine Ausfuehrungsflaeche und keinen Zwischenspeicher
  // benannte.
  '.gradle/caches', '.gradle/wrapper',
]

/** For `(subpath "...")` and `(literal "...")`: an SBPL string literal. */
export function sbplLiteral(pfad: string): string {
  return pfad.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * For `#"..."`: an SBPL regex literal. A separate function with its own tests rather than one with
 * a flag — the two escaping rules are genuinely different, and a shared function with a switch is
 * where they would quietly drift into each other.
 *
 * Ein Rueckstrich wird zu `\\`, und das ist gemessen und nicht abgeleitet. Die Sorge des Reviews
 * war, `#"…"` habe eine Zeichenketten-Ebene, die einen der beiden Rueckstriche verbrauche, sodass
 * vier noetig waeren. Am 2026-08-30 gegen echtes sandbox-exec gefahren, mit einem Verzeichnis
 * `b\c` und einer Datei darin:
 *
 *   (deny file-read* (regex #"^…/b\\c/"))    ->  cat  =  Operation not permitted   (trifft)
 *   (deny file-read* (regex #"^…/b\\\\c/"))  ->  cat  =  Inhalt kommt durch        (trifft nicht)
 *
 * `#"…"` entwertet also nichts: der Regex-Motor sieht die Zeichen, wie sie dastehen, und `\\` ist
 * dort der Rueckstrich. Zwei sind richtig, vier waeren zwei Rueckstriche und wuerden die Regel
 * lautlos wirkungslos machen — der Ausgang, vor dem der Kopf dieses Moduls warnt. Ein Test haelt
 * beide Richtungen fest.
 *
 * **Was diese Funktion nicht kann, gemessen am selben Tag:** ein Anfuehrungszeichen im Pfad.
 * `\"` beendet das Literal trotzdem, `sandbox-exec` antwortet mit `unbound variable` und startet
 * gar nicht erst. Ein Projektpfad mit `"` fuehrt damit zu einem Lauf, der mit „Der Sandkasten
 * liess sich nicht starten" endet — fail-closed und benannt, aber nicht behoben.
 */
export function sbplRegex(pfad: string): string {
  return pfad.replace(/[\\^$.|?*+()[\]{}"]/g, '\\$&')
}

export function profilText(ktx: SandkastenKontext, netz: NetzModus): string {
  const w = sbplLiteral(ktx.wurzel)
  const wRe = sbplRegex(ktx.wurzel)
  const hRe = sbplRegex(ktx.heim)

  const zeilen: string[] = [
    '(version 1)',
    '(deny default)',
    '',
    '; Prozesse duerfen starten — sonst laeuft kein Build-Werkzeug',
    '(allow process-exec* process-fork)',
    // `(target children)` und nicht nur `(target self)`: sobald ein Werkzeug seinen eigenen
    // Kindprozess beendet — und das tut jeder Testrunner, der Testprozesse verwaltet —,
    // HAENGT es ohne diese Erlaubnis bis zur Wanduhr, statt zu scheitern. Am 2026-08-31
    // gemessen: `flutter test` mit `(target self)` allein 2:29 min bis zum Zeitablauf, mit
    // `(target children)` 1 Sekunde und `rc=0`. Das betrifft nicht Dart, sondern jeden
    // Runner mit einem Kindprozess — und ein Haenger ist schlimmer als ein Fehlschlag.
    '(allow signal (target self) (target children))',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '',
  ]

  // NETZ — drei Zeilen, und jede davon traegt eine eigene Aussage.
  //
  // 1. `network-bind` ALLEIN REICHT NICHT. Am 2026-08-31 gemessen: `listen(2)` scheitert mit
  //    `Operation not permitted` selbst bei ungefiltertem `(allow network-bind)`; es braucht
  //    `network-inbound`. Der Dart-Testrunner oeffnet einen Server-Socket auf 127.0.0.1 —
  //    ohne diese zweite Zeile laeuft `flutter test` im Sandkasten nicht, und das galt auch
  //    fuer den `offen`-Modus, wie er bis Paket D dastand. Die Zeile war also nie richtig,
  //    nur nie benutzt.
  // 2. `zu` heisst seit Paket D "nur die eigene Maschine", nicht "kein Netz". Das ist der
  //    Preis dafuer, dass ein Lauf seine eigenen Tests fahren kann — und der Preis ist real:
  //    das Kind erreicht jeden lokal lauschenden Dienst. Auf dieser Maschine am 2026-08-31
  //    unter anderem Ollama (11433), ein llama-server (8766), `adb` (5037) und mehrere
  //    Python-Dienste. Das ist Datenpreisgabe, KEIN Ausbruch: der Ausbruch lief ueber keels
  //    eigenen MCP-Server, weil eine ueber `keel_zelle_beauftragen` beauftragte Zelle OHNE
  //    Sandkasten laeuft — und der Server ist deshalb in Paket D auf einen Unix-Socket
  //    umgezogen (graph/mcp-http-server.ts, Modulkopf).
  // 3. **KEINE dieser Zeilen nennt einen Pfad, also bleiben Unix-Sockets unter
  //    `(deny default)`.** Das ist die ganze Grenze zu keels Werkzeugen, und sie haengt an
  //    der FORM der Erlaubnis, nicht an einer Verbotszeile, die jeden Pfad kennen muesste.
  //    Am 2026-08-31 in beide Richtungen gemessen:
  //
  //      (allow network-outbound (remote ip "*:*"))          ->  nc -U <sock>  =  rc 1
  //      (allow network-outbound)  [ungefiltert]             ->  nc -U <sock>  =  rc 0
  //      (deny file-read* file-write* (subpath <dir>))       ->  nc -U <sock>  =  rc 0  (!)
  //
  //    Die dritte Zeile ist der Grund, warum die Grenze hier steht und nicht im Dateiblock
  //    unten: Seatbelt vermittelt einen Socket-Connect als NETZ-, nicht als Dateioperation.
  //    Ein `deny` auf dem Verzeichnis, in dem der Socket liegt, haelt ihn nicht auf.
  //
  // Was das kostet, damit es nicht unausgesprochen bleibt: ein Werkzeug, das einen
  // Unix-Socket braucht (Docker ueber `/var/run/docker.sock`, ein Gradle- oder
  // Sprachserver-Daemon), scheitert jetzt auch unter `offen`. Es scheitert LAUT
  // (`Operation not permitted`), nicht als Haenger — und wer diese Zeilen erweitert, um so
  // ein Werkzeug zu bedienen, oeffnet damit denselben Weg zu keels MCP-Server wieder.
  const ziel = netz === 'offen' ? '*:*' : 'localhost:*'
  zeilen.push(
    `(allow network-bind     (local  ip "${ziel}"))`,
    `(allow network-inbound  (local  ip "${ziel}"))`,
    `(allow network-outbound (remote ip "${ziel}"))`,
    '',
  )

  // ALLE Erlaubnisse zuerst, ALLE Verbote zuletzt. Das ist die tragende Regel dieser Funktion,
  // und sie ist am 2026-08-30 gegen echtes sandbox-exec gemessen worden: **SBPL entscheidet nach
  // der zuletzt passenden Regel**, nicht nach der ersten und nicht "deny gewinnt". Gemessen mit
  // zwei Profilen, die sich nur in der Reihenfolge zweier Zeilen unterschieden:
  //
  //   deny .env  VOR  allow write <wurzel>  ->  echo zerstoert > .env  gelingt
  //   deny .env  NACH allow write <wurzel>  ->  Operation not permitted, Inhalt unveraendert
  //
  // Ein Verbot vor einer umfassenderen Erlaubnis ist also wirkungslos — es sieht im Profiltext
  // aus wie Schutz und ist keiner. Genau deshalb reicht eine Textpruefung ueber diesem Profil
  // nicht: die Reihenfolge ist die Aussage, nicht das Vorhandensein der Zeile.
  zeilen.push(
    '; Lesen: grundsaetzlich ja — die Verbote stehen unten und ueberstimmen das.',
    '(allow file-read*)',
    '',
    '; Schreibziele: die Wurzel und die Zwischenspeicher der Toolchains.',
    `(allow file-write* (subpath "${w}"))`,
    `(allow file-write* (subpath "${sbplLiteral(ktx.tmpdir)}"))`,
  )

  for (const z of ktx.zwischenspeicher) {
    zeilen.push(`(allow file-write* (subpath "${sbplLiteral(z)}"))`)
  }

  // Die vier Dateien unter `$FLUTTER_ROOT/bin/cache` — siehe FLUTTER_CACHE_DATEIEN fuer den
  // Grund, warum es Namen sind und kein `subpath`. Ohne Flutter auf der Maschine steht hier
  // nichts: `null` heisst "keine Regel", nicht "Vorgabepfad".
  if (ktx.flutterWurzel !== null) {
    const cache = `${ktx.flutterWurzel}/bin/cache`
    for (const name of FLUTTER_CACHE_DATEIEN) {
      zeilen.push(`(allow file-write* (literal "${sbplLiteral(`${cache}/${name}`)}"))`)
    }
    // `engine.stamp.tmp.<pid>` ist ein Muster, kein Name. Ueber sbplRegex und nie von Hand:
    // im `#"…"`-Literal IST `\\` der Rueckstrich, und vier machen die Regel still unwirksam
    // (Paket C, gemessen mit einem Verzeichnis `b\c`).
    zeilen.push(
      `(allow file-write* (regex #"^${sbplRegex(`${cache}/engine.stamp.tmp.`)}[0-9]+$"))`,
    )
  }

  zeilen.push(
    '(allow file-write-data (literal "/dev/null"))',
    '',
    '; Ab hier nur noch Verbote, und keine Erlaubnis darf ihnen folgen. Beidseitig, nie nur',
    '; lesend: ein deny auf file-read* allein laesst das Ueberschreiben zu, und dann ist das',
    '; Geheimnis vertraulich und zerstoerbar.',
    `(deny file-read* file-write* (subpath "${sbplLiteral(ktx.heim)}/.ssh"))`,
    `(deny file-read* file-write* (subpath "${sbplLiteral(ktx.userDataPfad)}"))`,
    // `(.*/)?` in jeder dieser Regeln, und das ist keine Kosmetik: pfadwache prueft den
    // **Basename** und `istIn(pfad, heim)` — also jede Tiefe unter dem Heim. Eine Regel ohne
    // dieses Segment traefe nur direkte Kinder, und der Sandkasten waere schwaecher als die
    // Wache, die er spiegeln soll.
    `(deny file-read* file-write* (regex #"^${hRe}/(.*/)?\\.cipher-"))`,
    `(deny file-read* file-write* (regex #"^${hRe}/(.*/)?\\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$"))`,
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?\\.env(\\..*)?$"))`,
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?(id_rsa|id_ed25519|id_ecdsa|id_dsa)$"))`,
    // Anchored to the root, never global: a global deny on *.pem locks /etc/ssl/cert.pem and
    // breaks TLS in the child — that is, `npm ci` itself.
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?[^/]*\\.(pem|key|p12|keystore|jks)$"))`,
    // Jedes `.git`-Segment in jeder Tiefe, nicht bloss `<wurzel>/.git`: pfadwache verwirft einen
    // Pfad, sobald *irgendein* Segment `.git` heisst (pfadwache.ts:101). Ein Submodul oder ein
    // eingebettetes Repo unter `vendor/` waere sonst beschreibbar, waehrend die Wache es
    // verweigert — und die Rueckwegzusage gilt dann nur fuer das oberste Repo. Ein
    // `git reset --hard` naehme ausserdem genau den Rueckweg weg, auf dem die
    // Startvorbedingung beruht.
    `(deny file-write* (regex #"^${wRe}/(.*/)?\\.git(/|$)"))`,
  )

  // Hier stand bis Paket D `(deny network-outbound (remote ip "localhost:*"))`. Die Zeile
  // schuetzte keels MCP-Server auf 127.0.0.1 vor einem Kindprozess unter `offen`, und sie tat
  // das nachweislich — am 2026-08-30 gemessen:
  //
  //   offen ohne diese Zeile  ->  curl http://127.0.0.1:<port>  =  200
  //   offen mit  dieser Zeile ->  curl http://127.0.0.1:<port>  =  000
  //   offen mit  dieser Zeile ->  curl https://example.com      =  200  (Netz blieb offen)
  //
  // Sie faellt ersatzlos, weil der Server dort nicht mehr lauscht (Paket D) und weil sie
  // genau das verboten haette, was `flutter test` braucht. Die Messreihe bleibt hier stehen:
  // wer localhost je wieder zumachen will, muss sie nicht ein zweites Mal erkaufen.
  //
  // Kein CIDR-Filter: Seatbelt kann `100.64/10` nicht ausdruecken, das Tailnet (MS-01, VPS, DGX)
  // bleibt unter `offen` also erreichbar. Deshalb ist die Vorgabe `zu` und nicht "offen ausser
  // innen" — benannt, nicht geschlossen. Seit Paket D erreicht auch `zu` die eigene Maschine;
  // was `zu` weiterhin verwehrt, ist alles ausserhalb von localhost, also auch das Tailnet.
  zeilen.push('')
  return zeilen.join('\n')
}

import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { getEnhancedPath } from '../util/exec-util'

/** Wall-clock ceiling for one command. Adjustable surface (CK-NFR-012). */
export const STANDARD_ZEITGRENZE_MS = 120_000

/**
 * Hard ceiling on `zeitgrenzeMs`, whatever the model asks for. Adjustable surface (CK-NFR-012).
 * Without this, `STANDARD_ZEITGRENZE_MS` is a default and not a ceiling: `shell_ausfuehren` is
 * the one tool that starts a process, and its `zeitgrenzeMs` comes straight from the model's
 * input. Not command inspection — this never reads `kommando`.
 */
export const MAX_ZEITGRENZE_MS = 15 * 60_000

/**
 * Output cap. Not comfort: the output goes into the model context. An `npm ci` with 4 MB of
 * output blows a local 27B model's window in a single turn, and then the test track measures who
 * guessed `--silent`.
 */
export const MAX_AUSGABE_BYTES = 64 * 1024

/**
 * Der Ausgabesammler: er verbindet die Stuecke, die aus den beiden Pipes kommen, und haelt den
 * Deckel. Als eigene Einheit exportiert, damit ein Test ihm ein Stueck geben kann, das mitten in
 * einer UTF-8-Folge endet — ueber `starte` ist der Schnittpunkt eines Chunks nicht herstellbar,
 * er gehoert dem Kernel.
 *
 * Zwei Fehler sassen hier, und beide trafen deutschen Text:
 *
 * 1. Jedes Stueck wurde einzeln mit `stueck.toString('utf-8')` dekodiert. Ein Umlaut, dessen zwei
 *    Bytes auf zwei Chunks fallen, wurde damit zu zwei Ersatzzeichen (U+FFFD) — und das trifft
 *    ausgerechnet die Bauausgabe der Projekte, an denen keel billige Modelle messen soll. Ein
 *    Modell, das Mojibake liest, misst nicht mehr seine Faehigkeit, sondern unsere Kodierung.
 *    Jetzt haelt ein `StringDecoder` die angefangene Folge ueber die Chunkgrenze.
 * 2. Der Deckel verglich `MAX_AUSGABE_BYTES` mit `ausgabe.length`, also mit UTF-16-Einheiten. Bei
 *    deutschem Text liefert das bis zum Doppelten der Bytes aus, die die Konstante nennt, und bei
 *    Emoji dasselbe in der anderen Richtung. Gezaehlt wird jetzt mit `Buffer.byteLength`.
 *
 * Ein Rest bleibt gewollt: die letzte angefangene Folge am Prozessende wird verworfen statt zu
 * einem U+FFFD gemacht (`decoder.end()` wird nie gerufen). Ein fehlendes Zeichen ist ehrlicher
 * als ein erfundenes.
 */
export type SammlerStrom = 'aus' | 'fehler'

export interface AusgabeSammler {
  nimm(stueck: Buffer, strom: SammlerStrom): void
  text(): string
  abgeschnitten(): boolean
}

/**
 * Schneidet auf hoechstens `maxBytes` Bytes, ohne eine Zeichenfolge zu zerreissen. Zurueckgesetzt
 * wird auf die naechste UTF-8-Grenze: ein Folgebyte traegt das Bitmuster `10xxxxxx`, und solange
 * das erste *weggeschnittene* Byte eines ist, steht der Schnitt mitten in einem Zeichen. Weil ein
 * Zeichen ausserhalb der BMP in UTF-8 **eine** Folge ist, kann so auch kein halbes Surrogatpaar
 * entstehen — der Schnitt liegt immer auf einer Zeichengrenze, nie zwischen den beiden Haelften.
 */
export function schneideAufBytes(text: string, maxBytes: number): string {
  const puffer = Buffer.from(text, 'utf-8')
  if (puffer.length <= maxBytes) return text
  let ende = maxBytes
  while (ende > 0 && (puffer[ende] & 0xc0) === 0x80) ende--
  return puffer.subarray(0, ende).toString('utf-8')
}

export function baueSammler(maxBytes: number = MAX_AUSGABE_BYTES): AusgabeSammler {
  // Ein Dekoder pro Strom, nicht einer fuer beide: ein `StringDecoder` haelt die angefangenen
  // Bytes einer unvollstaendigen Folge bis zum naechsten `write()` zurueck, und dieser Zustand
  // gehoert dem Strom, nicht dem Sammler. Geteilt haetten sich stdout und stderr sonst gegenseitig
  // ihre Haelften geliehen, sobald ein `data`-Ereignis des einen Stroms zwischen den beiden
  // Haelften einer Mehrbyte-Folge des anderen eintrifft.
  const dekoderAus = new StringDecoder('utf8')
  const dekoderFehler = new StringDecoder('utf8')
  let text = ''
  let gekappt = false
  return {
    nimm(stueck: Buffer, strom: SammlerStrom): void {
      if (gekappt) return
      const dekoder = strom === 'aus' ? dekoderAus : dekoderFehler
      text += dekoder.write(stueck)
      if (Buffer.byteLength(text, 'utf-8') > maxBytes) {
        text = schneideAufBytes(text, maxBytes)
        gekappt = true
      }
    },
    text: () => text,
    abgeschnitten: () => gekappt,
  }
}

export interface SandkastenLauf {
  /** stdout and stderr, interleaved in arrival order, capped at MAX_AUSGABE_BYTES. */
  ausgabe: string
  code: number | null
  abgeschnitten: boolean
  zeitueberschreitung: boolean
}

/**
 * The commands that get the `offen` network profile. Adjustable surface (CK-NFR-012).
 *
 * This is NOT a positive list of what may run — every command runs, only without network if it
 * does not match here. If the match is wrong, the failure case is a failing build, never an open
 * channel: it errs fail-closed, and that is exactly why it is allowed to be imprecise.
 *
 * Zwei Loecher, beide benannt und keines geschlossen:
 *
 * - Ein `postinstall`-Skript laeuft unter `offen` mit vollem Netz, und das ist **nicht** dieselbe
 *   Luecke, die ein Mensch eingeht, der selbst `npm ci` tippt — dieser Satz stand hier und war
 *   falsch. Der Mensch, der `npm ci` tippt, hat die `package.json` nicht auch geschrieben. Der
 *   Lauf kann beides: er schreibt sich ein `preinstall`/`postinstall` in die `package.json`
 *   (`datei_schreiben` darf das, die Datei liegt in der Wurzel und ist nicht geschuetzt) und
 *   ruft danach den Paketbefehl auf, der Netz freischaltet. Aus "eine fremde Abhaengigkeit
 *   koennte das tun" wird damit "der Lauf kann es selbst wollen", und das ist eine andere
 *   Aussage. Der Weg ins Netz steht dem Lauf also offen, wenn er ihn sucht; was bleibt, ist der
 *   Rest des Profils — kein Zugriff auf `~/.ssh`, `~/.cipher-*`, `.env`, `.git`, und keine
 *   Schreibrechte ausserhalb der Wurzel und der Zwischenspeicher.
 * - Der Treffer gilt dem **fuehrenden** Kommando der Zeile, und das Profil gilt der ganzen Zeile:
 *   `npm ci && curl …` traegt beides ins Netz. Ein vorangestelltes `cd sub && npm ci` trifft
 *   dagegen nicht und laeuft ohne Netz — die Ungenauigkeit irrt also in beide Richtungen, nicht
 *   nur in die sichere. Sie gewinnt nichts, was ein selbstgeschriebenes `postinstall` nicht auch
 *   gaebe, und darum bleibt der Abgleich wie er ist; die Aussage darueber wird korrigiert, nicht
 *   der Abgleich.
 */
export const PAKETBEFEHLE = [
  'npm ci', 'npm install', 'npm i ', 'yarn install', 'pnpm install', 'pnpm i ',
  'flutter pub get', 'dart pub get', 'pip install', 'pip3 install',
  'cargo fetch', 'go mod download', 'bundle install',
]

export function istPaketbefehl(kommando: string): boolean {
  const k = kommando.trim()
  return PAKETBEFEHLE.some(p => k === p.trim() || k.startsWith(p))
}

export function starte(
  kommando: string,
  ktx: SandkastenKontext,
  netz: NetzModus,
  zeitgrenzeMs: number = STANDARD_ZEITGRENZE_MS,
): Promise<SandkastenLauf> {
  const profil = profilText(ktx, netz)
  return new Promise((aufloesen) => {
    // A minimal environment, not process.env: the main process carries API keys, and a child that
    // inherits them can write them into the project tree. PATH is passed explicitly rather than
    // relied upon — a macOS GUI app does not inherit the shell PATH (see exec-util.ts), so without
    // this `npm` is simply not found.
    const kind = spawn(
      '/usr/bin/sandbox-exec',
      ['-p', profil, '/bin/sh', '-c', kommando],
      {
        cwd: ktx.wurzel,
        // `detached` makes the child a process *group* leader, and that is what makes the wall
        // clock below binding. Without it, `kill` reaches only the `sandbox-exec` pid: for a
        // command the shell can `exec` in place that is the same process and it works, but any
        // command that forks — a pipeline, a background job, i.e. every real build tool — leaves
        // grandchildren holding the stdout pipe open, and `close` does not fire until they finish
        // on their own. Measured on 2026-08-30 against a 300 ms limit: `sleep 5` ended after
        // 306 ms, `sleep 5 | cat` after 5024 ms with the flag already claiming a timeout.
        detached: true,
        env: {
          PATH: getEnhancedPath(),
          HOME: ktx.heim,
          TMPDIR: ktx.tmpdir,
          LANG: process.env.LANG ?? 'en_US.UTF-8',
        },
      },
    )

    let zeitueberschreitung = false

    // Ein Sammler fuer beide Pipes, damit die Reihenfolge des Eintreffens erhalten bleibt — das
    // Interleaving in Ankunftsreihenfolge ist Absicht und in `SandkastenLauf.ausgabe` dokumentiert.
    // Geteilt werden dabei nur der Bytedeckel und der eine `text`: `baueSammler` haelt fuer `aus`
    // und `fehler` je einen eigenen `StringDecoder`, denn dessen zurueckgehaltene Bytes einer
    // unvollstaendigen Folge gehoeren dem einzelnen Strom. Ein gemeinsamer Dekoder wuerde eine
    // Folge, deren erste Haelfte auf der einen Pipe endet, mit der naechsten Haelfte vervollstaendigen,
    // die auf der *anderen* Pipe eintrifft — und beide Texte waeren verstuemmelt, nicht nur einer.
    const sammler = baueSammler(MAX_AUSGABE_BYTES)
    kind.stdout.on('data', (stueck: Buffer) => sammler.nimm(stueck, 'aus'))
    kind.stderr.on('data', (stueck: Buffer) => sammler.nimm(stueck, 'fehler'))

    const wecker = setTimeout(() => {
      zeitueberschreitung = true
      // The negated pid is the process *group*, which is the whole point of `detached` above.
      // Wrapped, because the group can already be gone between the timer firing and the signal
      // (ESRCH) — and a throw here would escape the promise instead of ending the run.
      try { process.kill(-kind.pid!, 'SIGKILL') } catch { /* schon beendet */ }
    }, zeitgrenzeMs)

    kind.on('error', (err) => {
      clearTimeout(wecker)
      aufloesen({
        ausgabe: String(err), code: null,
        abgeschnitten: sammler.abgeschnitten(), zeitueberschreitung,
      })
    })
    kind.on('close', (code) => {
      clearTimeout(wecker)
      aufloesen({
        ausgabe: sammler.text(), code,
        abgeschnitten: sammler.abgeschnitten(), zeitueberschreitung,
      })
    })
  })
}
