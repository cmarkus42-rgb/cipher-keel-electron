// Gegenproben, die zu dieser Datei gehoeren — jede wurde einmal ausgefuehrt und rot gesehen,
// weil ein Test, der nie rot war, kein Test ist. Zahlen im Bericht.
//
//   1. In `waehleAnbieter` den Zweig ohne Konfiguration `{ ok: true, anbieter: leer }` mit
//      leerer Trefferliste zurueckgeben lassen: 2 rot. Das ist der Zustand, gegen den dieser
//      Baustein steht — ein Agent mit leeren Treffern statt eines Fehlers halluziniert.
//   2. `engineLage` in `SearxngAnbieter` auf `''` gesetzt: 4 rot, darunter die Sperrdauern
//      und der Fall „null Treffer, google geblockt".
//   3. Die `!antwort.ok`-Pruefung in `SearxngAnbieter` entfernt: 2 rot — HTTP 502 und der
//      403-Limiter kamen als „null Treffer" durch, nicht als Fehler.
//   4. Die 200-Zeichen-Grenze der Anfrage entfernt: 2 rot, fuer beide Anbieter.
//
// Kein Netz: `abrufen` wird eingespeist, jede Antwort ist eine Zeichenkette im Test.
import { describe, it, expect } from 'vitest'
import {
  SearxngAnbieter, TavilyAnbieter, SuchFehler, waehleAnbieter,
  MAX_ANFRAGE_LAENGE, MAX_ANZAHL,
} from '../../src/main/harness/such-anbieter'

