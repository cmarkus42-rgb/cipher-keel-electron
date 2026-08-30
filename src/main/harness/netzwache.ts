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
 * keel has had a sandbox since 2026-08-30 (sandkasten.ts), and it does not take this module's job
 * over: it binds the *child process* of `shell_ausfuehren`, whose `zu` profile carries no
 * `network-outbound` at all. Both network tools here fetch from the main process, which no profile
 * covers. So this stays the only boundary on that path, and the sentence above still describes it.
 *
 * Two modes, from the addendum of 2026-08-21. The main run reaches documentation sites off a
 * positive list, so that a model can read a file and look up the matching API in the *same* run.
 * The researcher's sub-run reaches the open net, but has no file and no graph tool beside it.
 * Every rule other than the positive list is identical in both modes.
 *
 * It is not an exfiltration boundary. A URL on the positive list still carries its query string
 * out, and nothing here stops a poisoned page from lying in its content. What this closes is the
 * class where the *destination itself* is the attack: the internal network.
 *
 * The verdict is about an *address*, so the connection has to go to that address. Judging the
 * resolved address and then handing the *name* to a fetcher is the hole this module warned about
 * in its own comments and had anyway: two lookups, and between them nothing holds the address
 * still. An attacker serving TTL 0 on his own zone answers the guard with 93.184.216.34 and the
 * socket with 100.78.7.108. Hence `Abrufer` — it does not take a URL and follow its nose, it takes
 * the cleared addresses and a `bindung` that hands out those and nothing else. SNI and Host header
 * stay with the name; only the connect path is pinned.
 */

/** The two trust levels of the addendum. `offen` is the researcher's sub-run, and only that. */
export interface NetzWacheKontext {
  /** 'whitelist' = Hauptlauf, nur Positivliste. 'offen' = Unterlauf des Rechercheurs. */
  modus: 'whitelist' | 'offen'
  /**
   * Hosts der Positivliste. Nur im Modus 'whitelist' gelesen.
   *
   * **Ein Eintrag gilt fuer die Domaene samt aller Unterdomaenen, beliebig tief** — `nodejs.org`
   * erlaubt auch `beliebig.docs.nodejs.org`. Fuer ein Nachschlagewerk ist das gewollt. Fuer eine
   * Domaene, die Unterdomaenen an Fremde vergibt, ist es eine Einladung: `github.io`,
   * `readthedocs.io`, `vercel.app` oder `pages.dev` traegt jeder Beliebige, und mit einem solchen
   * Eintrag steht fremder Nutzerinhalt im Hauptlauf neben `datei_lesen` und den Graph-Werkzeugen.
   * Die Begruendung des Nachtrags — „setzt einen Einbruch bei Mozilla voraus" — traegt dann nicht
   * mehr. Auf die Liste gehoeren nur Domaenen, deren Unterdomaenen derselben Partei gehoeren.
   */
  positivliste: string[]
  /**
   * Aufgeloeste IP-Adressen des Ziels. Wird eingespeist, damit die Wache ohne DNS testbar ist.
   *
   * Vollstaendig, ueber alle Familien: was hier fehlt, wird nicht geprueft, und ein Klient mit
   * Happy Eyeballs verbindet sonst ueber ein AAAA, das nie jemand angesehen hat. `holeSicher`
   * schliesst diese Luecke, indem der Abrufer nur ueber genau diese Liste verbinden darf — wer
   * `pruefeUrl` allein benutzt, muss selbst dafuer sorgen.
   */
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
  // Gruppenruf und der reservierte Rest (in dem auch 255.255.255.255 liegt). Ueber TCP praktisch
  // nicht erreichbar, also kein Loch, das jemand heute aufreisst — aber die Sperrliste ist die
  // Stelle, an der hinterher niemand mehr nachsieht, und zwei Zeilen sind billiger als die Frage.
  { praefix: '224.0.0.0', bits: 4, name: 'Gruppenruf' },
  { praefix: '240.0.0.0', bits: 4, name: 'reserviert, einschliesslich Rundruf' },
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

/** Zwei 16-Bit-Gruppen als punktierte IPv4-Adresse — die eingebettete Adresse einer v6-Form. */
function alsPunkte(hoch: number, tief: number): string {
  return `${hoch >> 8}.${hoch & 0xff}.${tief >> 8}.${tief & 0xff}`
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
    return gesperrterBereich(alsPunkte(v6[6], v6[7]))
  }

