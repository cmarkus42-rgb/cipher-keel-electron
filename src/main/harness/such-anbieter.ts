/**
 * such-anbieter — der erste Baustein der Zufuhr. Noch kein Werkzeug, nur die Schnittstelle
 * und zwei Implementierungen darunter.
 *
 * Entschieden wird die **Schnittstelle**, nicht der Anbieter (Entwurf §3.2). SearXNG auf MS-01
 * kostet nichts, braucht keinen Schluessel und sucht von einer Wohnanschluss-IP; Tavily hat
 * 1.000 Credits/Monat dauerhaft frei und ist ausdruecklich fuer Agenten gebaut. Welcher von
 * beiden am Ende die Vorgabe ist, entscheidet eine Woche Messung (M6) und nicht diese Datei.
 *
 * Ausgeschieden, kurz: Brave hat das Freikontingent im Februar 2026 abgeschafft und untersagt
 * das Speichern von Ergebnissen ausser transient — keel schreibt in Graph und Vault.
 * Serper/SerpApi ist Google-Scraping. Kagi ist das Sauberste und das 12- bis 40-fache.
 * DuckDuckGo direkt scrapen ist vertraglich nicht verboten, aber es degradiert **still** —
 * und still ist hier das Ausschlusskriterium.
 *
 * Zwei Dinge, die dieser Datei ihre Form geben:
 *
 *   1. **`engineLage` ist kein Schmuck.** SearXNG sperrt eine geblockte Engine 3.600 Sekunden,
 *      bei CAPTCHA einen Tag, bei Cloudflare 15 Tage. Wer das nicht sieht, bekommt still
 *      weniger Ergebnisse und haelt sie fuer alle, die es gibt. Die Zeile muss beim Werkzeug
 *      ankommen, deshalb steht sie in der Rueckgabe und nicht in einem Logeintrag.
 *   2. **Kein Anbieter konfiguriert ist ein benannter Zustand.** `waehleAnbieter` gibt dann
 *      `{ ok: false, meldung }` — nie einen Anbieter, der leere Trefferlisten liefert. Ein
 *      Agent, der leere Treffer statt eines Fehlers bekommt, halluziniert die Antwort.
 *
 * Warum `suche` wirft, obwohl Werkzeuge in diesem Repo nicht werfen: das hier *ist* kein
 * Werkzeug. Die Rueckgabe `SuchAntwort` hat kein Feld fuer „hat nicht geklappt", und eines
 * einzufuehren hiesse, den Fehlerfall in dieselbe Form zu giessen wie „null Treffer" — genau
 * die Verwechslung, die (2) verhindern soll. Das Werkzeug darueber faengt `SuchFehler` und
 * macht daraus `{ ok: false, meldung }`.
 *
 * Der Abrufer wird eingespeist — und er ist **nicht** `netzwache.holeSicher`. Der Satz stand
 * einmal hier und war nicht baubar: `netzwache.Abrufer` nimmt einen `Abrufauftrag` und gibt
 * `{ text, endUrl }` statt einer `Response`, `holeSicher` verdrahtet `method: 'GET'` (Tavily
 * braucht POST), und `pruefeUrl` laesst nur https durch und sperrt 100.64.0.0/10 — der
 * SearXNG-Endpunkt auf MS-01 ist `http://100.67.95.13:8080`, also http im Tailnet und damit
 * doppelt abgelehnt. Wer den Satz ernst naehme, machte die netzwache passend, also http und das
 * Tailnet auf: genau das Loch, gegen das a63723a und 58b7ef5 angetreten sind (unauthentifizierter
 * Ollama auf 100.78.7.108:11434).
 *
 * Was stattdessen gilt: **das Suchziel ist betreiberkonfiguriert, nicht modellgewaehlt.** Es steht
 * in `SuchKonfiguration`, nie in einem Werkzeugargument; das Modell waehlt die Anfrage, nicht das
 * Ziel. Deshalb laeuft dieser eine Abruf absichtlich an der netzwache vorbei — und deshalb traegt
 * diese Datei die Grenzen selbst, die dort sonst haengen: Zeitbudget (§3.4: zehn Sekunden),
 * Groessengrenze beim Lesen, `redirect: 'error'`, kein Cookie, kein Auth ausser dem
 * konfigurierten Schluessel. Ein blankes `fetch` einzuspeisen waere der andere schlechte Weg:
 * der Suchpfad liefe ganz ohne Grenzen.
 *
 * Und ein dritter Punkt, der der Datei ihre Form gibt: **Treffertexte sind fremdbestimmter
 * Netzinhalt.** Titel und Auszug gehen denselben Weg ins Kontextfenster wie eine geholte Seite,
 * nur ohne dass die Seite je geholt wird — `seite_lesen` und sein Strip kommen nie ins Spiel.
 * Also laeuft `saeubere` hier ueber jeden Titel und jeden Auszug, beide werden gekappt und beide
 * auf **eine** Zeile gebracht — das Ausgabeformat von `web_suchen` ist zeilenweise, und ein
 * Umbruch im Titel schreibt darin einen frei erfundenen Treffer samt URL (siehe `einzeilig`).
 */