/** Ein Abrufer, der eine feste JSON-Antwort liefert und die Aufrufe mitschreibt. */
function jsonAbrufer(koerper: unknown, init: { status?: number } = {}) {
  const aufrufe: { url: string; init: RequestInit | undefined }[] = []
  const abrufen = (async (eingabe: string | URL | Request, i?: RequestInit) => {
    aufrufe.push({ url: String(eingabe), init: i })
    return new Response(typeof koerper === 'string' ? koerper : JSON.stringify(koerper), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { abrufen, aufrufe }
}

const SEARX_ANTWORT = {
  results: [
    { title: 'Erster Treffer', url: 'https://beispiel.test/a', content: 'Auszug A', engine: 'duckduckgo', score: 2.5 },
    { title: 'Zweiter Treffer', url: 'https://beispiel.test/b', content: 'Auszug B', engine: 'duckduckgo', score: 1.5 },
    { title: 'Dritter Treffer', url: 'https://beispiel.test/c', content: 'Auszug C', engine: 'wikipedia', score: 1.0 },
  ],
  unresponsive_engines: [
    ['brave', 'too many requests'],
    ['startpage', 'CAPTCHA required'],
  ],
}

const searx = () => new SearxngAnbieter('http://100.67.95.13:8080/')
const tavily = () => new TavilyAnbieter('tvly-geheim')

describe('SearXNG', () => {
  it('fragt format=json am konfigurierten Endpunkt', async () => {
    const { abrufen, aufrufe } = jsonAbrufer(SEARX_ANTWORT)
    await searx().suche('qwen3 tool calling', 5, abrufen)
    const url = new URL(aufrufe[0].url)
    expect(url.origin).toBe('http://100.67.95.13:8080')
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('q')).toBe('qwen3 tool calling')
  })

  it('bildet die Treffer ab, samt Engine und Bewertung', async () => {
    const { abrufen } = jsonAbrufer(SEARX_ANTWORT)
    const antwort = await searx().suche('frage', 5, abrufen)
    expect(antwort.treffer[0]).toEqual({
      titel: 'Erster Treffer', url: 'https://beispiel.test/a', auszug: 'Auszug A',
      engine: 'duckduckgo', bewertung: 2.5,
    })
    expect(antwort.treffer).toHaveLength(3)
  })

  it('haelt sich an anzahl', async () => {
    const { abrufen } = jsonAbrufer(SEARX_ANTWORT)
    expect((await searx().suche('frage', 2, abrufen)).treffer).toHaveLength(2)
  })

  it('nennt in engineLage, wer geantwortet hat und wer geblockt ist', async () => {
    const { abrufen } = jsonAbrufer(SEARX_ANTWORT)
    const { engineLage } = await searx().suche('frage', 5, abrufen)
    expect(engineLage).toContain('duckduckgo (2)')
    expect(engineLage).toContain('wikipedia (1)')
    expect(engineLage).toContain('brave (too many requests)')
    expect(engineLage).toContain('startpage (CAPTCHA required)')
  })

  it('nennt die Sperrdauern, damit stilles Ausduennen auffaellt', async () => {
    // Ohne diese Zeile bekommt der Lauf still weniger Ergebnisse und merkt es nicht:
    // SearXNG sperrt eine geblockte Engine 3.600 s, bei CAPTCHA einen Tag, bei
    // Cloudflare 15 Tage. Nach dem dritten Ausfall sucht nur noch eine Engine.
    const { abrufen } = jsonAbrufer(SEARX_ANTWORT)
    const { engineLage } = await searx().suche('frage', 5, abrufen)
    expect(engineLage).toContain('3.600 s')
    expect(engineLage).toContain('15 Tage')
  })

  it('sagt auch, wenn nichts geblockt ist — Schweigen waere zweideutig', async () => {
    const { abrufen } = jsonAbrufer({ results: SEARX_ANTWORT.results, unresponsive_engines: [] })
    const { engineLage } = await searx().suche('frage', 5, abrufen)
    expect(engineLage).toContain('geblockt: keine')
    expect(engineLage).not.toContain('15 Tage')
  })

  it('meldet null Treffer als Lage, nicht als Erfolg mit leerer Liste', async () => {
    const { abrufen } = jsonAbrufer({ results: [], unresponsive_engines: [['google', 'blocked']] })
    const { treffer, engineLage } = await searx().suche('frage', 5, abrufen)
    expect(treffer).toHaveLength(0)
    expect(engineLage).toContain('keine Engine hat geantwortet')
    expect(engineLage).toContain('google (blocked)')
  })

  it('wirft benannt bei HTTP-Fehler statt leer zurueckzukommen', async () => {
    const { abrufen } = jsonAbrufer({ }, { status: 502 })
    await expect(searx().suche('frage', 5, abrufen)).rejects.toThrow(SuchFehler)
    await expect(searx().suche('frage', 5, abrufen)).rejects.toThrow(/502/)
  })

  it('nennt den Limiter beim Namen, wenn 403 kommt', async () => {
    // Der wahrscheinlichste Betriebsfehler auf MS-01: `limiter` an, Tailscale-Netz nicht
    // freigegeben. Ohne diesen Hinweis sucht man den Fehler im Werkzeug.
    const { abrufen } = jsonAbrufer({}, { status: 403 })
    await expect(searx().suche('frage', 5, abrufen)).rejects.toThrow(/[Ll]imiter/)
  })

  it('wirft benannt, wenn die Antwort kein results-Feld hat', async () => {
    const { abrufen } = jsonAbrufer({ nachricht: 'json format not enabled' })
    await expect(searx().suche('frage', 5, abrufen)).rejects.toThrow(/results/)
  })

  it('wirft benannt, wenn die Antwort kein JSON ist', async () => {
    const { abrufen } = jsonAbrufer('<html>Rate limit</html>')
    await expect(searx().suche('frage', 5, abrufen)).rejects.toThrow(SuchFehler)
  })
})

describe('Tavily', () => {
  const TAVILY_ANTWORT = {
    results: [
      { title: 'T1', url: 'https://beispiel.test/1', content: 'Auszug 1', score: 0.9 },
      { title: 'T2', url: 'https://beispiel.test/2', content: 'Auszug 2', score: 0.8 },
    ],
  }

  it('schickt Anfrage und Schluessel und fragt keinen Rohinhalt an', async () => {
    const { abrufen, aufrufe } = jsonAbrufer(TAVILY_ANTWORT)
    await tavily().suche('qwen3 tool calling', 5, abrufen)
    expect(aufrufe[0].url).toBe('https://api.tavily.com/search')
    const kopf = new Headers(aufrufe[0].init?.headers)
    expect(kopf.get('authorization')).toBe('Bearer tvly-geheim')
    const koerper = JSON.parse(String(aufrufe[0].init?.body))
    expect(koerper.query).toBe('qwen3 tool calling')
    expect(koerper.max_results).toBe(5)
    // include_raw_content bei zehn Treffern sind grob 100k Token. Ein 27B mit 64K
    // nutzbarem Kontext hat das nicht — die Seiten holt seite_lesen einzeln.
    expect(koerper.include_raw_content).toBe(false)
  })

  it('bildet die Treffer ab und setzt engine auf tavily', async () => {
    const { abrufen } = jsonAbrufer(TAVILY_ANTWORT)
    const { treffer } = await tavily().suche('frage', 5, abrufen)
    expect(treffer[0]).toEqual({
      titel: 'T1', url: 'https://beispiel.test/1', auszug: 'Auszug 1',
      engine: 'tavily', bewertung: 0.9,
    })
  })

  it('sagt in engineLage ehrlich, dass es keine Engine-Aufschluesselung gibt', async () => {
    // Eine erfundene Engine-Liste waere schlimmer als keine: das Werkzeug wuerde eine
    // Auskunft geben, die es nicht hat.
    const { abrufen } = jsonAbrufer(TAVILY_ANTWORT)
    const { engineLage } = await tavily().suche('frage', 5, abrufen)
    expect(engineLage).toContain('keine Engine-Aufschluesselung')
    expect(engineLage).toContain('2')
  })

  it('wirft benannt bei 401 und nennt den Schluessel nicht mit', async () => {
    const { abrufen } = jsonAbrufer({ detail: 'unauthorized' }, { status: 401 })
    await expect(tavily().suche('frage', 5, abrufen)).rejects.toThrow(/401/)
    await expect(tavily().suche('frage', 5, abrufen)).rejects.not.toThrow(/tvly-geheim/)
  })

  it('wirft benannt, wenn die Antwort kein results-Feld hat', async () => {
    const { abrufen } = jsonAbrufer({ answer: 'nur Prosa' })
    await expect(tavily().suche('frage', 5, abrufen)).rejects.toThrow(/results/)
  })
})

describe('Grenzen der Anfrage — fuer beide Anbieter gleich', () => {
  for (const [name, bauen] of [['searxng', searx], ['tavily', tavily]] as const) {
    it(`${name}: lehnt eine leere Anfrage ab`, async () => {
      const { abrufen, aufrufe } = jsonAbrufer(SEARX_ANTWORT)
      await expect(bauen().suche('   ', 5, abrufen)).rejects.toThrow(/leer/)
      expect(aufrufe).toHaveLength(0)
    })

    it(`${name}: lehnt eine Anfrage ueber 200 Zeichen ab`, async () => {
      // Die Laengengrenze ist zugleich eine Ausleit-Bremse: eine Suchanfrage ist der
      // bequemste Kanal, um Inhalt aus dem Lauf an einen Dritten zu schicken.
      const { abrufen, aufrufe } = jsonAbrufer(SEARX_ANTWORT)
      await expect(bauen().suche('x'.repeat(MAX_ANFRAGE_LAENGE + 1), 5, abrufen))
        .rejects.toThrow(new RegExp(String(MAX_ANFRAGE_LAENGE)))
      expect(aufrufe).toHaveLength(0)
    })

    it(`${name}: klemmt anzahl auf 1 bis ${MAX_ANZAHL}`, async () => {
      const { abrufen } = jsonAbrufer(SEARX_ANTWORT)
      await expect(bauen().suche('frage', 99, abrufen)).resolves.toBeTruthy()
      await expect(bauen().suche('frage', 0, abrufen)).resolves.toBeTruthy()
    })
  }
})

describe('waehleAnbieter: kein Anbieter ist ein benannter Zustand', () => {
  it('gibt eine Meldung zurueck, keine leere Trefferliste', () => {
    // Der Grund, warum das kein `{ treffer: [] }` sein darf: ein Agent, der leere Treffer
    // statt eines Fehlers bekommt, halluziniert die Antwort. Genau daran ist im Entwurf
    // §3.2 auch das direkte DuckDuckGo-Scraping gescheitert — es degradiert still.
    const wahl = waehleAnbieter({})
    expect(wahl.ok).toBe(false)
    if (wahl.ok) return
    expect(wahl.meldung).toContain('Kein Suchanbieter konfiguriert')
    expect(wahl.meldung).toContain('SearXNG')
    expect(wahl.meldung).toContain('Tavily')
  })

  it('behandelt leere Zeichenketten wie fehlend', () => {
    expect(waehleAnbieter({ searxngEndpunkt: '  ', tavilySchluessel: '' }).ok).toBe(false)
  })

  it('nimmt Tavily, solange nur Tavily konfiguriert ist', () => {
    const wahl = waehleAnbieter({ tavilySchluessel: 'tvly-x' })
    expect(wahl.ok).toBe(true)
    if (!wahl.ok) return
    expect(wahl.anbieter.name).toBe('tavily')
  })

  it('nimmt SearXNG, solange nur SearXNG konfiguriert ist', () => {
    const wahl = waehleAnbieter({ searxngEndpunkt: 'http://100.67.95.13:8080' })
    expect(wahl.ok).toBe(true)
    if (!wahl.ok) return
    expect(wahl.anbieter.name).toBe('searxng')
  })

  it('nimmt bei beidem Tavily — bis M6 gemessen ist', () => {
    // §3.2 traegt die Gegenposition ausdruecklich mit: ein dokumentierter SearXNG-Test
    // lieferte Google 0 Ergebnisse, Brave "too many requests", Startpage CAPTCHA. Bis eine
    // Woche echter keel-Fragen auf MS-01 gemessen ist, ist die Vorgabe das, was heute geht.
    const wahl = waehleAnbieter({ searxngEndpunkt: 'http://100.67.95.13:8080', tavilySchluessel: 'tvly-x' })
    expect(wahl.ok).toBe(true)
    if (!wahl.ok) return
    expect(wahl.anbieter.name).toBe('tavily')
  })

  it('folgt einer ausdruecklichen Vorgabe', () => {
    const wahl = waehleAnbieter({
      searxngEndpunkt: 'http://100.67.95.13:8080', tavilySchluessel: 'tvly-x', bevorzugt: 'searxng',
    })
    expect(wahl.ok).toBe(true)
    if (!wahl.ok) return
    expect(wahl.anbieter.name).toBe('searxng')
  })

  it('nennt es, wenn der bevorzugte Anbieter nicht konfiguriert ist', () => {
    // Nicht still auf den anderen ausweichen: wer SearXNG verlangt hat, will nicht
    // unbemerkt ueber ein Rechenzentrum mit fremden AGB suchen.
    const wahl = waehleAnbieter({ tavilySchluessel: 'tvly-x', bevorzugt: 'searxng' })
    expect(wahl.ok).toBe(false)
    if (wahl.ok) return
    expect(wahl.meldung).toContain('searxng')
  })
})