  // Und die dritte und vierte Einbettungsform, die zwei Zweige lang fehlten. In einem reinen
  // IPv6-Netz mit DNS64/NAT64 ist `64:ff9b::100.78.7.108` der regulaere Weg zum Ollama, und 6to4
  // traegt die IPv4-Adresse des Uebergangs in den Gruppen 1 und 2. Beide fielen durch alle Zweige
  // und waren frei. Geurteilt wird ueber die eingebettete Adresse, nicht ueber das Praefix —
  // sonst waere in einem NAT64-Netz jedes oeffentliche IPv4-Ziel gesperrt.
  if (v6[0] === 0x0064 && v6[1] === 0xff9b) {
    if (v6[2] === 0 && v6[3] === 0 && v6[4] === 0 && v6[5] === 0) {
      const bereich = gesperrterBereich(alsPunkte(v6[6], v6[7]))
      return bereich === null ? null : `NAT64 auf ${bereich}`
    }
    // 64:ff9b:1::/48 aus RFC 8215 kennt mehrere Einbettungslaengen. Wo die Adresse steckt, ist
    // von aussen nicht sicher zu sagen — also wird nicht geraten, sondern abgelehnt.
    return 'NAT64 in unbekannter Einbettung'
  }
  if (v6[0] === 0x2002) {
    const bereich = gesperrterBereich(alsPunkte(v6[1], v6[2]))
    return bereich === null ? null : `6to4 auf ${bereich}`
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
function stehtAufListe(host: string, positivliste: readonly string[]): boolean {
  return positivliste.some(roh => {
    const eintrag = normalisiereHost(roh.trim())
    if (eintrag === '') return false
    return host === eintrag || host.endsWith(`.${eintrag}`)
  })
}

/**
 * Ob die URL eines Suchtreffers auf der Positivliste steht — dieselbe Frage wie Regel 3 von
 * `pruefeUrl`, nur ohne Namensaufloesung, weil hier nichts abgerufen wird.
 *
 * Sie steht hier und nicht in `werkzeug-netz.ts`, seit `web_suchen` die Treffer des
 * Nachschlage-Wegs filtert (2026-08-22). Eine zweite Fassung dort waere die Doppelung, an der die
 * Punkt-Grenze bei der naechsten Aenderung an *einer* der beiden verschwindet — und ausgerechnet
 * die Suchliste entscheidet, was `seite_lesen` danach ueberhaupt angeboten bekommt.
 *
 * `false` bei allem, was `new URL` nicht liest, und bei allem ausser https: fail closed, und die
 * beiden Regeln decken sich mit `pruefeUrl`, das einen solchen Treffer ohnehin ablehnen wuerde.
 * Ein Treffer, den keel anzeigt und danach nicht holen kann, ist genau der verbrannte Zug, gegen
 * den dieser Filter steht.
 */
export function urlAufPositivliste(roh: string, positivliste: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(roh)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return stehtAufListe(normalisiereHost(url.hostname), positivliste)
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
  /**
   * Budget for the whole chain including every redirect, not per hop — und einschliesslich jeder
   * Namensaufloesung. Das war der Unterschied zwischen dem Kommentar und dem Code: das Signal ging
   * nur an den Abruf, und wer den autoritativen Nameserver seiner Kette betreibt, hielt den
   * Werkzeugaufruf ueber maxWeiterleitungen+1 haengende Aufloesungen offen.
   */
  zeitbudgetMs: number
  maxWeiterleitungen: number
}

/** Ein Treffer der Bindung, in der Form, die Nodes `lookup` erwartet. */
export interface AufloesungsTreffer { address: string; family: 4 | 6 }

/**
 * Eine `lookup`-Funktion im Sinne von `net.connect`, die nichts nachschlaegt: sie gibt genau die
 * Adressen heraus, ueber die die Wache geurteilt hat. Absichtlich ohne Import aus `node:dns` —
 * unter `src/main/harness/` bleibt der Code frei von Umgebung, und die Form ist strukturell
 * dieselbe.
 */
export type Bindung = (
  hostname: string,
  optionen: { family?: number; all?: boolean },
  rueckruf: (fehler: Error | null, treffer?: AufloesungsTreffer[] | string, familie?: number) => void,
) => void

/**
 * Baut die Bindung fuer einen geprueften Host. Das ist das letzte Tor vor dem Socket, und es
 * schliesst den Fall, in dem die Pruefung an einer Adresse haengt und die Verbindung an einem
 * Namen: hier wird nicht mehr aufgeloest, hier wird ausgegeben.
 *
 * Drei Ablehnungen, alle fail-closed:
 * - ein anderer Hostname als der gepruefte (der Klient hat die Verbindung umgeleitet),
 * - eine Adresse aus einem gesperrten Netz (dieselbe Sperrliste noch einmal, damit die Regel im
 *   Verbindungspfad liegt und nicht nur davor),
 * - keine passende Adresse. Kein Rueckfall auf den Aufloeser des Systems — genau der Rueckfall
 *   waere die Luecke, und ein `lookup`, das den Fehler durchreicht, laesst die Verbindung
 *   scheitern statt sie irgendwohin gehen zu lassen.
 */
export function bindeAufAdressen(host: string, adressen: string[]): Bindung {
  const geprueft = normalisiereHost(host)
  return (hostname, optionen, rueckruf) => {
    if (normalisiereHost(hostname) !== geprueft) {
      rueckruf(new Error(`Verbindung zu einem anderen Namen als dem geprueften: ${hostname} statt ${geprueft}`))
      return
    }
    const treffer: AufloesungsTreffer[] = []
    for (const adresse of adressen) {
      const bereich = gesperrterBereich(adresse)
      if (bereich !== null) {
        rueckruf(new Error(`Adresse liegt in einem gesperrten Netz (${bereich}): ${adresse}`))
        return
      }
      const familie: 4 | 6 | null = alsV4(adresse) !== null ? 4 : alsV6(adresse) !== null ? 6 : null
      if (familie === null) {
        rueckruf(new Error(`Adresse nicht lesbar: ${adresse}`))
        return
      }
      if ((optionen.family === 4 || optionen.family === 6) && optionen.family !== familie) continue
      treffer.push({ address: adresse, family: familie })
    }
    if (treffer.length === 0) {
      const familie = optionen.family === 4 || optionen.family === 6 ? ` der Familie IPv${optionen.family}` : ''
      rueckruf(new Error(`Fuer ${geprueft} gibt es keine gepruefte Adresse${familie}`))
      return
    }
    if (optionen.all === true) rueckruf(null, treffer)
    else rueckruf(null, treffer[0].address, treffer[0].family)
  }
}

/**
 * Was `holeSicher` dem Abrufer uebergibt. Bewusst *nicht* `typeof fetch`: wer nur eine URL
 * bekommt, loest ein zweites Mal auf, und dann urteilt die Wache ueber die eine Adresse, waehrend
 * der Socket zur anderen geht.
 */
export interface Abrufauftrag {
  /** Die gepruefte URL. Sie bestimmt Name, SNI und Host-Kopf — nur nicht mehr das Ziel. */
  url: string
  init: RequestInit
  /** Der gepruefte Host, normalisiert. */
  host: string
  /** Genau die freigegebenen Adressen. Fuer das Protokoll nach 4.1 (4). */
  adressen: string[]
  /**
   * Und hierueber geht die Verbindung — als `lookup` eines undici-Agenten oder eines
   * `https.request`. Ein Abrufer, der stattdessen einfach `fetch(url)` ruft, hebt die Wache auf.
   */
  bindung: Bindung
}

export type Abrufer = (auftrag: Abrufauftrag) => Promise<Response>

/**
 * Loest den Namen auf. Bekommt das Abbruchsignal, weil das Zeitbudget fuer die ganze Kette gilt
 * und Node eine laufende DNS-Abfrage nicht von selbst beendet.
 *
 * Pflicht der Implementierung: **alle** Familien, die der Klient spaeter verbinden koennte. Wer
 * nur `dns.resolve4` nimmt, laesst die AAAA-Adressen ungeprueft. Ueber `bindeAufAdressen` faellt
 * das nicht mehr ins Netz, sondern in einen Verbindungsfehler — aber es faellt.
 */
export type Aufloeser = (host: string, signal: AbortSignal) => Promise<string[]>

export type AbrufErgebnis =
  | { ok: true; text: string; endUrl: string }
  | { ok: false; grund: string }

/**
 * Ein Sprung der Kette, so wie er ins Protokoll geht (§4.1 (4)).
 *
 * `sprung: 0` ist die angefragte URL, 1..n sind die Ziele der Weiterleitungen. Die Zwischenziele
 * waehlt der Betreiber der geholten Seite, und genau deshalb muessen sie aufgeschrieben werden:
 * ohne sie beantwortet niemand mehr die Frage, welche Hosts ein Lauf beruehrt hat.
 */
export interface AusgehenderSprung {
  sprung: number
  url: string
  host: string
}

/**
 * Wohin ein Sprung gemeldet wird. Eingespeist wie Aufloeser und Abrufer — dieses Modul kennt
 * kein Protokoll und keine Datenbank; `fuehreAus` (lauf.ts) haengt die Meldung an den Lauf, dem
 * sie gehoert.
 */
export type Melder = (sprung: AusgehenderSprung) => void

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
 * Laesst ein Versprechen gegen die Uhr laufen. Ohne das haengt `holeSicher` so lange, wie der
 * Aufloeser Geduld hat — gemessen: 30 ms Budget, 811 ms Laufzeit, weil das Signal nur am Abruf
 * hing und jeder Sprung erneut aufloest.
 *
 * Das Signal geht *zusaetzlich* an den Aufloeser selbst (siehe `Aufloeser`): dieses Rennen rettet
 * nur die Antwortzeit, nicht die Abfrage, die im Hintergrund weiterlaeuft.
 */
function gegenDieUhr<T>(versprechen: Promise<T>, signal: AbortSignal, grund: string): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error(grund))
  const melder: { rufe: (() => void) | null } = { rufe: null }
  const wecker = new Promise<never>((_, ablehnen) => {
    melder.rufe = () => ablehnen(new Error(grund))
    signal.addEventListener('abort', melder.rufe, { once: true })
  })
  return Promise.race([versprechen, wecker]).finally(() => {
    if (melder.rufe !== null) signal.removeEventListener('abort', melder.rufe)
  })
}