import { einzeilig, saeubere } from './seiten-text'

/** Ein einzelner Suchtreffer. Kein Seiteninhalt — den holt `seite_lesen` einzeln. */
export interface Treffer {
  titel: string
  url: string
  auszug: string
  engine: string
  bewertung?: number
}

export interface SuchAntwort {
  treffer: Treffer[]
  /** Engines, die geantwortet bzw. geblockt haben. */
  engineLage: string
}

/**
 * Wohin die tatsaechlich abgerufene Ziel-URL gemeldet wird (§4.1 (4)). Bis dahin stand im
 * Protokoll nur der Suchbegriff, nie die Anfrage-URL an den Suchdienst — bei SearXNG ist das die
 * Zeile, an der ein Mensch sieht, welche Instanz gefragt wurde und was genau in `q` stand.
 *
 * Optional, weil `suche` auch ausserhalb eines Laufs aufgerufen werden koennen muss (Messungen,
 * Diagnose). Im Werkzeug ist sie nie weggelassen — `web_suchen` reicht sie immer durch.
 */
export type SuchMelder = (ziel: { url: string; host: string }) => void

export interface SuchAnbieter {
  name: string
  suche(
    anfrage: string, anzahl: number, abrufen: typeof fetch, melde?: SuchMelder,
  ): Promise<SuchAntwort>
}

/**
 * Anfragen darueber werden abgelehnt. §3.4 nennt 200 Zeichen fuer `web_suchen`; die Grenze ist
 * zugleich eine Ausleit-Bremse, denn eine Suchanfrage ist der bequemste Kanal, um Inhalt aus
 * dem Lauf an einen Dritten zu schicken — sie geht unredigiert nach draussen.
 */
export const MAX_ANFRAGE_LAENGE = 200

/** Harte Obergrenze aus §3.4. Zehn Treffer sind schon ~1.500 Token Antwort. */
export const MAX_ANZAHL = 10

/** Laenge eines Auszugs, §3.4. Gemessen kam ein 4.000-Zeichen-`content` ungekappt an. */
export const MAX_AUSZUG_ZEICHEN = 300

/**
 * Laenge eines Titels. §3.4 nennt nur den Auszug; ein Titel ist derselbe Kanal, nur kuerzer
 * beabsichtigt — und wer ihn nicht kappt, hat die Grenze fuer den Auszug umsonst gezogen.
 */
export const MAX_TITEL_ZEICHEN = 200

/** Zeitbudget fuer `web_suchen` aus §3.4. Gilt fuer den ganzen Aufruf, nicht je Teilschritt. */
export const ZEITBUDGET_MS = 10_000

/**
 * Groessengrenze des Antwortkoerpers. Zehn Treffer JSON sind einige zehn Kilobyte; ein Megabyte
 * ist reichlich und zugleich weit unter dem, was ein haengender oder feindlicher Dienst schickt.
 */
export const MAX_ANTWORT_BYTES = 1_000_000

/**
 * Die Grenzen, die diese Datei selbst zieht, weil die netzwache hier nicht dazwischensteht
 * (siehe Modulkopf). Ueberschreibbar, damit ein Test sie in Millisekunden erreichen kann.
 */
export interface SuchGrenzen {
  zeitbudgetMs: number
  maxBytes: number
}

export const STANDARD_GRENZEN: SuchGrenzen = {
  zeitbudgetMs: ZEITBUDGET_MS,
  maxBytes: MAX_ANTWORT_BYTES,
}

/** Fehlschlag mit Namen. Kein leeres Ergebnis, kein `?? []`. */
export class SuchFehler extends Error {
  constructor(public readonly anbieter: string, meldung: string) {
    super(`${anbieter}: ${meldung}`)
    this.name = 'SuchFehler'
  }
}

/**
 * Der Satz, der an `engineLage` haengt, sobald etwas geblockt ist. Er steht dort und nicht im
 * Kommentar, weil ihn sonst niemand liest, der die Auswirkung gerade hat.
 */
