// Gegenproben, die zu dieser Datei gehoeren — jede wurde einmal ausgefuehrt und rot gesehen,
// weil ein Test, der nie rot war, kein Test ist:
//
//   1. `pruefeUrl` in `holeSicher` nur beim ersten Sprung aufrufen (`&& sprung === 0`):
//      4 rot, darunter beide Tailscale-Weiterleitungstests. Der Hauptlauf-Test meldete
//      `ok: true` — die Seite unter 100.78.7.108 wurde tatsaechlich geholt.
//   2. Suffixpruefung durch `host.endsWith(eintrag)` ersetzt: 1 rot —
//      `boesenodejs.org` steht damit auf der Positivliste. Das ist der klassische Suffix-Fehler.
//   3. Suffixpruefung durch `host.includes(eintrag)` ersetzt: 4 rot, darunter
//      `example.org.boeser-host.de`.
//   4. Den Eintrag `100.64.0.0/10` aus GESPERRTE_V4 entfernt: 11 rot, darunter Ollama, MS-01
//      und der VPS.
//   5. Die Bindung aus einer *zweiten* Aufloesung gebaut — also das, was fetch mit einem Namen
//      ohnehin tut: 5 rot. Nimmt man dazu die Sperrlisten-Pruefung in `bindeAufAdressen` heraus,
//      steht im Ergebnis `erreicht: ['100.78.7.108']` und `text: 'INHALT VON 100.78.7.108'` — der
//      Angriff des Pruefers, ausgefuehrt.
//   6. `gegenDieUhr` um die Aufloesung entfernt: 1 rot, 821 ms Laufzeit bei 30 ms Budget, und der
//      Grund hiess am Ende „Mehr als 3 Weiterleitungen" statt „Zeitbudget".
//   7. Den Literal-Zweig in `holeSicher` uebersprungen: 3 rot, Meldung „Namensaufloesung
//      fehlgeschlagen fuer 100.78.7.108" statt „gesperrtes Netz (Tailscale)".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pruefeUrl, holeSicher, bindeAufAdressen } from '../../src/main/harness/netzwache'
import type {
  NetzWacheKontext, AbrufGrenzen, Abrufer, Abrufauftrag, Bindung, AufloesungsTreffer,
} from '../../src/main/harness/netzwache'

// A plausible whitelist: documentation sites whose content we treat as a reference work.
const LISTE = ['nodejs.org', 'developer.mozilla.org', 'example.org']

/** Whitelist mode with one resolved address. The address is the *only* thing rule 2 looks at. */
function haupt(adressen: string[] = ['93.184.216.34']): NetzWacheKontext {
  return { modus: 'whitelist', positivliste: LISTE, adressen }
}

/** The researcher's sub-run: no positive list, every other rule unchanged. */
function offen(adressen: string[] = ['93.184.216.34']): NetzWacheKontext {
  return { modus: 'offen', positivliste: [], adressen }
}

describe('pruefeUrl: nur https', () => {
  it('laesst eine gewoehnliche https-URL durch', () => {
    expect(pruefeUrl('https://developer.mozilla.org/de/docs/Web', haupt()))
      .toEqual({ ok: true, url: 'https://developer.mozilla.org/de/docs/Web' })
  })

  for (const roh of [
    'http://example.org/',
    'file:///etc/passwd',
    'data:text/html,<script>1</script>',
    'ftp://example.org/datei',
    'javascript:alert(1)',
    'ws://example.org/',
    'chrome-extension://abc/x',
  ]) {
    it(`lehnt ${roh.split(':')[0]}: ab`, () => {
      const e = pruefeUrl(roh, offen())
      expect(e.ok).toBe(false)
      expect(e.ok === false && e.grund).toContain('Nur https')
    })
  }

  it('lehnt eine schemalose //host-URL ab, statt sie zu ergaenzen', () => {
    // Without a base, `new URL` throws here. The guard must answer that with a refusal and not
    // quietly pick a scheme — a schemeless URL that becomes https by default is a rule the
    // caller never agreed to.
    const e = pruefeUrl('//example.org/x', offen())
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Keine gueltige URL')
  })

  it('lehnt Unsinn ab, der keine URL ist', () => {
    expect(pruefeUrl('nicht mal fast eine url', offen()).ok).toBe(false)
  })
})