/**
 * Fetches with the guard applied at *every* hop.
 *
 * `redirect: 'manual'` and following by hand is the entire reason this function exists. Letting
 * fetch follow means the first URL is checked and the destination that actually gets requested is
 * not — which is where most SSRF guards fall, because the check is present and looks right.
 *
 * `aufloesen`, `abrufen` und `melde` are injected: this is testable without a network and without
 * DNS, and a test can play the attacker. `melde` schreibt **jeden** Sprung auf, bevor er hinausgeht
 * — siehe `AusgehenderSprung`. `ktx.adressen` is *overwritten* per hop with what `aufloesen`
 * returns — the field is what `pruefeUrl` reads, and here this function fills it. Und derselbe
 * Satz Adressen geht als Bindung an den Abrufer, damit zwischen Urteil und Socket keine zweite
 * Aufloesung mehr passt.
 */
/**
 * Wie oft ein einzelner Sprung angefasst wird, bevor er als tot gilt — und, wichtiger, dass er
 * ueberhaupt ein **eigenes** Zeitbudget bekommt statt des ganzen Kettenbudgets.
 *
 * **Der Fehlerfall dahinter, gemessen am 2026-08-22 an der laufenden App (M12).** Die Haelfte
 * aller Seitenabrufe des Rechercheurs lief ins 20-Sekunden-Budget, immer im Abruf, immer beim
 * ersten Sprung: Socket erzeugt, danach weder `connect` noch `error`, bis der Wecker kam. Die
 * Ursache lag nicht in keel und nicht im Netz — sie steht im Messbericht
 * (`docs/superpowers/plans/2026-08-22-m12-rechercheur.md`): ein Filter, der **pro Anwendung und
 * Ziel** entscheidet, haelt den ersten Kontakt zu einem neuen Host, und in einem unbeaufsichtigten
 * Lauf beantwortet niemand seinen Dialog. Zahlen: von 18 Erstkontakten hingen 6, von 10
 * Folgekontakten keiner.
 *
 * Was das hier aendert, und was nicht: keel kann den Filter nicht abstellen, aber es muss ihm
 * nicht das ganze Budget schenken. Ein eigenes Budget je Versuch macht aus einem stillen
 * 20-Sekunden-Verlust eine benannte Absage nach einem Drittel davon — gemessen 7,7 s statt 20 s —
 * und laesst dem Unterlauf Zeit, eine andere Seite zu holen.
 *
 * **Zwei Versuche statt einem ist eine Abwaegung, keine Messung.** Auf dieser Maschine half der
 * zweite Versuch nicht (bei arxiv.org scheiterten beide, zusammen 15,3 s statt 20 s). Er steht
 * hier fuer den Fall, den diese Maschine nicht zeigen kann: ein einzeln verlorenes SYN, gegen das
 * ein neuer Versuch das Naheliegende ist. Wer ihn streicht, verliert nichts Gemessenes — und
 * gewinnt auf einem gefilterten Rechner ein Drittel des Budgets zurueck.
 */