const SPERRHINWEIS =
  'SearXNG sperrt eine geblockte Engine 3.600 s, bei CAPTCHA einen Tag, bei Cloudflare 15 Tage'

function pruefeAnfrage(anbieter: string, anfrage: string): string {
  const sauber = anfrage.trim()
  if (sauber === '') {
    throw new SuchFehler(anbieter, 'Die Suchanfrage war leer.')
  }
  if (sauber.length > MAX_ANFRAGE_LAENGE) {
    throw new SuchFehler(
      anbieter,
      `Die Suchanfrage ist ${sauber.length} Zeichen lang, erlaubt sind ${MAX_ANFRAGE_LAENGE}.`,
    )
  }
  return sauber
}

function klemmeAnzahl(anzahl: number): number {
  if (!Number.isFinite(anzahl)) return 5
  return Math.min(MAX_ANZAHL, Math.max(1, Math.trunc(anzahl)))
}

/**
 * JSON lesen, oder benannt scheitern. Ein Anbieter, der HTML mit einer Rate-Limit-Seite
 * zurueckgibt, darf hier nicht als „null Treffer" enden.
 */
function jsonOderFehler(anbieter: string, roh: string): Record<string, unknown> {
  try {
    const gelesen: unknown = JSON.parse(roh)
    if (typeof gelesen !== 'object' || gelesen === null) {
      throw new Error('kein Objekt')
    }
    return gelesen as Record<string, unknown>
  } catch {
    // Der Rumpf wird bewusst nicht mitgegeben: er kann beliebig gross und beliebig fremd sein.
    throw new SuchFehler(anbieter, `Die Antwort war kein JSON (${roh.length} Zeichen empfangen).`)
  }
}

/**
 * Laesst ein Versprechen gegen die Uhr laufen. Ohne das haengt der Werkzeugaufruf so lange, wie
 * der Dienst Geduld hat — und ein haengender Dienst ist der wahrscheinlichere Ausfall als ein
 * ablehnender. Dieselbe Bauform wie in `netzwache.gegenDieUhr`, aus demselben Grund: das Signal
 * allein reicht nicht, weil ein Abrufer es ignorieren darf.
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
 * Liest den Koerper gegen die Groessengrenze *waehrend* des Lesens. Hinterher zu messen hiesse,
 * dass ein 5-GB-Koerper schon im Speicher liegt, wenn die Grenze es merkt.
 */
async function liesBegrenzt(
  anbieter: string,
  antwort: Response,
  grenzen: SuchGrenzen,
  signal: AbortSignal,
  zeitGrund: string,
): Promise<string> {
  const koerper = antwort.body
  if (koerper === null) return ''
  const leser = koerper.getReader()
  const dekodierer = new TextDecoder()
  let gelesen = 0
  let text = ''
  for (;;) {
    if (signal.aborted) {
      await leser.cancel(zeitGrund)
      throw new SuchFehler(anbieter, zeitGrund)
    }
    const stueck = await leser.read()
    if (stueck.done) break
    gelesen += stueck.value.byteLength
    if (gelesen > grenzen.maxBytes) {
      const grund = `Die Antwort ueberschreitet die Groessengrenze von ${grenzen.maxBytes} Bytes.`
      // Die Verbindung muss hier enden, sonst sendet der Dienst weiter in einen Leser, den
      // niemand liest.
      await leser.cancel(grund)
      throw new SuchFehler(anbieter, grund)
    }
    text += dekodierer.decode(stueck.value, { stream: true })
  }
  return text + dekodierer.decode()
}

/**
 * Der eine Abrufweg beider Anbieter: Uhr, Groessengrenze, und **jeder** Fehlschlag mit Namen.
 * Vorher waren nur HTTP-Status und Nicht-JSON benannt; ein Transportfehler (DNS, Verbindung
 * abgelehnt, `redirect: 'error'` bei einem umleitenden SearXNG, Abbruch) fiel als roher
 * TypeError heraus, ohne `SuchFehler` und ohne Anbieternamen — der Werkzeugrumpf meldete dann
 * 'fetch failed' und liess offen, ob der Betrieb aus ist oder die Anfrage schlecht war.
 */