describe('pruefeUrl: gesperrte Netze, geprueft an der Adresse', () => {
  const gesperrt: Array<[string, string]> = [
    ['127.0.0.1', 'Loopback 127/8'],
    ['127.13.13.13', 'Loopback, nicht nur .0.1'],
    ['10.0.0.1', 'privat 10/8'],
    ['172.16.0.1', 'privat 172.16/12, untere Kante'],
    ['172.31.255.255', 'privat 172.16/12, obere Kante'],
    ['192.168.1.1', 'privat 192.168/16'],
    ['169.254.169.254', 'Link-Local — die Metadaten-Adresse'],
    ['0.0.0.0', 'dieses Netz 0/8'],
    ['0.1.2.3', 'dieses Netz 0/8, nicht nur 0.0.0.0'],
    ['100.64.0.1', 'Tailscale 100.64/10, untere Kante'],
    ['100.78.7.108', 'Tailscale: der unauthentifizierte Ollama'],
    ['100.67.95.13', 'Tailscale: TrueNAS und n8n auf MS-01'],
    ['100.64.99.118', 'Tailscale: der VPS mit sudo'],
    ['100.127.255.255', 'Tailscale 100.64/10, obere Kante'],
    ['::1', 'IPv6-Loopback'],
    ['fc00::1', 'IPv6 ULA fc00::/7, untere Kante'],
    ['fdff:ffff::1', 'IPv6 ULA fc00::/7, obere Haelfte fd..'],
    ['fe80::1', 'IPv6 Link-Local fe80::/10'],
    ['febf:ffff::1', 'IPv6 Link-Local fe80::/10, obere Kante'],
    ['::ffff:10.0.0.1', 'IPv4-mapped IPv6, punktierte Form'],
    ['::ffff:a00:1', 'IPv4-mapped IPv6, hexadezimale Form'],
    ['::ffff:100.78.7.108', 'IPv4-mapped IPv6 auf Tailscale'],
    ['::10.0.0.1', 'IPv4-compatible IPv6, die alte Form'],
    ['::', 'die unspezifizierte Adresse'],
    // Runde 3, Fund 4: die dritte und vierte Einbettungsform von IPv4 in IPv6. In einem Netz mit
    // DNS64/NAT64 ist 64:ff9b::100.78.7.108 der regulaere Weg zum Ollama, und 6to4 traegt die
    // Adresse des Uebergangs in Gruppe 1 und 2. Beide fielen durch alle Zweige und waren frei.
    ['64:ff9b::100.78.7.108', 'NAT64 64:ff9b::/96 auf Tailscale'],
    ['64:ff9b::644e:76c', 'NAT64, hexadezimale Schreibweise derselben Adresse'],
    ['64:ff9b::10.0.0.1', 'NAT64 auf ein privates Netz'],
    ['64:ff9b:1::100.78.7.108', 'NAT64 in der Ortsform aus RFC 8215 — Einbettung unbekannt'],
    ['2002:644e:76c::1', '6to4 2002::/16 mit Tailscale als Uebergang'],
    ['2002:c0a8:101::1', '6to4 mit 192.168.1.1 als Uebergang'],
    // Rundfunk und Gruppenruf. Ueber TCP praktisch nicht erreichbar, aber die Sperrliste ist die
    // Stelle, an der so etwas hinterher niemand mehr sucht.
    ['255.255.255.255', 'der Rundruf'],
    ['224.0.0.1', 'Gruppenruf 224/4'],
    ['239.255.255.250', 'Gruppenruf: SSDP'],
  ]

  for (const [adresse, warum] of gesperrt) {
    it(`lehnt ${adresse} ab (${warum})`, () => {
      const e = pruefeUrl('https://example.org/x', haupt([adresse]))
      expect(e.ok).toBe(false)
      expect(e.ok === false && e.grund).toContain('gesperrten Netz')
      expect(e.ok === false && e.grund).toContain(adresse)
    })
  }

  const erlaubt: Array<[string, string]> = [
    ['93.184.216.34', 'oeffentlich'],
    ['9.255.255.255', 'direkt unter 10/8'],
    ['11.0.0.1', 'direkt ueber 10/8'],
    ['172.15.255.255', 'direkt unter 172.16/12 — die Kante, die falsch gerundet wird'],
    ['172.32.0.1', 'direkt ueber 172.16/12'],
    ['100.63.255.255', 'direkt unter dem Tailscale-Bereich'],
    ['100.128.0.1', 'direkt ueber dem Tailscale-Bereich'],
    ['169.253.0.1', 'direkt unter 169.254/16'],
    ['2606:4700:4700::1111', 'oeffentliches IPv6'],
    ['fbff:ffff::1', 'direkt unter fc00::/7'],
    ['fec0::1', 'direkt ueber fe80::/10'],
    // Die Gegenprobe zu den neuen Einbettungen: geurteilt wird ueber die eingebettete Adresse,
    // nicht ueber das Praefix. Sonst waere in einem NAT64-Netz jedes IPv4-Ziel gesperrt.
    ['64:ff9b::93.184.216.34', 'NAT64 auf ein oeffentliches Ziel'],
    ['2002:5db8:d822::1', '6to4 mit oeffentlichem Uebergang 93.184.216.34'],
    ['223.255.255.255', 'direkt unter dem Gruppenruf-Bereich 224/4'],
  ]

  for (const [adresse, warum] of erlaubt) {
    it(`laesst ${adresse} durch (${warum})`, () => {
      expect(pruefeUrl('https://example.org/x', haupt([adresse])).ok).toBe(true)
    })
  }

  it('lehnt einen erlaubten Namen ab, dessen A-Record ins private Netz zeigt', () => {
    // The whole reason rule 2 reads addresses and not names: `example.org` is on the list and
    // still must not be reached when it resolves to 10.0.0.1.
    const e = pruefeUrl('https://example.org/x', haupt(['10.0.0.1']))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('gesperrten Netz')
  })

  it('lehnt ab, sobald *eine* von mehreren Adressen gesperrt ist', () => {
    // A resolver may hand back several records and the client picks one. Judging only the first
    // would make the guard's verdict depend on record order.
    const e = pruefeUrl('https://example.org/x', haupt(['93.184.216.34', '100.78.7.108']))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('100.78.7.108')
  })

  it('lehnt ab, wenn gar keine Adresse vorliegt', () => {
    const e = pruefeUrl('https://example.org/x', haupt([]))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Keine aufgeloeste Adresse')
  })

  it('lehnt eine Adresse ab, die sich nicht lesen laesst', () => {
    // Fail closed: an address the guard cannot parse is one it cannot clear.
    const e = pruefeUrl('https://example.org/x', haupt(['keine-adresse']))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Adresse')
  })

  it('prueft eine IP-Literal-URL selbst, auch wenn der Aufloeser etwas anderes behauptet', () => {
    // `adressen` comes from outside. For a literal-IP URL the literal itself is a fact the guard
    // has in hand, and it must not depend on an injected resolver telling the truth about it.
    const e = pruefeUrl('https://10.0.0.1/x', offen(['93.184.216.34']))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('gesperrten Netz')
  })

  it('erkennt eine dezimal geschriebene Loopback-Adresse', () => {
    // `https://2130706433/` is 127.0.0.1 to every URL parser and every fetch implementation.
    const e = pruefeUrl('https://2130706433/', offen(['93.184.216.34']))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('127.0.0.1')
  })

  it('erkennt ein IPv6-Literal in Klammern', () => {
    expect(pruefeUrl('https://[::1]/x', offen(['93.184.216.34'])).ok).toBe(false)
  })
})

