/**
 * netzwache — where a network tool is allowed to reach.
 *
 * The counterpart to pfadwache, built the same way and for the same reason: a pure function that
 * decides *before* the action, whose refusal is a return value and not a throw, and in which a
 * deny rule never yields to an allow rule. pfadwache decides what may come *in*; this one decides
 * where something may *go*. That distinction is the whole point — keel's §1.1 justifies doing
 * without a sandbox by saying the only channel out is the model endpoint, and that channel has a
 * fixed destination. A fetch tool makes the destination attacker-choosable, and the argument
 * stops holding exactly there.
 *
 * Two modes, from the addendum of 2026-08-21. The main run reaches documentation sites off a
 * positive list, so that a model can read a file and look up the matching API in the *same* run.
 * The researcher's sub-run reaches the open net, but has no file and no graph tool beside it.
 * Every rule other than the positive list is identical in both modes.
 *
 * It is not an exfiltration boundary. A URL on the positive list still carries its query string
 * out, and nothing here stops a poisoned page from lying in its content. What this closes is the
 * class where the *destination itself* is the attack: the internal network.
 */

/** The two trust levels of the addendum. `offen` is the researcher's sub-run, and only that. */
export interface NetzWacheKontext {
  /** 'whitelist' = Hauptlauf, nur Positivliste. 'offen' = Unterlauf des Rechercheurs. */
  modus: 'whitelist' | 'offen'
  /** Hosts der Positivliste. Nur im Modus 'whitelist' gelesen. */
  positivliste: string[]
  /** Aufgeloeste IP-Adressen des Ziels. Wird eingespeist, damit die Wache ohne DNS testbar ist. */
  adressen: string[]
}

export type NetzErgebnis =
  | { ok: true; url: string }
  | { ok: false; grund: string }

/**
 * IPv4 ranges that must never be reached. Kept as prefix + length rather than as first/last
 * addresses: 172.16.0.0/12 ends at 172.31.255.255, and every hand-written version of that bound
 * eventually says 172.16–172.20 or 172.16–172.255.
 */
const GESPERRTE_V4: Array<{ praefix: string; bits: number; name: string }> = [
  { praefix: '0.0.0.0', bits: 8, name: 'dieses Netz' },
  { praefix: '10.0.0.0', bits: 8, name: 'privat' },
  { praefix: '127.0.0.0', bits: 8, name: 'Loopback' },
  { praefix: '169.254.0.0', bits: 16, name: 'Link-Local' },
  { praefix: '172.16.0.0', bits: 12, name: 'privat' },
  { praefix: '192.168.0.0', bits: 16, name: 'privat' },
  // Tailscale. This is not a formality here and it is the reason this module was written first.
  // This machine sits on a tailnet that carries an *unauthenticated* Ollama on 100.78.7.108:11434,
  // TrueNAS and n8n on 100.67.95.13, and a VPS with sudo on 100.64.99.118. A fetched page that
  // redirects to any of those would run foreign models or touch services straight out of the main
  // process, with no credential needed anywhere along the way — the tailnet *is* the credential.
  // That is SSRF, and this environment is an unusually rewarding target for it.
  { praefix: '100.64.0.0', bits: 10, name: 'Tailscale' },
]

/** Dotted quad, strictly. Anything else is not an IPv4 literal and must not be treated as one. */
function alsV4(text: string): number | null {
  const teile = text.split('.')
  if (teile.length !== 4) return null
  let zahl = 0
  for (const teil of teile) {
    if (!/^\d{1,3}$/.test(teil)) return null
    const oktett = Number(teil)
    if (oktett > 255) return null
    zahl = zahl * 256 + oktett
  }
  return zahl
}

/**
 * Eight 16-bit groups, or null. Handles the one `::` elision and a trailing dotted quad
 * (`::ffff:10.0.0.1`) — that second form is the whole point: it is the ordinary way to write an
 * IPv4 address as IPv6, a resolver returns it, and a check that only knows the hex form waves
 * `::ffff:10.0.0.1` straight through to 10.0.0.1.
 */