async function holeJson(
  anbieter: string,
  ziel: string,
  init: RequestInit,
  grenzen: SuchGrenzen,
  abrufen: typeof fetch,
  statusZusatz: (status: number) => string,
  melde?: SuchMelder,
): Promise<Record<string, unknown>> {
  // Vor dem Abruf, nicht danach: eine Anfrage, die im Zeitbudget haengen bleibt, ist trotzdem
  // hinausgegangen. Der Host wird aus der geparsten URL genommen; ein Endpunkt, den `new URL`
  // nicht lesen kann, ist oben schon benannt abgelehnt worden.
  if (melde) melde({ url: ziel, host: new URL(ziel).hostname })
  const steuerung = new AbortController()
  const uhr = setTimeout(() => steuerung.abort(), grenzen.zeitbudgetMs)
  const signal = steuerung.signal
  const zeitGrund = `Zeitbudget von ${grenzen.zeitbudgetMs} ms ueberschritten (${ziel}).`

  try {
    let antwort: Response
    try {
      antwort = await gegenDieUhr(abrufen(ziel, { ...init, signal }), signal, zeitGrund)
    } catch (fehler) {
      if (signal.aborted) throw new SuchFehler(anbieter, zeitGrund)
      throw new SuchFehler(anbieter, `Abruf fehlgeschlagen (${ziel}): ${(fehler as Error).message}`)
    }

    if (!antwort.ok) {
      throw new SuchFehler(anbieter, `HTTP ${antwort.status}${statusZusatz(antwort.status)}`)
    }

    let roh: string
    try {
      roh = await gegenDieUhr(liesBegrenzt(anbieter, antwort, grenzen, signal, zeitGrund), signal, zeitGrund)
    } catch (fehler) {
      if (fehler instanceof SuchFehler) throw fehler
      if (signal.aborted) throw new SuchFehler(anbieter, zeitGrund)
      throw new SuchFehler(anbieter, `Lesen fehlgeschlagen (${ziel}): ${(fehler as Error).message}`)
    }

    return jsonOderFehler(anbieter, roh)
  } finally {
    clearTimeout(uhr)
  }
}

function ergebnisListe(anbieter: string, koerper: Record<string, unknown>): Record<string, unknown>[] {
  const roh = koerper.results
  if (!Array.isArray(roh)) {
    throw new SuchFehler(anbieter, 'Die Antwort hat kein Feld `results`.')
  }
  return roh.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
}

function text(wert: unknown): string {
  return typeof wert === 'string' ? wert : ''
}

/**
 * Gesaeubert und gekappt. Beides ist Pflicht und nicht Kosmetik: ein Titel oder Auszug ist
 * fremdbestimmter Netzinhalt auf demselben Weg ins Kontextfenster wie eine geholte Seite.
 * Gemessen kam ein `title: 'Harmlos​\u{E0001}\u{E0049}\u{E0067}'` mit allen vier
 * versteckten Codepoints beim Aufrufer an und ein 4.000-Zeichen-`content` mit 4.001 Zeichen.
 *
 * Erst saeubern, dann kappen: NFKC kann einen Text laenger machen (die Ligatur 'ﬁ' wird zu
 * 'fi'), also muss die Grenze auf den endgueltigen Zeichen liegen. Die Kappung endet sichtbar,
 * damit ein abgeschnittener Auszug nicht wie ein vollstaendiger aussieht.
 *
 * Und `einzeilig` dazwischen, weil `saeubere` Zeilenumbrueche stehen laesst — sie ueberleben NFKC
 * und stehen auf keiner ihrer Streichlisten. Gemessen kam ein `title: 'Zeile1\nZeile2'`
 * unveraendert beim Aufrufer an, und im dreizeiligen Ausgabeformat von `web_suchen` schrieb ein
 * solcher Titel einen zweiten, frei erfundenen Treffer samt URL in keels eigene Liste (siehe
 * `einzeilig`).
 */