describe('pruefeUrl: die Positivliste', () => {
  it('laesst einen Eintrag exakt durch', () => {
    expect(pruefeUrl('https://nodejs.org/api/fs.html', haupt()).ok).toBe(true)
  })

  it('laesst eine Unterdomaene eines Eintrags durch', () => {
    expect(pruefeUrl('https://docs.example.org/a', haupt()).ok).toBe(true)
  })

  it('lehnt die Suffix-Falle example.org.boeser-host.de ab', () => {
    // The list entry sits at the *front* of the host, and boeser-host.de belongs to the attacker.
    // Red under `includes`.
    const e = pruefeUrl('https://example.org.boeser-host.de/x', haupt())
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Positivliste')
  })

  it('lehnt einen Host ab, der nur auf den Eintrag endet, ohne Punktgrenze', () => {
    // The classic suffix mistake: `'boesenodejs.org'.endsWith('nodejs.org')` is true, and that
    // domain is free to register. Red under `endsWith` — the dot boundary is the whole rule.
    expect(pruefeUrl('https://boesenodejs.org/x', haupt()).ok).toBe(false)
  })

  it('lehnt einen Host ab, der den Eintrag nur enthaelt', () => {
    expect(pruefeUrl('https://example.org.evil.com/x', haupt()).ok).toBe(false)
    expect(pruefeUrl('https://evil.com/?ziel=nodejs.org', haupt()).ok).toBe(false)
  })

  it('vergleicht ohne Ruecksicht auf Gross- und Kleinschreibung', () => {
    expect(pruefeUrl('https://NodeJS.ORG/api', haupt()).ok).toBe(true)
    expect(pruefeUrl('https://DOCS.Example.Org/a', haupt()).ok).toBe(true)
    const ktx: NetzWacheKontext = { modus: 'whitelist', positivliste: ['NodeJS.Org'], adressen: ['93.184.216.34'] }
    expect(pruefeUrl('https://nodejs.org/api', ktx).ok).toBe(true)
  })

  it('faellt nicht auf einen kyrillischen Doppelgaenger herein', () => {
    // `ехample.org` with Cyrillic е and х. `new URL` turns it into its punycode form, which is
    // not `example.org` — without that normalisation a raw string compare would pass it.
    const e = pruefeUrl('https://ехample.org/x', haupt())
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Positivliste')
  })

  it('lehnt bei leerer Positivliste alles ab', () => {
    const ktx: NetzWacheKontext = { modus: 'whitelist', positivliste: [], adressen: ['93.184.216.34'] }
    expect(pruefeUrl('https://nodejs.org/api', ktx).ok).toBe(false)
  })

  it('laesst im Modus offen auch einen Host ausserhalb der Liste durch', () => {
    expect(pruefeUrl('https://irgendein-forum.de/thread/1', offen()).ok).toBe(true)
  })

  it('sperrt im Modus offen die internen Netze unveraendert', () => {
    // The sub-run trades the positive list away, nothing else.
    const e = pruefeUrl('https://irgendein-forum.de/x', offen(['100.78.7.108']))
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('gesperrten Netz')
  })

  it('behandelt den abschliessenden Punkt als denselben Namen', () => {
    expect(pruefeUrl('https://nodejs.org./api', haupt()).ok).toBe(true)
  })
})

