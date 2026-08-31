import { describe, it, expect } from 'vitest'
import {
  profilText, sbplLiteral, sbplRegex, STANDARD_ZWISCHENSPEICHER,
  baueSammler, schneideAufBytes,
  type SandkastenKontext,
} from '../../src/main/harness/sandkasten'

const ktx: SandkastenKontext = {
  wurzel: '/Users/x/projekt',
  heim: '/Users/x',
  userDataPfad: '/Users/x/Library/Application Support/cipher-keel',
  zwischenspeicher: ['/Users/x/.npm', '/Users/x/.pub-cache'],
  tmpdir: '/private/var/folders/tmp',
  flutterWurzel: null,
}

describe('sbplLiteral', () => {
  it('entwertet Anfuehrungszeichen und Rueckstriche', () => {
    expect(sbplLiteral('/a/b"c\\d')).toBe('/a/b\\"c\\\\d')
  })
  it('laesst einen gewoehnlichen Pfad unveraendert', () => {
    expect(sbplLiteral('/Users/x/projekt')).toBe('/Users/x/projekt')
  })
})

describe('sbplRegex', () => {
  it('entwertet Regex-Sonderzeichen', () => {
    expect(sbplRegex('/a/b.c+d')).toBe('/a/b\\.c\\+d')
  })
  it('entwertet Klammern und Anfuehrungszeichen', () => {
    expect(sbplRegex('/a/(b)"c')).toBe('/a/\\(b\\)\\"c')
  })
  /**
   * Der Rueckstrich war die einzige der beiden Entwertungsregeln, die kein Test anfasste — und
   * ausgerechnet um sie geht es im Kopf des Moduls. Ein Rueckstrich wird zu **zwei**, nicht zu
   * vier: `#"…"` hat keine Zeichenketten-Ebene, die einen davon verbraucht. Am 2026-08-30 gegen
   * echtes sandbox-exec gemessen, mit einem Verzeichnis `b\c`:
   *
   *   (regex #"^…/b\\c/")    ->  Operation not permitted   (die Regel trifft)
   *   (regex #"^…/b\\\\c/")  ->  Inhalt kommt durch        (sie trifft nicht mehr)
   *
   * Vier Rueckstriche waeren also nicht strenger, sondern wirkungslos — genau der Ausgang, vor
   * dem der Modulkopf warnt.
   */
  it('macht aus einem Rueckstrich zwei, nicht vier', () => {
    expect(sbplRegex('/a/b\\c')).toBe('/a/b\\\\c')
  })
})

describe('profilText — Grundgeruest', () => {
  const p = profilText(ktx, 'zu')

  it('beginnt mit Version und deny default', () => {
    expect(p.startsWith('(version 1)\n(deny default)')).toBe(true)
  })
  it('erlaubt Prozessstart, sonst laeuft kein Build-Werkzeug', () => {
    expect(p).toContain('(allow process-exec* process-fork)')
  })
  it('erlaubt Lesen grundsaetzlich', () => {
    expect(p).toContain('(allow file-read*)')
  })
  it('erlaubt Schreiben in der Wurzel', () => {
    expect(p).toContain('(allow file-write* (subpath "/Users/x/projekt"))')
  })
  it('verbietet Schreiben in .git, in jeder Tiefe', () => {
    expect(p).toContain('(deny file-write* (regex #"^/Users/x/projekt/(.*/)?\\.git(/|$)"))')
  })
  it('erlaubt jeden mitgegebenen Zwischenspeicher', () => {
    expect(p).toContain('(allow file-write* (subpath "/Users/x/.npm"))')
    expect(p).toContain('(allow file-write* (subpath "/Users/x/.pub-cache"))')
  })
  it('erlaubt TMPDIR', () => {
    expect(p).toContain('(allow file-write* (subpath "/private/var/folders/tmp"))')
  })
})