function alsV6(text: string): number[] | null {
  if (!text.includes(':')) return null
  const haelften = text.split('::')
  if (haelften.length > 2) return null

  const gruppen = (roh: string): number[] | null => {
    if (roh === '') return []
    const aus: number[] = []
    const stuecke = roh.split(':')
    for (let i = 0; i < stuecke.length; i++) {
      const stueck = stuecke[i]
      if (i === stuecke.length - 1 && stueck.includes('.')) {
        const v4 = alsV4(stueck)
        if (v4 === null) return null
        aus.push(Math.floor(v4 / 65536), v4 % 65536)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/i.test(stueck)) return null
      aus.push(parseInt(stueck, 16))
    }
    return aus
  }

  const vorne = gruppen(haelften[0])
  const hinten = haelften.length === 2 ? gruppen(haelften[1]) : []
  if (vorne === null || hinten === null) return null
  if (haelften.length === 1) return vorne.length === 8 ? vorne : null
  const fehlend = 8 - vorne.length - hinten.length
  if (fehlend < 1) return null
  return [...vorne, ...Array<number>(fehlend).fill(0), ...hinten]
}

/**
 * The name of the blocked range an address falls into, or null. Returning the *name* rather than
 * a boolean is what lets the refusal say which net it was — a refusal nobody can read gets
 * disabled by the next person who hits it.
 */
function gesperrterBereich(adresse: string): string | null {
  const v4 = alsV4(adresse)
  if (v4 !== null) {
    for (const bereich of GESPERRTE_V4) {
      const praefix = alsV4(bereich.praefix)
      if (praefix === null) continue
      const maske = bereich.bits === 0 ? 0 : (0xffffffff << (32 - bereich.bits)) >>> 0
      if (((v4 >>> 0) & maske) === ((praefix >>> 0) & maske)) return bereich.name
    }
    return null
  }

  const v6 = alsV6(adresse)
  if (v6 === null) return null

  // IPv4-mapped (::ffff:0:0/96) and the deprecated IPv4-compatible form (::/96). Both are IPv4
  // wearing an IPv6 hat, and both are judged by the IPv4 rules — otherwise ::ffff:100.78.7.108
  // reaches the tailnet that 100.78.7.108 is blocked from. `::1` and `::` land here too, and the
  // Loopback and 0/8 rules cover them exactly right.
  if (v6.slice(0, 5).every(g => g === 0) && (v6[5] === 0xffff || v6[5] === 0)) {
    const eingebettet = `${v6[6] >> 8}.${v6[6] & 0xff}.${v6[7] >> 8}.${v6[7] & 0xff}`
    return gesperrterBereich(eingebettet)
  }
  if ((v6[0] & 0xfe00) === 0xfc00) return 'IPv6 Unique Local'
  if ((v6[0] & 0xffc0) === 0xfe80) return 'IPv6 Link-Local'
  return null
}

/** Brackets off an IPv6 literal, trailing root dot off a name. Lowercased once, here. */
function normalisiereHost(hostname: string): string {
  const ohneKlammern = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  // `nodejs.org.` and `nodejs.org` are the same name to DNS. Without this the guard's answer
  // would depend on a form the user never sees.
  const ohnePunkt = ohneKlammern.endsWith('.') ? ohneKlammern.slice(0, -1) : ohneKlammern
  return ohnePunkt.toLowerCase()
}

function nichtAufListe(host: string): string {
  return `Host steht nicht auf der Positivliste: ${host}`
}

/**
 * Exact match, or a suffix at a dot boundary. `endsWith(eintrag)` is the classic mistake and it
 * hands `example.org.boeser-host.de` to an attacker who registered boeser-host.de.
 */
function stehtAufListe(host: string, positivliste: string[]): boolean {
  return positivliste.some(roh => {
    const eintrag = normalisiereHost(roh.trim())
    if (eintrag === '') return false
    return host === eintrag || host.endsWith(`.${eintrag}`)
  })
}