describe('pruefeUrl: Zugangsdaten in der URL', () => {
  it('lehnt Benutzer und Passwort ab', () => {
    const e = pruefeUrl('https://benutzer:geheim@example.org/x', haupt())
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Zugangsdaten')
  })

  it('lehnt auch einen Benutzer ohne Passwort ab', () => {
    expect(pruefeUrl('https://benutzer@example.org/x', haupt()).ok).toBe(false)
  })

  it('lehnt Zugangsdaten auch im Modus offen ab', () => {
    expect(pruefeUrl('https://benutzer:geheim@forum.de/x', offen()).ok).toBe(false)
  })

  it('faellt nicht auf https://example.org@evil.com herein', () => {
    // The host here is evil.com; example.org is the username. Both rules would catch it, and
    // both are asserted so that dropping either one still shows up.
    const e = pruefeUrl('https://example.org@evil.com/x', haupt())
    expect(e.ok).toBe(false)
    expect(pruefeUrl('https://example.org@evil.com/x', offen()).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------
// holeSicher
// ---------------------------------------------------------------------------------------------

type Aufruf = Abrufauftrag

/** Records every request and answers from a table. An unknown URL is a test bug, so it throws. */
function abrufer(tabelle: Record<string, () => Response>, aufrufe: Aufruf[]): Abrufer {
  return (auftrag: Abrufauftrag): Promise<Response> => {
    aufrufe.push(auftrag)
    const macher = tabelle[auftrag.url]
    if (!macher) return Promise.reject(new Error(`unerwartete URL im Test: ${auftrag.url}`))
    return Promise.resolve(macher())
  }
}

function aufloeser(karte: Record<string, string[]>): (host: string) => Promise<string[]> {
  return async (host: string) => {
    const a = karte[host]
    if (!a) throw new Error(`kein Eintrag fuer ${host}`)
    return a
  }
}

/**
 * Ein Abrufer, der sich verhaelt wie ein richtiger Klient: er stellt die Verbindung ueber die
 * Bindung her, die die Wache ihm gibt, und liefert den Inhalt der Adresse, die er dabei erreicht.
 * Damit steht im Ergebnis, *wohin* der Socket ging — und nicht nur, welchen Namen jemand geprueft
 * hat.
 */
function verbindenderAbrufer(erreicht: string[]): Abrufer {
  return (auftrag: Abrufauftrag) => new Promise<Response>((fertig, ablehnen) => {
    auftrag.bindung(new URL(auftrag.url).hostname, { all: true }, (fehler, treffer) => {
      if (fehler !== null) { ablehnen(fehler); return }
      const adresse = (treffer as AufloesungsTreffer[])[0].address
      erreicht.push(adresse)
      fertig(new Response(`INHALT VON ${adresse}`, { status: 200 }))
    })
  })
}

/** Sammelt, was eine Bindung herausgibt — synchron, weil der Rueckruf synchron aufgerufen wird. */
function ueberBindung(
  bindung: Bindung,
  hostname: string,
  optionen: { family?: number; all?: boolean } = { all: true },
): { fehler: Error | null; adressen: string[] } {
  let ergebnis: { fehler: Error | null; adressen: string[] } | null = null
  bindung(hostname, optionen, (fehler, treffer, familie) => {
    if (fehler !== null) { ergebnis = { fehler, adressen: [] }; return }
    ergebnis = typeof treffer === 'string'
      ? { fehler: null, adressen: [`${treffer}/${familie}`] }
      : { fehler: null, adressen: (treffer as AufloesungsTreffer[]).map(t => `${t.address}/${t.family}`) }
  })
  if (ergebnis === null) throw new Error('die Bindung hat ihren Rueckruf nicht aufgerufen')
  return ergebnis
}

const GRENZEN: AbrufGrenzen = { maxBytes: 100_000, zeitbudgetMs: 5_000, maxWeiterleitungen: 3 }

const seite = (text: string) => () => new Response(text, { status: 200 })
const um = (ziel: string, status = 302) => () => new Response(null, { status, headers: { location: ziel } })

describe('holeSicher: der gewoehnliche Weg', () => {
  it('holt eine erlaubte Seite und gibt Text und Ziel-URL zurueck', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/api/fs.html', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/api/fs.html': seite('Dateisystem') }, aufrufe),
    })
    expect(e).toEqual({ ok: true, text: 'Dateisystem', endUrl: 'https://nodejs.org/api/fs.html' })
    expect(aufrufe).toHaveLength(1)
  })

  it('schickt keine Zugangsdaten, keine Cookies und folgt nicht selbst', async () => {
    const aufrufe: Aufruf[] = []
    await holeSicher('https://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/a': seite('x') }, aufrufe),
    })
    const init = aufrufe[0].init
    expect(init.redirect).toBe('manual')
    expect(init.credentials).toBe('omit')
    const kopf = JSON.stringify(init.headers ?? {}).toLowerCase()
    expect(kopf).not.toContain('cookie')
    expect(kopf).not.toContain('authorization')
  })

  it('prueft vor dem Abruf: eine http-URL erzeugt weder DNS-Abfrage noch Anfrage', async () => {
    const aufrufe: Aufruf[] = []
    let aufgeloest = 0
    const e = await holeSicher('http://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: async (h) => { aufgeloest++; return aufloeser({ 'nodejs.org': ['104.20.22.46'] })(h) },
      abrufen: abrufer({}, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(aufrufe).toHaveLength(0)
    expect(aufgeloest).toBe(0)
  })

  it('benennt einen fehlgeschlagenen Namensaufloeser, statt ihn zu verschlucken', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: aufloeser({}),
      abrufen: abrufer({}, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Namensaufloesung')
    expect(aufrufe).toHaveLength(0)
  })

  it('benennt einen Fehlerstatus', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/a': () => new Response('weg', { status: 404 }) }, aufrufe),
    })
    expect(e).toEqual({ ok: false, grund: 'Abruf beantwortet mit HTTP 404' })
  })

  it('benennt einen geworfenen Netzfehler', async () => {
    const e = await holeSicher('https://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: (() => Promise.reject(new Error('ECONNREFUSED'))) as Abrufer,
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('ECONNREFUSED')
  })
})