describe('profilText — Netzmodus (Paket D)', () => {
  // `zu` heisst seit Paket D "nur die eigene Maschine" und nicht mehr "kein Netz". Das ist der
  // Preis dafuer, dass ein Lauf seine eigenen Tests fahren kann: der Dart-Testrunner oeffnet
  // einen Server-Socket auf 127.0.0.1, und `flutter test` ist kein Paketbefehl, laeuft also
  // unter `zu`.
  it('zu: Loopback in allen drei Richtungen', () => {
    const p = profilText(ktx, 'zu')
    expect(p).toContain('(allow network-bind     (local  ip "localhost:*"))')
    expect(p).toContain('(allow network-inbound  (local  ip "localhost:*"))')
    expect(p).toContain('(allow network-outbound (remote ip "localhost:*"))')
  })

  it('zu: nichts ausserhalb von localhost', () => {
    const p = profilText(ktx, 'zu')
    expect(p).not.toContain('"*:*"')
  })

  it('offen: dieselben drei Richtungen, ohne Zielbeschraenkung', () => {
    const p = profilText(ktx, 'offen')
    expect(p).toContain('(allow network-bind     (local  ip "*:*"))')
    expect(p).toContain('(allow network-inbound  (local  ip "*:*"))')
    expect(p).toContain('(allow network-outbound (remote ip "*:*"))')
  })

  // `network-bind` allein reicht nicht: am 2026-08-31 gemessen, `listen(2)` scheitert mit
  // `Operation not permitted` selbst bei ungefiltertem `(allow network-bind)`. Ohne
  // `network-inbound` laeuft kein Testrunner — und das galt auch fuer den `offen`-Modus, wie
  // er bis Paket D dastand. Die Zeile war nie richtig, nur nie benutzt.
  it('nennt in jedem Modus network-inbound, nicht nur network-bind', () => {
    for (const netz of ['zu', 'offen'] as const) {
      expect(profilText(ktx, netz)).toContain('network-inbound')
    }
  })

  // DIE tragende Zeile dieses Blocks. Keine Netz-Erlaubnis nennt einen Pfad, also bleiben
  // Unix-Sockets unter `(deny default)` — und das ist die ganze Grenze zwischen einem
  // gesandkasteten Kind und keels eigenem MCP-Server, der seit Paket D auf einem Socket
  // unter userData lauscht. Am 2026-08-31 gemessen:
  //   (allow network-outbound (remote ip "*:*"))  ->  nc -U <sock>  =  rc 1
  //   (allow network-outbound)  [ungefiltert]     ->  nc -U <sock>  =  rc 0
  it('erlaubt in keinem Modus Unix-Sockets — weder gefiltert noch ungefiltert', () => {
    for (const netz of ['zu', 'offen'] as const) {
      const p = profilText(ktx, netz)
      // Ungefiltert waere die Katastrophe: `(allow network-outbound)` allein gewaehrt sie.
      expect(p).not.toMatch(/\(allow network-outbound\)/)
      expect(p).not.toMatch(/\(allow network-inbound\)/)
      expect(p).not.toMatch(/\(allow network-bind\)/)
      // Und keine pfadgefilterte Netzregel, in keiner Richtung.
      expect(p).not.toMatch(/network-(outbound|inbound|bind)\s+\((literal|subpath|regex)/)
    }
  })

  // Die Zeile, die Paket D ersatzlos gestrichen hat: sie schuetzte keels MCP-Server auf
  // 127.0.0.1 und haette genau das verboten, was `flutter test` braucht. Der Server lauscht
  // dort nicht mehr.
  it('braucht das alte localhost-Verbot nicht mehr', () => {
    expect(profilText(ktx, 'offen')).not.toContain('(deny network-outbound (remote ip "localhost:*"))')
  })
})

describe('profilText — Signal an Kinder (Paket D)', () => {
  // Ohne `(target children)` besteht `flutter test` und HAENGT danach 2:29 min bis zur
  // Wanduhr, statt in 1 Sekunde mit rc=0 zurueckzukommen (2026-08-31 gemessen). Das betrifft
  // jeden Testrunner mit einem Kindprozess. Ein Haenger ist schlimmer als ein Fehlschlag.
  it('erlaubt Signale an Kinder, nicht nur an sich selbst', () => {
    expect(profilText(ktx, 'zu')).toContain('(allow signal (target self) (target children))')
  })
})

describe('profilText — Flutter-Zwischenspeicher (Paket D)', () => {
  const mitFlutter = { ...ktx, flutterWurzel: '/opt/homebrew/share/flutter' }

  it('gibt vier Namen frei, nie den Baum', () => {
    const p = profilText(mitFlutter, 'zu')
    expect(p).toContain('(allow file-write* (literal "/opt/homebrew/share/flutter/bin/cache/engine.stamp"))')
    expect(p).toContain('(allow file-write* (literal "/opt/homebrew/share/flutter/bin/cache/engine.realm"))')
    expect(p).toContain('(allow file-write* (literal "/opt/homebrew/share/flutter/bin/cache/lockfile"))')
    // Das pid-Muster als Regex, mit ZWEI Rueckstrichen je entwertetem Punkt — vier machten die
    // Regel still unwirksam (Paket C, gemessen).
    expect(p).toContain('engine\\.stamp\\.tmp\\.')
  })

  it('gibt den Baum unter bin/cache NICHT frei', () => {
    // Dort liegen dart-sdk/bin/dart und ausfuehrbare Bibliotheken, die der Mensch danach in
    // seiner eigenen Sitzung aufruft — ohne Sandkasten. Exakt das `.gradle`-Muster.
    const p = profilText(mitFlutter, 'zu')
    expect(p).not.toContain('(allow file-write* (subpath "/opt/homebrew/share/flutter')
  })

  it('schweigt ueber Flutter, wenn keines da ist', () => {
    expect(profilText(ktx, 'zu')).not.toContain('bin/cache')
  })
})

describe('Waechter: jedes Leseverbot ist auch ein Schreibverbot', () => {
  // Der Fund vom 2026-08-30: ein deny auf file-read* allein laesst das Ueberschreiben zu —
  // ein Lauf konnte die .env vernichten, ohne sie je gelesen zu haben.
  it('keine deny-Zeile nennt file-read* ohne file-write*', () => {
    const zeilen = profilText(ktx, 'zu').split('\n')
    const nurLesen = zeilen.filter(z => z.includes('(deny file-read*') && !z.includes('file-write*'))
    expect(nurLesen).toEqual([])
  })
})

describe('Waechter: kein Verbot steht vor einer Erlaubnis', () => {
  // Der teuerste Fund dieser Strecke. SBPL entscheidet nach der **zuletzt** passenden Regel:
  // ein `(deny ... .env)` vor `(allow file-write* (subpath <wurzel>))` ist wirkungslos, und im
  // Profiltext sieht es trotzdem nach Schutz aus. Gemessen mit zwei Profilen, die sich nur in
  // der Reihenfolge dieser zwei Zeilen unterschieden: davor gelang `echo > .env`, danach kam
  // 'Operation not permitted'.
  //
  // Dieser Waechter ist der einzige Texttest, der das faengt — alle anderen pruefen, ob eine
  // Zeile *da* ist, und da war sie.
  it('jede allow-Zeile steht vor jeder deny-Zeile', () => {
    const zeilen = profilText(ktx, 'offen').split('\n').map(z => z.trim())
    const istDeny = (z: string): boolean => z.startsWith('(deny') && z !== '(deny default)'
    const letzteErlaubnis = zeilen.findLastIndex(z => z.startsWith('(allow'))
    const erstesVerbot = zeilen.findIndex(istDeny)
    expect(erstesVerbot).toBeGreaterThan(-1)
    expect(letzteErlaubnis).toBeGreaterThan(-1)
    expect(
      erstesVerbot,
      `Verbot in Zeile ${erstesVerbot} steht vor Erlaubnis in Zeile ${letzteErlaubnis} — ` +
      `SBPL nimmt die letzte passende Regel, das Verbot waere wirkungslos.`,
    ).toBeGreaterThan(letzteErlaubnis)
  })
})

describe('Waechter: jedes Verbot ist verankert', () => {
  // Ein globales deny auf *.pem sperrt /etc/ssl/cert.pem und bricht jedes TLS im Kindprozess —
  // also ausgerechnet npm ci.
  it.each(['zu', 'offen'] as const)('jede Datei-deny-Regel nennt die Wurzel oder das Heim (%s)', (netz) => {
    // Zwei Zeilen fallen absichtlich heraus, und beide aus demselben Grund: sie sind keine
    // pfadbezogenen Verbote. "(deny default)" ist die Grundregel der ganzen Sandbox, und
    // "(deny network-outbound …)" verbietet ein Ziel im Netz, kein Verzeichnis — ein Anker auf
    // die Wurzel waere dort sinnlos. Geprueft werden beide Netzmodi, weil das localhost-Verbot
    // nur in einem von beiden entsteht und dieser Waechter sonst am Profil vorbeiliefe, das es
    // traegt.
    const zeilen = profilText(ktx, netz).split('\n')
      .filter(z => z.trimStart().startsWith('(deny'))
      .filter(z => z.trim() !== '(deny default)' && !z.includes('network-'))
    expect(zeilen.length).toBeGreaterThan(0)
    for (const z of zeilen) {
      const verankert = z.includes(ktx.wurzel) || z.includes(ktx.heim)
      expect(verankert, `nicht verankert: ${z}`).toBe(true)
    }
  })
})

describe('profilText — die Verbote der Pfadwache, gespiegelt', () => {
  const p = profilText(ktx, 'zu')
  const alles = p.replace(/\s+/g, ' ')

  it('sperrt ~/.ssh beidseitig', () => {
    expect(alles).toContain('(deny file-read* file-write* (subpath "/Users/x/.ssh"))')
  })
  it('sperrt das userData-Verzeichnis beidseitig', () => {
    expect(alles).toContain(
      '(deny file-read* file-write* (subpath "/Users/x/Library/Application Support/cipher-keel"))',
    )
  })
  it('sperrt ~/.cipher-* beidseitig, in jeder Tiefe', () => {
    // Die Tiefe ist der Punkt: pfadwache prueft den Basename unter dem ganzen Heim-Teilbaum.
    expect(alles).toContain('(deny file-read* file-write* (regex #"^/Users/x/(.*/)?\\.cipher-"))')
  })
  it('sperrt .env unter der Wurzel, in jeder Tiefe', () => {
    expect(alles).toContain('#"^/Users/x/projekt/(.*/)?\\.env(\\..*)?$"')
  })
  it('sperrt Schluesseldateien unter der Wurzel', () => {
    expect(alles).toContain('#"^/Users/x/projekt/(.*/)?(id_rsa|id_ed25519|id_ecdsa|id_dsa)$"')
  })
  it('sperrt Schluesselendungen unter der Wurzel', () => {
    expect(alles).toContain('#"^/Users/x/projekt/(.*/)?[^/]*\\.(pem|key|p12|keystore|jks)$"')
  })
  it('sperrt Shell-Startdateien im Heim, in jeder Tiefe', () => {
    expect(alles).toContain('#"^/Users/x/(.*/)?\\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$"')
  })
})

describe('STANDARD_ZWISCHENSPEICHER', () => {
  // Woertlich und vollstaendig, nicht "enthaelt zwei bekannte Eintraege": der Modulkopf sagt
  // ueber diese Liste, sie sei die weichste Stelle des ganzen Sandkastens und wachse "nie
  // stillschweigend". Mit `toContain` war das eine Absichtserklaerung — ein siebter Eintrag,
  // auch `.ssh`, waere gruen durchgegangen. Erst `toEqual` macht den Satz pruefbar. Wer hier
  // etwas hinzufuegt, aendert diese Zeile mit und begruendet es im Kopf von sandkasten.ts und in
  // docs/anpassbare-flaechen.md.
  //
  // Paket D hat genau das getan: `.dart` und `.flutter` raus (existieren auf dieser Maschine
  // nicht — abgeschrieben statt gemessen), `.dart-tool` rein (was `flutter test` wirklich
  // beschreibt). Dieser Waechter hat die Aenderung eingefordert, statt sie durchzulassen — er
  // ist damit die Zeile, die sich bewaehrt hat.
  it('traegt genau diese Eintraege', () => {
    expect(STANDARD_ZWISCHENSPEICHER).toEqual([
      '.npm', '.pub-cache', '.dart-tool', '.cargo/registry',
      '.gradle/caches', '.gradle/wrapper',
    ])
  })
  it('ist heim-relativ', () => {
    for (const e of STANDARD_ZWISCHENSPEICHER) expect(e.startsWith('/')).toBe(false)
  })
  // `.gradle` allein war der eine Eintrag, der der Art nach nicht in diese Liste gehoerte:
  // `~/.gradle/init.d/*.gradle` wird bei jedem spaeteren Gradle-Aufruf ausgefuehrt, unsandboxed,
  // in der Sitzung des Menschen. Diese Zusicherung haelt die Verengung fest — sie faellt, sobald
  // jemand den Oberordner zurueckholt.
  it('gibt kein Verzeichnis frei, unter dem Gradle Startskripte ausfuehrt', () => {
    expect(STANDARD_ZWISCHENSPEICHER).not.toContain('.gradle')
    for (const e of STANDARD_ZWISCHENSPEICHER) expect(e).not.toBe('.gradle/init.d')
  })
})

/**
 * Der Ausgabesammler. Er wird hier und nicht ueber `starte` geprueft, weil der Schnittpunkt eines
 * Chunks dem Kernel gehoert — ein Test ueber einem echten Lauf koennte ihn nicht herstellen und
 * bliebe gruen, egal wie dekodiert wird.
 *
 * Wofuer das zaehlt: keel misst billige Modelle an den Projekten dieser Maschine, und deren
 * Bauausgabe ist deutsch. Ein Umlaut, der als Ersatzzeichen ankommt, verfaelscht genau die
 * Messung, fuer die es keel gibt.
 */
describe('baueSammler — Kodierung und Deckel', () => {
  it('setzt eine UTF-8-Folge ueber die Chunkgrenze hinweg zusammen', () => {
    const s = baueSammler(1024)
    const bytes = Buffer.from('Prüfung fehlgeschlagen', 'utf-8')
    // Mitten in den zwei Bytes des 'ü' getrennt. Vorher wurde jedes Stueck einzeln dekodiert und
    // aus dem einen Zeichen wurden zwei U+FFFD.
    const schnitt = Buffer.from('Pr', 'utf-8').length + 1
    s.nimm(bytes.subarray(0, schnitt), 'aus')
    s.nimm(bytes.subarray(schnitt), 'aus')
    expect(s.text()).toBe('Prüfung fehlgeschlagen')
    expect(s.text()).not.toContain('�')
  })

  it('setzt auch ein Zeichen ausserhalb der BMP ueber die Chunkgrenze zusammen', () => {
    const s = baueSammler(1024)
    const bytes = Buffer.from('a🔧b', 'utf-8')
    for (let i = 2; i < 5; i++) {
      // Jede der drei moeglichen Trennstellen innerhalb der vier Bytes des Zeichens.
      const t = baueSammler(1024)
      t.nimm(bytes.subarray(0, i), 'aus')
      t.nimm(bytes.subarray(i), 'aus')
      expect(t.text(), `Trennung nach Byte ${i}`).toBe('a🔧b')
    }
    s.nimm(bytes, 'aus')
    expect(s.text()).toBe('a🔧b')
  })

  it('zaehlt den Deckel in Bytes, nicht in UTF-16-Einheiten', () => {
    // 40 Umlaute sind 80 Bytes und 40 UTF-16-Einheiten. Mit `ausgabe.length` als Mass waeren bei
    // einem Deckel von 50 alle 40 durchgegangen — also 80 Bytes bei einer Grenze von 50.
    const s = baueSammler(50)
    s.nimm(Buffer.from('ä'.repeat(40), 'utf-8'), 'aus')
    expect(s.abgeschnitten()).toBe(true)
    expect(Buffer.byteLength(s.text(), 'utf-8')).toBeLessThanOrEqual(50)
  })

  it('kappt nie mitten in einem Zeichen', () => {
    // Deckel 51, Zeichen zwei Bytes breit: der Schnitt faellt zwischen die beiden Bytes des
    // 26. Zeichens und muss um eines zurueckgehen.
    const s = baueSammler(51)
    s.nimm(Buffer.from('ä'.repeat(40), 'utf-8'), 'aus')
    expect(s.text()).not.toContain('�')
    expect(s.text()).toBe('ä'.repeat(25))
  })

  it('nimmt nach dem Kappen nichts mehr an', () => {
    const s = baueSammler(4)
    s.nimm(Buffer.from('aaaaaaaa', 'utf-8'), 'aus')
    s.nimm(Buffer.from('SPAETER', 'utf-8'), 'aus')
    expect(s.text()).toBe('aaaa')
    expect(s.text()).not.toContain('SPAETER')
  })

  it('laesst eine unvollstaendige Folge am Ende lieber weg, als sie zu erfinden', () => {
    const s = baueSammler(1024)
    s.nimm(Buffer.from([0x61, 0xc3]), 'aus')
    expect(s.text()).toBe('a')
  })

  it('haelt Umlaute korrekt, wenn die beiden Haelften auf verschiedenen Stroemen ankommen', () => {
    // 'ü' ist zwei Bytes (0xC3 0xBC). Die erste Haelfte trifft auf stdout ein, dazwischen ein
    // vollstaendiges Zeichen auf stderr, dann die zweite Haelfte wieder auf stdout. Mit einem
    // einzigen, geteilten Dekoder wuerde stderrs 'X' die auf stdout gehaltene 0xC3 vervollstaendigen
    // (und umgekehrt die stdout-Fortsetzung mit dem stderr-Dekoderzustand kollidieren) — beide
    // Texte kaemen mangled zurueck. Mit einem Dekoder je Strom bleibt jede Haelfte bei ihrem Strom,
    // und das Interleaving in Ankunftsreihenfolge bleibt trotzdem erhalten.
    const s = baueSammler(1024)
    s.nimm(Buffer.from([0x41, 0xc3]), 'aus')      // stdout: "A" + erste Haelfte von 'ü'
    s.nimm(Buffer.from('X', 'utf-8'), 'fehler')   // stderr: vollstaendiges Zeichen dazwischen
    s.nimm(Buffer.from([0xbc, 0x42]), 'aus')      // stdout: zweite Haelfte von 'ü' + "B"
    expect(s.text()).toBe('AXüB')
    expect(s.text()).not.toContain('�')
  })
})

describe('schneideAufBytes', () => {
  it('laesst kurzen Text unangetastet', () => {
    expect(schneideAufBytes('äöü', 64)).toBe('äöü')
  })
  it('schneidet auf die naechste Zeichengrenze unterhalb der Grenze', () => {
    expect(schneideAufBytes('äöü', 3)).toBe('ä')
  })
  it('zerreisst kein Surrogatpaar', () => {
    const geschnitten = schneideAufBytes('🔧🔧', 5)
    expect(geschnitten).toBe('🔧')
    expect(geschnitten).not.toContain('�')
  })
})