export function pruefeUrl(roh: string, ktx: NetzWacheKontext): NetzErgebnis {
  // `new URL` is doing security work here, not convenience work. It applies IDNA, so the Cyrillic
  // `ехample.org` arrives as its punycode form and never compares equal to `example.org`; and it
  // normalises the numeric host forms (`https://2130706433/` -> 127.0.0.1) that fetch would
  // resolve the same way but a naive string check would not recognise as loopback.
  let url: URL
  try {
    url = new URL(roh)
  } catch {
    // Deliberately not repaired by prepending a scheme: a schemeless `//host` that silently
    // becomes https is a decision the caller never made.
    return { ok: false, grund: `Keine gueltige URL: ${roh.slice(0, 200)}` }
  }

  // 1. Only https. Everything else — http, file, data, ftp, javascript — before anything else,
  //    so that a `file:` URL is refused without a DNS lookup ever leaving the machine.
  if (url.protocol !== 'https:') {
    return { ok: false, grund: `Nur https ist erlaubt, nicht ${url.protocol}` }
  }

  const host = normalisiereHost(url.hostname)

  // 2. No internal destination — judged on the *resolved addresses*, never on the name. A name
  //    check is worthless here: any domain can carry an A record pointing at 10.0.0.1, and DNS
  //    rebinding makes even a correct name check stale between the lookup and the request.
  //    A literal-IP host is added to the set the guard checks, because `adressen` comes from
  //    outside and the literal is a fact this function already holds in its hand.
  const literal = alsV4(host) !== null || alsV6(host) !== null ? [host] : []
  const zuPruefen = [...literal, ...ktx.adressen]
  if (zuPruefen.length === 0) {
    return { ok: false, grund: `Keine aufgeloeste Adresse fuer ${host}` }
  }
  for (const adresse of zuPruefen) {
    if (alsV4(adresse) === null && alsV6(adresse) === null) {
      // Fail closed. An address the guard cannot read is one it cannot clear.
      return { ok: false, grund: `Adresse nicht lesbar: ${adresse}` }
    }
    const bereich = gesperrterBereich(adresse)
    if (bereich !== null) {
      return { ok: false, grund: `Ziel liegt in einem gesperrten Netz (${bereich}): ${adresse}` }
    }
  }

  // 3. In the main run the host has to be on the positive list. The sub-run skips exactly this
  //    rule and no other.
  if (ktx.modus === 'whitelist' && !stehtAufListe(host, ktx.positivliste)) {
    return { ok: false, grund: nichtAufListe(host) }
  }

  // 4. No credentials in the URL. They would go out over the wire, land in the log that §4.1 (4)
  //    requires, and `https://example.org@evil.com` reads to a human as a visit to example.org.
  //    Rule 3 already refuses that particular one on its host, in whitelist mode; this catches it
  //    in the sub-run too, where there is no list.
  if (url.username !== '' || url.password !== '') {
    return { ok: false, grund: 'Zugangsdaten in der URL sind nicht erlaubt' }
  }

  return { ok: true, url: url.toString() }
}

// ---------------------------------------------------------------------------------------------
// Der Abruf
// ---------------------------------------------------------------------------------------------

export interface AbrufGrenzen {
  /** Hard cap, enforced while reading. A body over it is refused, never truncated silently. */
  maxBytes: number
  /** Budget for the whole chain including every redirect, not per hop. */
  zeitbudgetMs: number
  maxWeiterleitungen: number
}

export type AbrufErgebnis =
  | { ok: true; text: string; endUrl: string }
  | { ok: false; grund: string }

const WEITERLEITUNGEN = new Set([301, 302, 303, 307, 308])

/**
 * Only decides whether a DNS lookup is worth making at all — `pruefeUrl` stays the sole authority
 * on the verdict. Without this, refusing a `file:` URL would still have leaked its host to a
 * resolver first.
 */
function hostFuerAufloesung(roh: string): string | null {
  try {
    const url = new URL(roh)
    if (url.protocol !== 'https:') return null
    return normalisiereHost(url.hostname)
  } catch {
    return null
  }
}

/**
 * Fetches with the guard applied at *every* hop.
 *
 * `redirect: 'manual'` and following by hand is the entire reason this function exists. Letting
 * fetch follow means the first URL is checked and the destination that actually gets requested is
 * not — which is where most SSRF guards fall, because the check is present and looks right.
 *
 * `aufloesen` and `abrufen` are injected: this is testable without a network and without DNS, and
 * a test can play the attacker. `ktx.adressen` is *overwritten* per hop with what `aufloesen`
 * returns — the field is what `pruefeUrl` reads, and here this function fills it.
 */
