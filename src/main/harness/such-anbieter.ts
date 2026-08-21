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
 * Der Abrufer wird eingespeist. Im Betrieb ist das der an `netzwache` gebundene Abrufer, im
 * Test eine Funktion im Test. Diese Datei kennt kein Netz und keine Konfigurationsquelle.
 */

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

export interface SuchAnbieter {
  name: string
  suche(anfrage: string, anzahl: number, abrufen: typeof fetch): Promise<SuchAntwort>
}

/**
 * Anfragen darueber werden abgelehnt. §3.4 nennt 200 Zeichen fuer `web_suchen`; die Grenze ist
 * zugleich eine Ausleit-Bremse, denn eine Suchanfrage ist der bequemste Kanal, um Inhalt aus
 * dem Lauf an einen Dritten zu schicken — sie geht unredigiert nach draussen.
 */
export const MAX_ANFRAGE_LAENGE = 200

/** Harte Obergrenze aus §3.4. Zehn Treffer sind schon ~1.500 Token Antwort. */
export const MAX_ANZAHL = 10

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
async function jsonOderFehler(anbieter: string, antwort: Response): Promise<Record<string, unknown>> {
  const roh = await antwort.text()
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

  constructor(private readonly endpunkt: string) {}

  async suche(anfrage: string, anzahl: number, abrufen: typeof fetch): Promise<SuchAntwort> {
    const q = pruefeAnfrage(this.name, anfrage)
    const grenze = klemmeAnzahl(anzahl)

    const url = new URL('search', this.endpunkt.replace(/\/*$/, '/'))
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'json')

    const antwort = await abrufen(url.toString(), {
      method: 'GET',
      // Kein Cookie, kein Auth-Header, kein Jar ueber Aufrufe hinweg (§4.1).
      headers: { accept: 'application/json' },
      redirect: 'error',
    })

    if (!antwort.ok) {
      const zusatz = antwort.status === 403
        ? ' — vermutlich der Limiter: das Tailscale-Netz ist in `limiter.toml` nicht freigegeben,'
          + ' oder `search.formats` enthaelt `json` nicht.'
        : ''
      throw new SuchFehler(this.name, `HTTP ${antwort.status}${zusatz}`)
    }

    const koerper = await jsonOderFehler(this.name, antwort)
    const roh = ergebnisListe(this.name, koerper)

    const treffer: Treffer[] = roh.slice(0, grenze).map(e => ({
      titel: text(e.title),
      url: text(e.url),
      auszug: text(e.content),
      engine: text(e.engine) || 'unbekannt',
      bewertung: zahl(e.score),
    }))

    // Die Lage wird ueber *alle* Rohtreffer gezaehlt, nicht nur ueber die zurueckgegebenen:
    // sonst sieht eine Engine, deren Treffer hinter `grenze` liegen, wie ein Ausfall aus.
    return { treffer, engineLage: this.lage(roh, koerper.unresponsive_engines) }
  }

  private lage(roh: Record<string, unknown>[], unresponsive: unknown): string {
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

    const kopf = geantwortet.length === 0
      ? 'Engines: keine Engine hat geantwortet'
      : `Engines: geantwortet ${geantwortet.join(', ')}`
    if (geblockt.length === 0) {
      return `${kopf}; geblockt: keine.`
    }
    return `${kopf}; geblockt: ${geblockt.join(', ')} — ${SPERRHINWEIS}.`
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

  constructor(private readonly schluessel: string) {}

  async suche(anfrage: string, anzahl: number, abrufen: typeof fetch): Promise<SuchAntwort> {
    const q = pruefeAnfrage(this.name, anfrage)
    const grenze = klemmeAnzahl(anzahl)

    const antwort = await abrufen('https://api.tavily.com/search', {
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
    })

    if (!antwort.ok) {
      throw new SuchFehler(this.name, `HTTP ${antwort.status}`)
    }

    const koerper = await jsonOderFehler(this.name, antwort)
    const roh = ergebnisListe(this.name, koerper)

    const treffer: Treffer[] = roh.slice(0, grenze).map(e => ({
      titel: text(e.title),
      url: text(e.url),
      auszug: text(e.content),
      engine: this.name,
      bewertung: zahl(e.score),
    }))

    // Tavily nennt keine Engines. Eine erfundene Liste waere schlimmer als keine: das Werkzeug
    // gaebe eine Auskunft, die es nicht hat, und die Zeile soll gerade das Gegenteil leisten.
    return {
      treffer,
      engineLage:
        `Engines: Tavily liefert keine Engine-Aufschluesselung; ${treffer.length} Treffer ` +
        'von einem Anbieter. Ein stilles Ausduennen einzelner Quellen ist hier nicht sichtbar.',
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
  /** Ausdrueckliche Vorgabe. Ist der gewaehlte Anbieter nicht konfiguriert, wird das gesagt. */
  bevorzugt?: 'searxng' | 'tavily'
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

  if (schluessel !== null) return { ok: true, anbieter: new TavilyAnbieter(schluessel) }
  if (endpunkt !== null) return { ok: true, anbieter: new SearxngAnbieter(endpunkt) }

  return {
    ok: false,
    meldung:
      'Kein Suchanbieter konfiguriert. Es braucht entweder einen SearXNG-Endpunkt oder einen ' +
      'Tavily-Schluessel; ohne beides wird nicht gesucht, und es wird auch nicht so getan.',
  }
}