const VERSUCHE_JE_SPRUNG = 2

/**
 * Das Budget eines einzelnen Versuchs: ein Drittel des Kettenbudgets, also ein Anteil und keine
 * zweite feste Zahl. Zwei Versuche passen damit hinein und lassen noch ein Drittel fuer
 * Namensaufloesung und Lesen — und wer das Kettenbudget aendert, muss nicht zwei Zahlen im Kopf
 * behalten.
 *
 * Bei den 20 Sekunden von `VORGABE_SEITE_GRENZEN` sind das 6,6 s je Versuch. Das deckt eine
 * einzelne SYN-Wiederholung (1 s) samt Handschlag ab; gemessene Handschlaege lagen bei 26 bis
 * 170 ms, in der Spitze 2,4 s. Es deckt ausdruecklich **nicht** die volle Wiederholungsreihe des
 * Betriebssystems ab — genau die abzuschneiden ist der Zweck.
 */
export function versuchsbudgetMs(zeitbudgetMs: number): number {
  return Math.floor(zeitbudgetMs / (VERSUCHE_JE_SPRUNG + 1))
}

export async function holeSicher(
  url: string,
  ktx: NetzWacheKontext,
  grenzen: AbrufGrenzen,
  abhaengigkeiten: { aufloesen: Aufloeser; abrufen: Abrufer; melde: Melder },
): Promise<AbrufErgebnis> {
  const steuerung = new AbortController()
  const uhr = setTimeout(() => steuerung.abort(), grenzen.zeitbudgetMs)
  const signal = steuerung.signal
  /**
   * Woran die Uhr gerade laeuft. Ohne diesen Zusatz sagt die Absage nur die Zahl, und die Zahl
   * ist die einzige Auskunft, die man ohnehin schon hat.
   *
   * Gemessen an zwanzig echten Recherchen (M12, 2026-08-22): elf von fuenfundzwanzig
   * Seitenabrufen rissen im **Hauptprozess der App** dieses Budget, waehrend derselbe Aufruf
   * ueber genau denselben Code unter Node 0,1 bis 2,8 Sekunden braucht — nebenlaeufig wie
   * nacheinander, mit und ohne Weiterleitung. Woran es liegt, ist offen; ohne die Angabe, in
   * welchem Abschnitt die Zeit hinging, sucht der naechste Leser an drei Stellen zugleich.
   */
  let abschnitt = 'vor dem ersten Sprung'
  const zeitGrund = () => `Zeitbudget von ${grenzen.zeitbudgetMs} ms ueberschritten (${abschnitt})`

  try {
    let aktuell = url
    for (let sprung = 0; ; sprung++) {
      const host = hostFuerAufloesung(aktuell)
      if (host === null) {
        // Kein https oder gar keine URL. `pruefeUrl` formuliert die Ablehnung, damit der Wortlaut
        // aus einer Hand kommt; dass sie hier ablehnt, ist sicher — genau diese beiden Faelle sind
        // es, in denen `hostFuerAufloesung` null gibt. Der Zweig darunter ist trotzdem da, weil
        // eine unmoegliche Freigabe nicht stillschweigend zur Freigabe werden darf.
        const urteil = pruefeUrl(aktuell, { ...ktx, adressen: [] })
        if (!urteil.ok) return urteil
        return { ok: false, grund: `Ziel ohne verwendbaren Host: ${aktuell.slice(0, 200)}` }
      }
      // Refuse a host that cannot possibly be allowed *before* a resolver is asked about it. A
      // redirect to `https://<geheimnis>.boeser-host.de/` would otherwise carry the secret out in
      // a DNS query even though the request itself never happens. Same kind of pre-filter as the
      // scheme check inside `hostFuerAufloesung`, and for the same reason; `pruefeUrl` below stays
      // the authority on the verdict, which is why both places return the identical wording.
      // Nur im Hauptlauf: im Unterlauf gibt es keine Liste, an der sich das entscheiden liesse,
      // und dort geht die Anfrage ohnehin hinaus. Das ist keine allgemeine Zusicherung gegen
      // Ausleitung — der Modulkopf sagt, warum es keine sein kann.
      if (ktx.modus === 'whitelist' && !stehtAufListe(host, ktx.positivliste)) {
        return { ok: false, grund: nichtAufListe(host) }
      }

      // §4.1 (4): jede ausgehende URL vollstaendig ins Protokoll — und zwar *hier*, vor der
      // Aufloesung und vor dem GET. Ein Eintrag, den erst der Erfolg schreibt, fehlt genau bei
      // dem Sprung, der scheiterte; und die Namensaufloesung selbst ist bereits ein ausgehender
      // Vorgang, der den Namen hinaustraegt. Ueber der Positivlisten-Absage darueber steht sie
      // absichtlich nicht: dort geht nichts hinaus.
      abhaengigkeiten.melde({ sprung, url: aktuell, host })

      let adressen: string[]
      if (alsV4(host) !== null || alsV6(host) !== null) {
        // Ein Literal wird nicht aufgeloest. `dns.resolve4('100.78.7.108')` wirft, und die
        // Ablehnung hiesse dann „Namensaufloesung fehlgeschlagen" statt „gesperrtes Netz" — die
        // falsche Meldung ausgerechnet im wichtigsten Fall, und eine, die den naechsten Leser die
        // Regel an der falschen Stelle suchen laesst. Nebenbei ginge das Literal als DNS-Anfrage
        // hinaus.
        adressen = [host]
      } else {
        try {
          abschnitt = `Namensaufloesung fuer ${host}`
          adressen = await gegenDieUhr(abhaengigkeiten.aufloesen(host, signal), signal, zeitGrund())
        } catch (fehler) {
          if (signal.aborted) return { ok: false, grund: zeitGrund() }
          // Named, not swallowed. An empty list here would be indistinguishable from a host with
          // no records, and `pruefeUrl` would report the wrong reason for the refusal.
          return { ok: false, grund: `Namensaufloesung fehlgeschlagen fuer ${host}: ${(fehler as Error).message}` }
        }
      }

      const urteil = pruefeUrl(aktuell, { ...ktx, adressen })
      if (!urteil.ok) return urteil

      abschnitt = `Abruf von ${host} (Sprung ${sprung})`
      const versuchsbudget = versuchsbudgetMs(grenzen.zeitbudgetMs)
      let antwort: Response | null = null
      let letzterGrund = ''
      for (let versuch = 1; versuch <= VERSUCHE_JE_SPRUNG; versuch++) {
        // Der zweite Versuch geht genauso hinaus wie der erste und wird genauso gemeldet
        // (§4.1 (4)). Der erste ist oben schon gemeldet, hier kommt nur der Nachschlag.
        if (versuch > 1) abhaengigkeiten.melde({ sprung, url: aktuell, host })
        // Ein eigener Abbruch je Versuch, gekettet an den der ganzen Kette. Ohne die Kette waere
        // ein aufgegebener Versuch ein Socket, den niemand mehr schliesst; ohne den eigenen
        // liefe der Versuch bis zum Kettenbudget weiter.
        const versuchssteuerung = new AbortController()
        const uhrVersuch = setTimeout(() => versuchssteuerung.abort(), versuchsbudget)
        const durchreichen = () => versuchssteuerung.abort()
        signal.addEventListener('abort', durchreichen, { once: true })
        try {
          // Gegen die Uhr geklammert, nicht bloss mit dem Signal in der Hand — dieselbe Klammer
          // und dieselbe Begruendung wie in `such-anbieter.holeJson`: **das Signal allein reicht
          // nicht, weil ein Abrufer es ignorieren darf.** `Abrufer` ist eine Schnittstelle; sie
          // sagt zu, dass `init.signal` mitkommt, nicht dass jemand darauf hoert.
          antwort = await gegenDieUhr(abhaengigkeiten.abrufen({
            url: urteil.url,
            host,
            adressen,
            bindung: bindeAufAdressen(host, adressen),
            init: {
              method: 'GET',
              redirect: 'manual',
              signal: versuchssteuerung.signal,
              // No cookie jar, no credentials, no referrer: nothing may travel between two calls
              // of this function, and nothing about the previous page may travel to the next host.
              credentials: 'omit',
              referrerPolicy: 'no-referrer',
              headers: { accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
            },
          }), versuchssteuerung.signal, `Verbindungsversuch ${versuch} ohne Antwort nach ${versuchsbudget} ms`)
          break
        } catch (fehler) {
          // Drei Ausgaenge, und sie duerfen nicht zusammenfallen. Das Kettenbudget ist zu Ende:
          // dann hilft kein zweiter Versuch. Der Versuch lief in sein eigenes Budget: dann schon,
          // denn ein neues SYN kommt meist durch. Und ein **benannter** Fehlschlag (ECONNREFUSED,
          // Zertifikat) ist eine Antwort — die zu wiederholen verdoppelt nur die Last.
          if (signal.aborted) return { ok: false, grund: zeitGrund() }
          if (!versuchssteuerung.signal.aborted) {
            return { ok: false, grund: `Abruf fehlgeschlagen: ${(fehler as Error).message}` }
          }
          letzterGrund =
            `Kein Verbindungsversuch kam durch: ${VERSUCHE_JE_SPRUNG} mal ${versuchsbudget} ms ` +
            `ohne Antwort von ${host}.`
        } finally {
          clearTimeout(uhrVersuch)
          signal.removeEventListener('abort', durchreichen)
        }
      }
      if (antwort === null) return { ok: false, grund: letzterGrund }

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

      // Auch das Lesen laeuft gegen die Uhr, und nicht nur mit dem Signal in der Hand: `lies`
      // prueft `signal.aborted` zwischen zwei Stuecken, kommt aber nie wieder an die Pruefung,
      // wenn `leser.read()` haengt. Gemessen mit einem Koerperstrom, der nach dem ersten Stueck
      // nie nachliefert und das Signal nicht kennt: 50 ms Budget, nach 2.000 ms lief der Aufruf
      // noch. `such-anbieter.ts` klammert `liesBegrenzt` aus genau diesem Grund; hier fehlte es.
      // Der haengende Strom laeuft danach im Hintergrund weiter — beendet wird er vom `signal`,
      // das der Abrufer an die Anfrage gehaengt hat.
      let gelesen: { ok: true; text: string } | { ok: false; grund: string }
      try {
        abschnitt = `Lesen des Koerpers von ${host}`
        gelesen = await gegenDieUhr(lies(antwort, grenzen, signal, zeitGrund()), signal, zeitGrund())
      } catch (fehler) {
        // Benannt, nicht verschluckt: `lies` selbst wirft nicht, also kommt hier das Rennen an —
        // trotzdem wird der Grund weitergegeben statt pauschal aufs Zeitbudget geraten.
        if (signal.aborted) return { ok: false, grund: zeitGrund() }
        return { ok: false, grund: `Lesen fehlgeschlagen: ${(fehler as Error).message}` }
      }
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