export async function holeSicher(
  url: string,
  ktx: NetzWacheKontext,
  grenzen: AbrufGrenzen,
  abhaengigkeiten: { aufloesen: (host: string) => Promise<string[]>; abrufen: typeof fetch },
): Promise<AbrufErgebnis> {
  const steuerung = new AbortController()
  const uhr = setTimeout(() => steuerung.abort(), grenzen.zeitbudgetMs)
  const signal = steuerung.signal
  const zeitGrund = `Zeitbudget von ${grenzen.zeitbudgetMs} ms ueberschritten`

  try {
    let aktuell = url
    for (let sprung = 0; ; sprung++) {
      const host = hostFuerAufloesung(aktuell)
      // Refuse a host that cannot possibly be allowed *before* a resolver is asked about it. A
      // redirect to `https://<geheimnis>.boeser-host.de/` would otherwise carry the secret out in
      // a DNS query even though the request itself never happens. Same kind of pre-filter as the
      // scheme check inside `hostFuerAufloesung`, and for the same reason; `pruefeUrl` below stays
      // the authority on the verdict, which is why both places return the identical wording.
      if (host !== null && ktx.modus === 'whitelist' && !stehtAufListe(host, ktx.positivliste)) {
        return { ok: false, grund: nichtAufListe(host) }
      }
      let adressen: string[] = []
      if (host !== null) {
        try {
          adressen = await abhaengigkeiten.aufloesen(host)
        } catch (fehler) {
          // Named, not swallowed. An empty list here would be indistinguishable from a host with
          // no records, and `pruefeUrl` would report the wrong reason for the refusal.
          return { ok: false, grund: `Namensaufloesung fehlgeschlagen fuer ${host}: ${(fehler as Error).message}` }
        }
      }

      const urteil = pruefeUrl(aktuell, { ...ktx, adressen })
      if (!urteil.ok) return urteil

      let antwort: Response
      try {
        antwort = await abhaengigkeiten.abrufen(urteil.url, {
          method: 'GET',
          redirect: 'manual',
          signal,
          // No cookie jar, no credentials, no referrer: nothing may travel between two calls of
          // this function, and nothing about the previous page may travel to the next host.
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: { accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
        })
      } catch (fehler) {
        if (signal.aborted) return { ok: false, grund: zeitGrund }
        return { ok: false, grund: `Abruf fehlgeschlagen: ${(fehler as Error).message}` }
      }

      if (WEITERLEITUNGEN.has(antwort.status)) {
        const ort = antwort.headers.get('location')
        if (ort === null || ort.trim() === '') {
          return { ok: false, grund: `Weiterleitung ohne Ziel (HTTP ${antwort.status})` }
        }
        if (sprung >= grenzen.maxWeiterleitungen) {
          return { ok: false, grund: `Mehr als ${grenzen.maxWeiterleitungen} Weiterleitungen` }
        }
        try {
          aktuell = new URL(ort, urteil.url).toString()
        } catch {
          return { ok: false, grund: `Weiterleitungsziel ist keine gueltige URL: ${ort.slice(0, 200)}` }
        }
        continue
      }

      if (!antwort.ok) return { ok: false, grund: `Abruf beantwortet mit HTTP ${antwort.status}` }

      const gelesen = await lies(antwort, grenzen, signal, zeitGrund)
      if (!gelesen.ok) return gelesen
      return { ok: true, text: gelesen.text, endUrl: urteil.url }
    }
  } finally {
    clearTimeout(uhr)
  }
}

/**
 * Reads the body against the cap *while* reading. Measuring afterwards means a 5 GB body is
 * already in memory when the guard finds out, and against a hostile server "afterwards" may
 * never arrive at all.
 */
async function lies(
  antwort: Response,
  grenzen: AbrufGrenzen,
  signal: AbortSignal,
  zeitGrund: string,
): Promise<{ ok: true; text: string } | { ok: false; grund: string }> {
  const koerper = antwort.body
  if (koerper === null) return { ok: true, text: '' }

  const leser = koerper.getReader()
  const dekodierer = new TextDecoder()
  let gelesen = 0
  let text = ''
  try {
    for (;;) {
      if (signal.aborted) {
        await leser.cancel(zeitGrund)
        return { ok: false, grund: zeitGrund }
      }
      const stueck = await leser.read()
      if (stueck.done) break
      gelesen += stueck.value.byteLength
      if (gelesen > grenzen.maxBytes) {
        const grund = `Antwort ueberschreitet die Groessengrenze von ${grenzen.maxBytes} Bytes`
        // The connection has to end here, or the server goes on sending into a reader nobody
        // reads. A failing cancel falls into the catch below and gets a name like anything else.
        await leser.cancel(grund)
        return { ok: false, grund }
      }
      text += dekodierer.decode(stueck.value, { stream: true })
    }
    return { ok: true, text: text + dekodierer.decode() }
  } catch (fehler) {
    if (signal.aborted) return { ok: false, grund: zeitGrund }
    return { ok: false, grund: `Lesen fehlgeschlagen: ${(fehler as Error).message}` }
  }
}