function sauberGekappt(wert: unknown, max: number): string {
  const sauber = einzeilig(saeubere(text(wert))).trim()
  return sauber.length <= max ? sauber : sauber.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Die URL eines Treffers, oder null. Ein Eintrag ohne brauchbare URL ist kein Treffer: vorher
 * machte `text()` aus jedem fehlenden Feld eine leere Zeichenkette, und ein missgebildeter
 * `results`-Eintrag wurde damit zu einem vollwertig aussehenden Treffer mit leerem Titel und
 * leerer URL — der in der Trefferzahl mitzaehlte und dessen leere URL als Kandidat in
 * `seite_lesen` wanderte.
 *
 * Zurueckgegeben wird die *geparste* Form. Sie percent-kodiert, was unsichtbar war: ein
 * Zero-Width-Zeichen im Pfad steht danach als `%E2%80%8B` da, sichtbar fuer jeden, der die Liste
 * liest. `saeubere` waere hier falsch — NFKC auf einer URL veraendert das Ziel.
 *
 * **Nur https.** http stand hier einmal daneben und erreichte nichts: `pruefeUrl` lehnt es
 * garantiert ab, bevor auch nur aufgeloest wird. Der Treffer verbrauchte aber einen der harten
 * zehn Plaetze und landete in `trefferUrls`, also in der Herkunftsliste von `seite_lesen` —
 * gemessen an `http://100.78.7.108:11434/api/generate`, dem unauthentifizierten Ollama im
 * Tailnet. Zwei Restschaeden, beide hier behoben: dem Modell wurde ein internes Ziel als
 * abrufbarer Treffer angeboten, und die Absage lautete danach 'Nur https ist erlaubt, nicht
 * http:' statt 'gesperrtes Netz (Tailscale)' — die falsche Meldung ausgerechnet an der Stelle,
 * an der die richtige in netzwache.ts ausdruecklich erarbeitet wurde.
 */
function brauchbareUrl(wert: unknown): string | null {
  const roh = text(wert).trim()
  if (roh === '') return null
  try {
    const url = new URL(roh)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Der Satz ueber verworfene Eintraege, oder nichts. Eine stille Verwerfung waere die Luecke. */
function verwurfHinweis(verworfen: number): string {
  return verworfen === 0
    ? ''
    : ` ${verworfen} Eintrag/Eintraege ohne brauchbare URL verworfen.`
}

function zahl(wert: unknown): number | undefined {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined
}

// ---------------------------------------------------------------------------------------------
// SearXNG
// ---------------------------------------------------------------------------------------------

/**
 * SearXNG, `format=json`. Freizuschalten in `settings.yml` unter `search: formats: [json]`,
 * und der Limiter muss fuers Tailscale-Netz entschaerft sein — beides sind Betriebsfehler, die
 * hier als 403 bzw. als HTML ankommen und deshalb beide beim Namen genannt werden.
 */
export class SearxngAnbieter implements SuchAnbieter {
  readonly name = 'searxng'

  constructor(
    private readonly endpunkt: string,
    grenzen: Partial<SuchGrenzen> = {},
  ) {
    this.grenzen = { ...STANDARD_GRENZEN, ...grenzen }
  }

  private readonly grenzen: SuchGrenzen

  async suche(
    anfrage: string, anzahl: number, abrufen: typeof fetch, melde?: SuchMelder,
  ): Promise<SuchAntwort> {
    const q = pruefeAnfrage(this.name, anfrage)
    const grenze = klemmeAnzahl(anzahl)

    // `new URL` wirft bei einem unbrauchbaren Endpunkt roh — und ein Betriebsfehler in der
    // Konfiguration saehe dann aus wie ein Fehler im Werkzeug.
    let url: URL
    try {
      url = new URL('search', this.endpunkt.replace(/\/*$/, '/'))
    } catch {
      throw new SuchFehler(this.name, `Der konfigurierte Endpunkt ist keine gueltige URL: ${this.endpunkt}`)
    }
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'json')

    const koerper = await holeJson(
      this.name,
      url.toString(),
      {
        method: 'GET',
        // Kein Cookie, kein Auth-Header, kein Jar ueber Aufrufe hinweg (§4.1).
        headers: { accept: 'application/json' },
        redirect: 'error',
      },
      this.grenzen,
      abrufen,
      status => status === 403
        ? ' — vermutlich der Limiter: das Tailscale-Netz ist in `limiter.toml` nicht freigegeben,'
          + ' oder `search.formats` enthaelt `json` nicht.'
        : '',
      melde,
    )
    const alle = ergebnisListe(this.name, koerper)
    const roh = alle.filter(e => brauchbareUrl(e.url) !== null)
    const verworfen = alle.length - roh.length

    const treffer: Treffer[] = roh.slice(0, grenze).map(e => ({
      titel: sauberGekappt(e.title, MAX_TITEL_ZEICHEN),
      url: brauchbareUrl(e.url) ?? '',
      auszug: sauberGekappt(e.content, MAX_AUSZUG_ZEICHEN),
      engine: text(e.engine) || 'unbekannt',
      bewertung: zahl(e.score),
    }))

    // Die Lage wird ueber *alle* brauchbaren Rohtreffer gezaehlt, nicht nur ueber die
    // zurueckgegebenen: sonst sieht eine Engine, deren Treffer hinter `grenze` liegen, wie ein
    // Ausfall aus.
    return { treffer, engineLage: this.lage(roh, koerper.unresponsive_engines, verworfen) }
  }

  private lage(roh: Record<string, unknown>[], unresponsive: unknown, verworfen: number): string {
    const proEngine = new Map<string, number>()
    for (const e of roh) {
      const engine = text(e.engine) || 'unbekannt'
      proEngine.set(engine, (proEngine.get(engine) ?? 0) + 1)
    }
    const geantwortet = [...proEngine.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([engine, n]) => `${engine} (${n})`)

    // Form in SearXNG: [[name, grund], ...] — aeltere Fassungen liefern nur Namen. Beides
    // wird gelesen, statt bei der unerwarteten Form still auf „nichts geblockt" zu fallen.
    const geblockt: string[] = []
    if (Array.isArray(unresponsive)) {
      for (const eintrag of unresponsive) {
        if (Array.isArray(eintrag)) {
          const grund = text(eintrag[1])
          geblockt.push(grund === '' ? text(eintrag[0]) : `${text(eintrag[0])} (${grund})`)
        } else if (typeof eintrag === 'string') {
          geblockt.push(eintrag)
        } else {
          geblockt.push('unlesbarer Eintrag')
        }
      }
    }

    // „keine Engine hat geantwortet" stand hier einmal und war eine Auskunft, die dieses Modul
    // nicht hat: SearXNG liefert `results: []` auch dann, wenn alle Engines geantwortet haben
    // und keine etwas fand. Der Lauf schloss daraus auf einen Ausfall der Suchinfrastruktur und
    // formulierte um — oder hielt umgekehrt einen echten Totalausfall fuer ein leeres Ergebnis.
    // Gesagt wird deshalb nur, was gezaehlt wurde: Treffer. Die Engine-Lage steht daneben und
    // trennt die beiden Faelle, soweit SearXNG sie trennt.
    const kopf = geantwortet.length === 0
      ? 'Engines: null Treffer; keine Engine hat einen Treffer geliefert'
      : `Engines: geantwortet ${geantwortet.join(', ')}`
    const schwanz = verwurfHinweis(verworfen)
    if (geblockt.length === 0) {
      return `${kopf}; geblockt: keine.${schwanz}`
    }
    return `${kopf}; geblockt: ${geblockt.join(', ')} — ${SPERRHINWEIS}.${schwanz}`
  }
}

// ---------------------------------------------------------------------------------------------
// Tavily
// ---------------------------------------------------------------------------------------------

/**
 * Tavily. Der Schluessel kommt aus der Konfiguration und steht nie in einer Meldung: eine
 * Fehlermeldung landet im Ereignisprotokoll und von dort im Kontext des Modells.
 */
export class TavilyAnbieter implements SuchAnbieter {
  readonly name = 'tavily'

  constructor(
    private readonly schluessel: string,
    grenzen: Partial<SuchGrenzen> = {},
  ) {
    this.grenzen = { ...STANDARD_GRENZEN, ...grenzen }
  }

  private readonly grenzen: SuchGrenzen

  async suche(
    anfrage: string, anzahl: number, abrufen: typeof fetch, melde?: SuchMelder,
  ): Promise<SuchAntwort> {
    const q = pruefeAnfrage(this.name, anfrage)
    const grenze = klemmeAnzahl(anzahl)

    const koerper = await holeJson(
      this.name,
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.schluessel}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: q,
          max_results: grenze,
          search_depth: 'basic',
          // Ausdruecklich aus: `include_raw_content` bei zehn Treffern sind grob 100k Token.
          // Ein 27B mit 64K nutzbarem Kontext hat das nicht. Inline-Inhalt loest ein Problem
          // von Cloud-Modellen mit 200K Kontext, nicht unseres — Seiten holt `seite_lesen`.
          include_raw_content: false,
          include_answer: false,
        }),
        redirect: 'error',
      },
      this.grenzen,
      abrufen,
      () => '',
      melde,
    )
    const alle = ergebnisListe(this.name, koerper)
    const roh = alle.filter(e => brauchbareUrl(e.url) !== null)
    const verworfen = alle.length - roh.length

    const treffer: Treffer[] = roh.slice(0, grenze).map(e => ({
      titel: sauberGekappt(e.title, MAX_TITEL_ZEICHEN),
      url: brauchbareUrl(e.url) ?? '',
      auszug: sauberGekappt(e.content, MAX_AUSZUG_ZEICHEN),
      engine: this.name,
      bewertung: zahl(e.score),
    }))

    // Tavily nennt keine Engines. Eine erfundene Liste waere schlimmer als keine: das Werkzeug
    // gaebe eine Auskunft, die es nicht hat, und die Zeile soll gerade das Gegenteil leisten.
    return {
      treffer,
      engineLage:
        `Engines: Tavily liefert keine Engine-Aufschluesselung; ${treffer.length} Treffer ` +
        'von einem Anbieter. Ein stilles Ausduennen einzelner Quellen ist hier nicht sichtbar.' +
        verwurfHinweis(verworfen),
    }
  }
}

/**
 * Brave — eigener Index, kein Meta-Proxy und kein Aufsatz auf einer fremden Suchmaschine. Das ist
 * der sachliche Vorteil gegenueber SearXNG (das nur weiterreicht, was Google und DuckDuckGo gerade
 * herausruecken) und gegenueber Tavily (das seinerseits fremde Indizes buendelt).
 *
 * **Die Auflage, die mitkommt, und warum sie hier steht statt in einer Fussnote:** Braves
 * Nutzungsbedingungen untersagen in §3(b)(i) woertlich, Ergebnisse zu „store, cache, or create a
 * database of Search Results, in whole or in part, other than transient storage required for
 * operation of Customer Applications". keels Ereignisprotokoll ist append-only und haelt die
 * Trefferliste in `tool.completed` dauerhaft. Ob das als „transient storage required for
 * operation" durchgeht — ein Lauf braucht seine Historie, um fortgesetzt zu werden — ist eine
 * Auslegung und keine Selbstverstaendlichkeit. §3(b)(xiii) untersagt zusaetzlich, Ergebnisse zum
 * „create, evaluate, train, re-train, fine-tune, benchmark or otherwise improve" von KI-Modellen
 * zu verwenden; das zielt auf Training, nicht auf Grounding zur Laufzeit, aber „evaluate" und
 * „benchmark" sind weit gefasst.
 *
 * Diese Abwaegung gehoert dem Betreiber, nicht dem Code. Der Code sagt sie nur an der Stelle, an
 * der jemand sie treffen muss. SearXNG und Tavily tragen sie nicht.
 */
export class BraveAnbieter implements SuchAnbieter {
  readonly name = 'brave'

  constructor(
    private readonly schluessel: string,
    grenzen: Partial<SuchGrenzen> = {},
  ) {
    this.grenzen = { ...STANDARD_GRENZEN, ...grenzen }
  }

  private readonly grenzen: SuchGrenzen

  async suche(
    anfrage: string, anzahl: number, abrufen: typeof fetch, melde?: SuchMelder,
  ): Promise<SuchAntwort> {
    const q = pruefeAnfrage(this.name, anfrage)
    const grenze = klemmeAnzahl(anzahl)

    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', q)
    url.searchParams.set('count', String(grenze))
    // Kein `extra_snippets`: mehr Auszug je Treffer kostet Kontext, den ein 27B nicht hat, und
    // Seiten holt `seite_lesen`. Dieselbe Begruendung wie `include_raw_content: false` bei Tavily.
    url.searchParams.set('text_decorations', 'false')

    const koerper = await holeJson(
      this.name,
      url.toString(),
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip',
          'x-subscription-token': this.schluessel,
        },
        redirect: 'error',
      },
      this.grenzen,
      abrufen,
      () => '',
      melde,
    )

    // Brave verschachtelt die Netztreffer unter `web.results`; andere Abschnitte (news, videos)
    // bleiben aussen vor. Wer sie mit hineinnaehme, bekaeme eine Trefferliste, deren Herkunft
    // das Modell nicht mehr unterscheiden kann.
    const web = (koerper as { web?: { results?: unknown } } | null)?.web
    const alle = ergebnisListe(this.name, { results: web?.results })
    const roh = alle.filter(e => brauchbareUrl(e.url) !== null)
    const verworfen = alle.length - roh.length

    const treffer: Treffer[] = roh.slice(0, grenze).map(e => ({
      titel: sauberGekappt(e.title, MAX_TITEL_ZEICHEN),
      url: brauchbareUrl(e.url) ?? '',
      // Brave nennt den Auszug `description`, nicht `content` wie Tavily. `ergebnisListe`
      // normalisiert keine Feldnamen — sie reicht die Rohsaetze durch. Wer hier `e.content`
      // liest, bekommt bei jedem Treffer einen leeren Auszug, und zwar still.
      auszug: sauberGekappt(e.description, MAX_AUSZUG_ZEICHEN),
      engine: this.name,
    }))

    return {
      treffer,
      engineLage:
        `Engines: Brave sucht im eigenen Index und nennt keine Aufschluesselung; ` +
        `${treffer.length} Treffer von einem Anbieter. Ein stilles Ausduennen einzelner Quellen ` +
        'ist hier nicht sichtbar.' + verwurfHinweis(verworfen),
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------------------------

export interface SuchKonfiguration {
  /** Basis-URL der SearXNG-Instanz, z. B. `http://100.67.95.13:8080`. */
  searxngEndpunkt?: string | null
  tavilySchluessel?: string | null
  /**
   * Brave-Schluessel. Traegt eine Auflage, die die anderen beiden nicht haben — siehe den
   * Kommentarkopf von `BraveAnbieter`.
   */
  braveSchluessel?: string | null
  /** Ausdrueckliche Vorgabe. Ist der gewaehlte Anbieter nicht konfiguriert, wird das gesagt. */
  bevorzugt?: 'searxng' | 'tavily' | 'brave'
}

export type AnbieterWahl =
  | { ok: true; anbieter: SuchAnbieter }
  | { ok: false; meldung: string }

function gesetzt(wert: string | null | undefined): string | null {
  const sauber = (wert ?? '').trim()
  return sauber === '' ? null : sauber
}

/**
 * Waehlt den Anbieter — und benennt den Zustand „keiner konfiguriert", statt ihn als leeres
 * Ergebnis zu tarnen.
 *
 * Reihenfolge ohne ausdrueckliche Vorgabe: **Tavily vor SearXNG.** Das widerspricht der
 * Ueberschrift von §3.2 und folgt seinem Text: die Gegenposition dort ist belegt (ein
 * dokumentierter SearXNG-Test lieferte Google 0 Ergebnisse, Brave „too many requests",
 * Startpage CAPTCHA — nur DuckDuckGo lief), die Annahme „Wohnanschluss-IP hilft" ist es nicht.
 * Bis eine Woche echter keel-Fragen auf MS-01 gemessen ist (M6), ist die Vorgabe das, was heute
 * funktioniert. Diese eine Zeile dreht sich um, wenn die Messung da ist.
 */
export function waehleAnbieter(konfig: SuchKonfiguration): AnbieterWahl {
  const endpunkt = gesetzt(konfig.searxngEndpunkt)
  const schluessel = gesetzt(konfig.tavilySchluessel)
  const brave = gesetzt(konfig.braveSchluessel)

  if (konfig.bevorzugt === 'searxng') {
    return endpunkt === null
      ? { ok: false, meldung: 'Der bevorzugte Suchanbieter searxng ist nicht konfiguriert: es fehlt der Endpunkt.' }
      : { ok: true, anbieter: new SearxngAnbieter(endpunkt) }
  }
  if (konfig.bevorzugt === 'tavily') {
    return schluessel === null
      ? { ok: false, meldung: 'Der bevorzugte Suchanbieter tavily ist nicht konfiguriert: es fehlt der Schluessel.' }
      : { ok: true, anbieter: new TavilyAnbieter(schluessel) }
  }
  if (konfig.bevorzugt === 'brave') {
    return brave === null
      ? { ok: false, meldung: 'Der bevorzugte Suchanbieter brave ist nicht konfiguriert: es fehlt der Schluessel.' }
      : { ok: true, anbieter: new BraveAnbieter(brave) }
  }

  // Ohne ausdrueckliche Vorgabe bleibt es bei Tavily zuerst, dann SearXNG — die Entscheidung des
  // Entwurfs (§3.2: Tavily ist die Vorgabe, weil es heute funktioniert; SearXNG uebernimmt, wenn
  // M6 gemessen hat, dass es mehr liefert als einen DuckDuckGo-Proxy). Brave kommt zuletzt und
  // **faellt niemandem zu**: es traegt als einziger eine ausdrueckliche Speicherbeschraenkung
  // (§3(b)(i), siehe BraveAnbieter). Wer damit leben will, waehlt es ausdruecklich.
  if (schluessel !== null) return { ok: true, anbieter: new TavilyAnbieter(schluessel) }
  if (endpunkt !== null) return { ok: true, anbieter: new SearxngAnbieter(endpunkt) }
  if (brave !== null) return { ok: true, anbieter: new BraveAnbieter(brave) }

  return {
    ok: false,
    meldung:
      'Kein Suchanbieter konfiguriert. Es braucht einen SearXNG-Endpunkt, einen Tavily- oder ' +
      'einen Brave-Schluessel; ohne eines davon wird nicht gesucht, und es wird auch nicht so getan.',
  }
}