describe('holeSicher: Weiterleitungen', () => {
  it('folgt einer Weiterleitung auf ein erlaubtes Ziel', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/alt', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'], 'developer.mozilla.org': ['93.184.216.34'] }),
      abrufen: abrufer({
        'https://nodejs.org/alt': um('https://developer.mozilla.org/neu'),
        'https://developer.mozilla.org/neu': seite('Inhalt'),
      }, aufrufe),
    })
    expect(e).toEqual({ ok: true, text: 'Inhalt', endUrl: 'https://developer.mozilla.org/neu' })
    expect(aufrufe.map(a => a.url)).toEqual(['https://nodejs.org/alt', 'https://developer.mozilla.org/neu'])
  })

  it('loest ein relatives Location-Feld gegen die aktuelle URL auf', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/a/b', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({
        'https://nodejs.org/a/b': um('/c'),
        'https://nodejs.org/c': seite('C'),
      }, aufrufe),
    })
    expect(e.ok).toBe(true)
  })

  // ---- der wichtigste Test dieser Datei -------------------------------------------------------
  it('lehnt im Hauptlauf eine Weiterleitung auf ein Tailscale-Ziel ab', async () => {
    // The attack this whole module exists for. nodejs.org is on the list and clears every check
    // at hop 0. Its answer is a 302 to docs.example.org — also on the list, and its A record
    // points at the unauthenticated Ollama on the tailnet. A guard that checks only the first URL
    // — or that lets fetch follow the redirect itself — runs a foreign model out of the main
    // process here. The address check has to run again after the redirect, and it is the address
    // and not the name that decides.
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/api', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'], 'docs.example.org': ['100.78.7.108'] }),
      abrufen: abrufer({
        'https://nodejs.org/api': um('https://docs.example.org/api/generate'),
        'https://docs.example.org/api/generate': seite('DARF NIE ABGERUFEN WERDEN'),
      }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('gesperrten Netz')
    expect(e.ok === false && e.grund).toContain('100.78.7.108')
    // And it must not have been fetched at all — the refusal happens before the request.
    expect(aufrufe.map(a => a.url)).toEqual(['https://nodejs.org/api'])
  })

  it('lehnt im Unterlauf eine Weiterleitung auf ein Tailscale-Ziel ab', async () => {
    // Same attack in the researcher's sub-run, where there is no positive list to catch it and
    // the address check is the only thing standing between a found page and 100.78.7.108:11434.
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://irgendein-forum.de/thread/1', offen(), GRENZEN, {
      aufloesen: aufloeser({ 'irgendein-forum.de': ['93.184.216.34'], 'ollama.intern': ['100.78.7.108'] }),
      abrufen: abrufer({
        'https://irgendein-forum.de/thread/1': um('https://ollama.intern/api/generate'),
        'https://ollama.intern/api/generate': seite('DARF NIE ABGERUFEN WERDEN'),
      }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('100.78.7.108')
    expect(aufrufe.map(a => a.url)).toEqual(['https://irgendein-forum.de/thread/1'])
  })

  it('lehnt eine Weiterleitung auf einen Host ausserhalb der Positivliste ab, ohne ihn aufzuloesen', async () => {
    // The suffix trap arriving by redirect. And no DNS query goes out for it either: a redirect
    // to `https://<geheimnis>.boeser-host.de/` would otherwise leak through the resolver even
    // though the request never happens.
    const aufrufe: Aufruf[] = []
    const gefragt: string[] = []
    const e = await holeSicher('https://nodejs.org/api', haupt(), GRENZEN, {
      aufloesen: async (h) => { gefragt.push(h); return aufloeser({ 'nodejs.org': ['104.20.22.46'] })(h) },
      abrufen: abrufer({
        'https://nodejs.org/api': um('https://nodejs.org.boeser-host.de/x'),
      }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Positivliste')
    expect(aufrufe).toHaveLength(1)
    expect(gefragt).toEqual(['nodejs.org'])
  })

  it('lehnt eine Weiterleitung auf ein anderes Schema ab', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/api', offen(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/api': um('file:///etc/passwd') }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Nur https')
  })

  it('lehnt eine Kette ab, die laenger ist als erlaubt', async () => {
    const aufrufe: Aufruf[] = []
    const grenzen: AbrufGrenzen = { ...GRENZEN, maxWeiterleitungen: 2 }
    const e = await holeSicher('https://nodejs.org/0', haupt(), grenzen, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({
        'https://nodejs.org/0': um('https://nodejs.org/1'),
        'https://nodejs.org/1': um('https://nodejs.org/2'),
        'https://nodejs.org/2': um('https://nodejs.org/3'),
        'https://nodejs.org/3': seite('zu spaet'),
      }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Weiterleitungen')
    expect(aufrufe.map(a => a.url)).toEqual([
      'https://nodejs.org/0', 'https://nodejs.org/1', 'https://nodejs.org/2',
    ])
  })

  it('lehnt bei maxWeiterleitungen 0 schon die erste Weiterleitung ab', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/0', haupt(), { ...GRENZEN, maxWeiterleitungen: 0 }, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/0': um('https://nodejs.org/1') }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(aufrufe).toHaveLength(1)
  })

  it('erkennt jede Weiterleitungs-Kennzahl, nicht nur 302', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const aufrufe: Aufruf[] = []
      const e = await holeSicher('https://nodejs.org/api', haupt(), GRENZEN, {
        aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'], 'docs.example.org': ['100.78.7.108'] }),
        abrufen: abrufer({
          'https://nodejs.org/api': um('https://docs.example.org/x', status),
          'https://docs.example.org/x': seite('DARF NIE ABGERUFEN WERDEN'),
        }, aufrufe),
      })
      expect(e.ok, `Status ${status}`).toBe(false)
      expect(aufrufe, `Status ${status}`).toHaveLength(1)
    }
  })

  it('benennt eine Weiterleitung ohne Ziel, statt sie als Inhalt zu behandeln', async () => {
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://nodejs.org/api', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/api': () => new Response(null, { status: 302 }) }, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('ohne Ziel')
  })
})

