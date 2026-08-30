import { describe, it, expect } from 'vitest'
import {
  profilText, sbplLiteral, sbplRegex, STANDARD_ZWISCHENSPEICHER,
  type SandkastenKontext,
} from '../../src/main/harness/sandkasten'

const ktx: SandkastenKontext = {
  wurzel: '/Users/x/projekt',
  heim: '/Users/x',
  userDataPfad: '/Users/x/Library/Application Support/cipher-keel',
  zwischenspeicher: ['/Users/x/.npm', '/Users/x/.pub-cache'],
  tmpdir: '/private/var/folders/tmp',
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

describe('profilText — Netzmodus', () => {
  it('zu: kein allow network', () => {
    expect(profilText(ktx, 'zu')).not.toContain('allow network')
  })
  it('offen: network-outbound und network-bind', () => {
    const p = profilText(ktx, 'offen')
    expect(p).toContain('(allow network-outbound)')
    expect(p).toContain('(allow network-bind)')
  })

  // `offen` heisst "darf ins Netz", nicht "darf an diese Maschine": Paket B legt einen gueltigen
  // MCP-Bearer in den Projektbaum und lauscht auf 127.0.0.1. Ohne diese Zeile hat jeder
  // Paketbefehl keels eigene Werkzeuge in Reichweite.
  it('offen: verbietet trotzdem localhost', () => {
    expect(profilText(ktx, 'offen')).toContain('(deny network-outbound (remote ip "localhost:*"))')
  })

  // Die Stellung ist Teil der Aussage: das Verbot muss hinter `(allow network-outbound)` stehen,
  // sonst haengt seine Wirkung an einer Eigenschaft des ungefilterten Gegenparts statt an der
  // Ordnung, die dieses Profil sonst ueberall traegt.
  it('offen: das localhost-Verbot steht hinter der Netz-Erlaubnis', () => {
    const p = profilText(ktx, 'offen')
    expect(p.indexOf('(deny network-outbound'))
      .toBeGreaterThan(p.indexOf('(allow network-outbound)'))
  })

  it('zu: kein Netzverbot noetig, es gibt keine Netz-Erlaubnis', () => {
    expect(profilText(ktx, 'zu')).not.toContain('network-outbound')
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
  it('traegt genau diese Eintraege', () => {
    expect(STANDARD_ZWISCHENSPEICHER).toEqual([
      '.npm', '.pub-cache', '.dart', '.flutter', '.cargo/registry',
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