describe('holeSicher: Groesse und Zeit', () => {
  it('bricht waehrend des Lesens ab, nicht erst danach', async () => {
    // The stream hands out 1 KiB per pull and would never stop on its own. With a 4 KiB cap, a
    // guard that measures after reading would spin here forever (in production: a 5 GB body in
    // memory). Counting the pulls is what makes "during" checkable.
    let gezogen = 0
    const strom = new ReadableStream<Uint8Array>({
      pull(steuerung) {
        gezogen++
        if (gezogen > 10_000) { steuerung.close(); return }
        steuerung.enqueue(new TextEncoder().encode('x'.repeat(1024)))
      },
    })
    const e = await holeSicher('https://nodejs.org/gross', haupt(), { ...GRENZEN, maxBytes: 4096 }, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: (() => Promise.resolve(new Response(strom, { status: 200 }))) as Abrufer,
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Groessengrenze')
    expect(gezogen).toBeLessThan(20)
  })

  it('laesst einen Koerper genau an der Grenze durch', async () => {
    const e = await holeSicher('https://nodejs.org/a', haupt(), { ...GRENZEN, maxBytes: 5 }, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: (() => Promise.resolve(new Response('12345', { status: 200 }))) as Abrufer,
    })
    expect(e).toEqual({ ok: true, text: '12345', endUrl: 'https://nodejs.org/a' })
  })

  it('lehnt einen Koerper ein Byte ueber der Grenze ab', async () => {
    const e = await holeSicher('https://nodejs.org/a', haupt(), { ...GRENZEN, maxBytes: 5 }, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: (() => Promise.resolve(new Response('123456', { status: 200 }))) as Abrufer,
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Groessengrenze')
  })

  it('bricht ab, wenn das Zeitbudget verstreicht, und benennt es', async () => {
    // The fetch never answers. Only the AbortSignal ends this.
    const haengend: Abrufer = (auftrag) =>
      new Promise<Response>((_fertig, ablehnen) => {
        auftrag.init.signal?.addEventListener('abort', () => ablehnen(new Error('Dieser Vorgang wurde abgebrochen')))
      })
    const e = await holeSicher('https://nodejs.org/langsam', haupt(), { ...GRENZEN, zeitbudgetMs: 20 }, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: haengend,
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Zeitbudget')
  })

  it('gibt dem Abrufer ueberhaupt ein Abbruchsignal mit', async () => {
    const aufrufe: Aufruf[] = []
    await holeSicher('https://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: abrufer({ 'https://nodejs.org/a': seite('x') }, aufrufe),
    })
    expect(aufrufe[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('teilt sich das Zeitbudget ueber die ganze Kette, nicht pro Sprung', async () => {
    // Two hops, each answering after 30 ms, against a 40 ms budget. A per-hop timer would let
    // this through; the run as a whole must not outlive its budget.
    const langsam: Abrufer = (auftrag) =>
      new Promise<Response>((fertig, ablehnen) => {
        const uhr = setTimeout(() => {
          fertig(auftrag.url.endsWith('/0')
            ? new Response(null, { status: 302, headers: { location: 'https://nodejs.org/1' } })
            : new Response('spaet', { status: 200 }))
        }, 30)
        auftrag.init.signal?.addEventListener('abort', () => { clearTimeout(uhr); ablehnen(new Error('abgebrochen')) })
      })
    const e = await holeSicher('https://nodejs.org/0', haupt(), { ...GRENZEN, zeitbudgetMs: 40 }, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46'] }),
      abrufen: langsam,
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Zeitbudget')
  })

  // ---- Runde 3, Fund 2 -------------------------------------------------------------------------
  it('bindet auch die Namensaufloesung ans Zeitbudget', async () => {
    // Das Budget trug den Kommentar „fuer die ganze Kette" und deckte doch nur den Abruf: das
    // Signal ging an `abrufen`, nie an `aufloesen`. Wer den autoritativen Nameserver seiner
    // eigenen Kette betreibt, laesst jede Aufloesung haengen und haelt den Werkzeugaufruf ueber
    // maxWeiterleitungen+1 Aufloesungen offen. Vorher gemessen: 30 ms Budget, ~800 ms Laufzeit,
    // und die Ablehnung hiess am Ende „Mehr als 3 Weiterleitungen" statt „Zeitbudget".
    const begonnen = Date.now()
    const e = await holeSicher('https://nodejs.org/0', haupt(), { ...GRENZEN, zeitbudgetMs: 30 }, {
      aufloesen: async () => {
        await new Promise(fertig => setTimeout(fertig, 200))
        return ['93.184.216.34']
      },
      abrufen: () => Promise.resolve(
        new Response(null, { status: 302, headers: { location: 'https://nodejs.org/1' } }),
      ),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('Zeitbudget')
    expect(Date.now() - begonnen).toBeLessThan(150)
  })

  it('gibt dem Aufloeser das Abbruchsignal mit, damit er selbst abbrechen kann', async () => {
    // Node bricht eine laufende Abfrage nicht von selbst ab; das Rennen gegen die Uhr rettet nur
    // die Antwortzeit. Damit die Aufloesung wirklich endet, muss die Implementierung das Signal
    // bekommen — deshalb steht es in der Schnittstelle und nicht bloss im Kommentar.
    const signale: unknown[] = []
    await holeSicher('https://nodejs.org/a', haupt(), GRENZEN, {
      aufloesen: async (_host: string, signal?: AbortSignal) => { signale.push(signal); return ['93.184.216.34'] },
      abrufen: abrufer({ 'https://nodejs.org/a': seite('x') }, []),
    })
    expect(signale).toHaveLength(1)
    expect(signale[0]).toBeInstanceOf(AbortSignal)
  })
})

// ---------------------------------------------------------------------------------------------
// Runde 3, Fund 1: geprueft wurde die Adresse, geholt wurde der Name
// ---------------------------------------------------------------------------------------------

describe('holeSicher: die Verbindung haengt an der geprueften Adresse', () => {
  it('gibt dem Abrufer genau die freigegebenen Adressen mit, nicht nur den Namen', async () => {
    // Der zweite Beleg des Pruefers, ohne jede Zeitfrage: der Abrufer bekam `https://…/x` und nie
    // die Adressen, ueber die geurteilt worden war. Damit loeste er ein zweites Mal auf.
    const aufrufe: Aufruf[] = []
    await holeSicher('https://nodejs.org/api', haupt(), GRENZEN, {
      aufloesen: aufloeser({ 'nodejs.org': ['104.20.22.46', '2606:4700::6810:162e'] }),
      abrufen: abrufer({ 'https://nodejs.org/api': seite('x') }, aufrufe),
    })
    expect(aufrufe[0].url).toBe('https://nodejs.org/api')
    expect(aufrufe[0].host).toBe('nodejs.org')
    expect(aufrufe[0].adressen).toEqual(['104.20.22.46', '2606:4700::6810:162e'])
  })

  it('haelt die Adresse fest, wenn der Aufloeser beim zweiten Mal etwas anderes sagt', async () => {
    // Der kritische Befund, nachgestellt. `aufloesen` liefert beim ersten Aufruf die oeffentliche
    // Adresse und danach den Ollama im Tailnet — ein Angreifer mit TTL 0 auf seiner eigenen Zone.
    // Vorher lief der Abruf gegen den *Namen*, fetch loeste ein zweites Mal auf und das Ergebnis
    // war `{ ok: true, text: 'INHALT VON 100.78.7.108' }`: die Wache hatte freigegeben, der Socket
    // hatte den unauthentifizierten Ollama erreicht. Der Abrufer hier verbindet ueber die Bindung,
    // also so wie ein richtiger Klient es tun muss.
    let male = 0
    const erreicht: string[] = []
    const e = await holeSicher('https://example.org/x', offen(), GRENZEN, {
      aufloesen: async () => (male++ === 0 ? ['93.184.216.34'] : ['100.78.7.108']),
      abrufen: verbindenderAbrufer(erreicht),
    })
    expect(erreicht).toEqual(['93.184.216.34'])
    expect(e).toEqual({ ok: true, text: 'INHALT VON 93.184.216.34', endUrl: 'https://example.org/x' })
  })

  it('haelt die Adresse auch am letzten Glied einer Weiterleitungskette fest', async () => {
    // Dritter Beleg des Pruefers: jeder Sprung wird nach demselben Muster geprueft und geholt,
    // also traegt jeder Sprung denselben Fehler. Hier ist der *zweite* Host der praeparierte.
    const erreicht: string[] = []
    const antworten: Record<string, () => Response> = {
      'https://irgendein-forum.de/thread/1': um('https://blog.beispiel.de/eintrag'),
    }
    let male = 0
    const e = await holeSicher('https://irgendein-forum.de/thread/1', offen(), GRENZEN, {
      aufloesen: async (host: string) => {
        if (host === 'irgendein-forum.de') return ['93.184.216.34']
        return male++ === 0 ? ['203.0.113.9'] : ['100.78.7.108']
      },
      abrufen: (auftrag) => {
        const fest = antworten[auftrag.url]
        if (fest) return Promise.resolve(fest())
        return verbindenderAbrufer(erreicht)(auftrag)
      },
    })
    expect(erreicht).toEqual(['203.0.113.9'])
    expect(e).toEqual({ ok: true, text: 'INHALT VON 203.0.113.9', endUrl: 'https://blog.beispiel.de/eintrag' })
  })
})

describe('bindeAufAdressen: das letzte Tor vor dem Socket', () => {
  it('gibt genau die geprueften Adressen heraus, mit ihrer Familie', () => {
    const bindung = bindeAufAdressen('example.org', ['93.184.216.34', '2606:4700:4700::1111'])
    expect(ueberBindung(bindung, 'example.org')).toEqual({
      fehler: null,
      adressen: ['93.184.216.34/4', '2606:4700:4700::1111/6'],
    })
  })

  it('antwortet auch in der Einzelform, die Node ohne `all` erwartet', () => {
    const bindung = bindeAufAdressen('example.org', ['93.184.216.34'])
    expect(ueberBindung(bindung, 'example.org', {})).toEqual({ fehler: null, adressen: ['93.184.216.34/4'] })
  })

  it('gibt zu einer Anfrage nach IPv6 keine IPv4-Adresse heraus', () => {
    // Bedenken des Pruefers zu den Adressfamilien: wenn die Aufloesung nur A-Records geprueft hat
    // und der Socket ueber AAAA geht, ist an Adressen geprueft worden, die nie kontaktiert wurden.
    // Ueber die Bindung kann das nicht passieren — was nicht geprueft wurde, gibt es hier nicht,
    // und eine Anfrage, die so nicht bedient werden kann, endet mit einem Fehler statt mit einem
    // Rueckfall auf den Aufloeser des Systems.
    const bindung = bindeAufAdressen('example.org', ['93.184.216.34'])
    const ergebnis = ueberBindung(bindung, 'example.org', { family: 6, all: true })
    expect(ergebnis.adressen).toEqual([])
    expect(ergebnis.fehler?.message).toContain('keine gepruefte Adresse')
  })

  it('verweigert eine Verbindung zu einem anderen Namen als dem geprueften', () => {
    const bindung = bindeAufAdressen('example.org', ['93.184.216.34'])
    const ergebnis = ueberBindung(bindung, 'boeser-host.de')
    expect(ergebnis.fehler?.message).toContain('anderen Namen')
  })

  it('lehnt eine gesperrte Adresse auch hier noch ab, obwohl die Wache sie schon geprueft hat', () => {
    // Doppelt gemoppelt und mit Absicht: das ist die Stelle, an der die Adresse in den Socket
    // geht. Wer diese Funktion kuenftig von woanders aufruft, kommt an der Sperrliste nicht
    // vorbei — die Pruefung liegt damit wirklich im Verbindungspfad und nicht nur davor.
    const bindung = bindeAufAdressen('ollama.intern', ['100.78.7.108'])
    const ergebnis = ueberBindung(bindung, 'ollama.intern')
    expect(ergebnis.fehler?.message).toContain('Tailscale')
  })

  it('lehnt eine leere Adressliste ab, statt den Aufloeser des Systems uebernehmen zu lassen', () => {
    const ergebnis = ueberBindung(bindeAufAdressen('example.org', []), 'example.org')
    expect(ergebnis.fehler?.message).toContain('keine gepruefte Adresse')
  })
})

// ---------------------------------------------------------------------------------------------
// Runde 3, Fund 3: IP-Literale gingen durch den Aufloeser
// ---------------------------------------------------------------------------------------------

describe('holeSicher: IP-Literale', () => {
  it('fragt fuer ein Literal keinen Aufloeser und nennt den richtigen Grund', async () => {
    // `dns.resolve4('100.78.7.108')` wirft, und die Ablehnung hiess dann „Namensaufloesung
    // fehlgeschlagen" — die falsche Meldung ausgerechnet im wichtigsten Fall. Nebenbei ging das
    // Literal als DNS-Anfrage raus.
    const gefragt: string[] = []
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://100.78.7.108/api/generate', offen(), GRENZEN, {
      aufloesen: async (host: string) => { gefragt.push(host); throw new Error('nicht aufloesbar') },
      abrufen: abrufer({}, aufrufe),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('gesperrten Netz (Tailscale)')
    expect(gefragt).toEqual([])
    expect(aufrufe).toHaveLength(0)
  })

  it('fragt auch fuer ein IPv6-Literal in Klammern keinen Aufloeser', async () => {
    const gefragt: string[] = []
    const e = await holeSicher('https://[::ffff:100.78.7.108]/x', offen(), GRENZEN, {
      aufloesen: async (host: string) => { gefragt.push(host); throw new Error('nicht aufloesbar') },
      abrufen: abrufer({}, []),
    })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.grund).toContain('gesperrten Netz')
    expect(gefragt).toEqual([])
  })

  it('holt ein erlaubtes Literal ohne Umweg ueber den Aufloeser', async () => {
    const gefragt: string[] = []
    const aufrufe: Aufruf[] = []
    const e = await holeSicher('https://93.184.216.34/x', offen(), GRENZEN, {
      aufloesen: async (host: string) => { gefragt.push(host); throw new Error('nicht aufloesbar') },
      abrufen: abrufer({ 'https://93.184.216.34/x': seite('Inhalt') }, aufrufe),
    })
    expect(e.ok).toBe(true)
    expect(gefragt).toEqual([])
    // Auch das Literal geht als freigegebene Adresse an den Abrufer weiter, damit das Protokoll
    // nach 4.1 (4) dieselbe Form hat wie bei einem Namen.
    expect(aufrufe[0].adressen).toEqual(['93.184.216.34'])
  })
})

// ---------------------------------------------------------------------------------------------
// Runde 3, Fund 5: was ein Eintrag der Positivliste wirklich bedeutet
// ---------------------------------------------------------------------------------------------

describe('die Positivliste gilt fuer alle Unterdomaenen — und das muss dastehen', () => {
  const QUELLE = readFileSync(join(__dirname, '../../src/main/harness/netzwache.ts'), 'utf8')
  const SPEC = readFileSync(
    join(__dirname, '../../docs/superpowers/specs/2026-08-21-qwen38-niveau-c-entwurf.md'), 'utf8',
  )

  it('gibt jede Unterdomaene frei, beliebig tief', () => {
    // Die Regel selbst, festgenagelt: fuer nodejs.org ist das gewollt. Fuer eine Domaene, die
    // Unterdomaenen an Fremde vergibt, waere es eine Einladung — deshalb die zwei Tests darunter.
    expect(pruefeUrl('https://beliebig.angreifer.nodejs.org/x', haupt()).ok).toBe(true)
  })

  it('warnt am Feld selbst vor Domaenen mit fremdem Nutzerinhalt je Unterdomaene', () => {
    const feld = QUELLE.slice(0, QUELLE.indexOf('positivliste: string[]'))
    const kommentar = feld.slice(feld.lastIndexOf('/**'))
    expect(kommentar).toContain('Unterdomaenen')
    expect(kommentar).toContain('github.io')
  })

  it('sagt es auch in der Spec, wo die Liste beschrieben wird', () => {
    // Der Nachtrag macht die Liste ausdruecklich zu einer anpassbaren Flaeche. Wer dort spaeter
    // github.io eintraegt, haengt jede fremde Projektseite in den Hauptlauf — neben datei_lesen
    // und die Graph-Werkzeuge. Die Begruendung „setzt einen Einbruch bei Mozilla voraus" traegt
    // dann nicht mehr.
    // Die Spec schreibt mit Umlauten, der Quelltext ohne — deshalb hier die andere Schreibweise.
    expect(SPEC).toContain('samt aller Unterdomänen')
    expect(SPEC).toContain('github.io')
  })
})
