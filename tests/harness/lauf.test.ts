import { describe, it, expect } from 'vitest'
import { anhaengen, oeffneHarnessDb, lesen } from '../../src/main/harness/protokoll'
import { starteLauf, setzeFort, verbrauchAusEreignissen } from '../../src/main/harness/lauf'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import type { ModellEintrag } from '../../src/main/model/entry'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { Ereignis } from '../../src/main/harness/ereignisse'

const EINTRAG: ModellEintrag = {
  id: 'test-modell', name: 'Testmodell', art: 'api',
  erreichbarkeit: { art: 'api', baseUrl: 'https://x/v1', model: 'm', keyRef: 'k' },
  oertlichkeit: 'fremdes-netz', erklaertext: '', empfehlung: '',
  faehigkeiten: {
    codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
    bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
    nutzbaresKontextfenster: 100_000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
    rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
  },
}

const AUFTRAG = {
  auftragstext: 'sag hallo', modellId: 'test-modell', wurzel: '/tmp',
  budgets: { runden: 3, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.8 },
}

/** A transport stand-in: the loop must not know it is not talking to a network. */
function umgebungMit(antworten: ModelAntwort[], gesendet: string[] = []) {
  let i = 0
  let t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: AUFTRAG.auftragstext },
    wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
    graphDb: null,
    registry: new WerkzeugRegistry([]),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    sende: async (_koerper: unknown, praefix: string): Promise<ModelAntwort> => {
      gesendet.push(praefix)
      return antworten[i++]
    },
  }
}

function antwort(text: string, stop: 'ende' | 'laenge' = 'ende'): ModelAntwort {
  return {
    bloecke: [{ art: 'text', text }],
    stopGrund: { normalisiert: stop, roh: stop === 'ende' ? 'stop' : 'length' },
    usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
  }
}

describe('starteLauf', () => {
  it('schreibt run.started, prompt.sent, model.answered und run.finished', async () => {
    const u = umgebungMit([antwort('hallo')])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).map(e => e.art))
      .toEqual(['run.started', 'prompt.sent', 'model.answered', 'run.finished'])
  })

  it('legt den gesendeten Prompt woertlich und vollstaendig ab', async () => {
    const gesendet: string[] = []
    const u = umgebungMit([antwort('hallo')], gesendet)
    const laufId = await starteLauf(AUFTRAG, u)
    const ev = lesen(u.db, laufId).find(e => e.art === 'prompt.sent')
    expect(ev?.nutzlast.text).toBe(gesendet[0])
    expect(String(ev?.nutzlast.text)).toContain('BODY')
  })

  it('endet mit fertig und ziel-erreicht, wenn das Modell aufhoert', async () => {
    const u = umgebungMit([antwort('hallo')])
    const laufId = await starteLauf(AUFTRAG, u)
    const ende = lesen(u.db, laufId).at(-1)
    expect(ende?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'ziel-erreicht' })
  })

  it('macht aus Trunkierung einen Abbruch ohne Reparaturversuch', async () => {
    const u = umgebungMit([antwort('abgeschnitten', 'laenge')])
    const laufId = await starteLauf(AUFTRAG, u)
    const arten = lesen(u.db, laufId).map(e => e.art)
    expect(arten).not.toContain('repair.attempted')
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'transportfehler',
    })
  })

  it('haelt den stabilen Praefix ueber die Zuege zeichengleich', async () => {
    // The second turn comes from the closing mode, not from a tool call — a run without tools
    // still gets two prompt.sent events once its round budget is hit.
    const gesendet: string[] = []
    const u = umgebungMit([antwort('erster Zug'), antwort('Abschluss')], gesendet)
    await starteLauf({ ...AUFTRAG, budgets: { ...AUFTRAG.budgets, runden: 1 } }, u)
    // Every sent prompt starts with the identical stable part — that is what the provider caches.
    expect(gesendet[1].startsWith(gesendet[0].split('## Fortschritt')[0])).toBe(true)
  })

  it('lehnt einen Werkzeugaufruf ab, solange keine Werkzeugliste gesendet wurde', async () => {
    const werkzeugAntwort: ModelAntwort = {
      bloecke: [{ art: 'werkzeug-aufruf', id: 'c1', name: 'zaubern', eingabe: {} }],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebungMit([werkzeugAntwort])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(String(lesen(u.db, laufId).at(-1)?.nutzlast.hinweis)).toContain('zaubern')
  })

  it('faehrt nach erschoepftem Rundenbudget einen Abschlusszug und endet fertig', async () => {
    // Two ordinary turns, both stopping naturally — no tool calls involved. The first turn
    // exhausts the round budget, the second is the closing turn that delivers the partial result.
    const u = umgebungMit([antwort('noch nicht fertig'), antwort('Teilergebnis')])
    const laufId = await starteLauf({ ...AUFTRAG, budgets: { ...AUFTRAG.budgets, runden: 1 } }, u)
    const ende = lesen(u.db, laufId).at(-1)
    expect(ende?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'runden-erschoepft' })
    expect(String(ende?.nutzlast.ergebnis)).toContain('Teilergebnis')
  })

  it("lehnt stopGrund 'werkzeug' ohne Werkzeugaufruf als Vertragsbruch ab", async () => {
    const widerspruch: ModelAntwort = {
      bloecke: [{ art: 'text', text: 'ich rufe gleich etwas auf' }],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebungMit([widerspruch])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'transportfehler',
    })
  })

  it("lehnt einen unbekannten Stop-Grund 'anderes' als Vertragsbruch ab", async () => {
    const unbekannt: ModelAntwort = {
      bloecke: [{ art: 'text', text: 'seltsam' }],
      stopGrund: { normalisiert: 'anderes', roh: 'content_filter' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebungMit([unbekannt])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'transportfehler',
    })
  })

  it('behandelt eine Antwort ganz ohne Bloecke als leeres Ziel-erreicht-Ergebnis', async () => {
    const leer: ModelAntwort = {
      bloecke: [],
      stopGrund: { normalisiert: 'ende', roh: 'stop' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebungMit([leer])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'fertig', grund: 'ziel-erreicht', ergebnis: '',
    })
  })

  it('bricht sauber ab, wenn sende wirft', async () => {
    const u = {
      ...umgebungMit([antwort('a')]),
      sende: async (): Promise<ModelAntwort> => { throw new Error('Netzwerk ist weg') },
    }
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'transportfehler', anweisung: 'Netzwerk ist weg',
    })
  })

  it('bricht auch im Abschlusszug an der Zuggrenze ab, statt den letzten Zug noch zu senden', async () => {
    // abgebrochen() is polled at every turn boundary, including the closing one — so a cancel
    // that lands right after the budget trips must win over sending the closing prompt.
    let aufrufe = 0
    const u = {
      ...umgebungMit([antwort('erster Zug')]),
      abgebrochen: () => { aufrufe += 1; return aufrufe > 1 },
    }
    const laufId = await starteLauf({ ...AUFTRAG, budgets: { ...AUFTRAG.budgets, runden: 1 } }, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'abgebrochen-von-aussen',
    })
  })

  it('haelt zwei gleichzeitige Laeufe auf derselben Datenbank auseinander', async () => {
    const db = oeffneHarnessDb(':memory:')
    const umgebungAuf = (text: string) => ({ ...umgebungMit([antwort(text)]), db })
    const [id1, id2] = await Promise.all([
      starteLauf(AUFTRAG, umgebungAuf('eins')),
      starteLauf(AUFTRAG, umgebungAuf('zwei')),
    ])
    expect(id1).not.toBe(id2)
    for (const id of [id1, id2]) {
      expect(lesen(db, id).map(e => e.art))
        .toEqual(['run.started', 'prompt.sent', 'model.answered', 'run.finished'])
    }
  })

  it('bricht auf Zuruf an der Zuggrenze ab', async () => {
    const u = { ...umgebungMit([antwort('a'), antwort('b')]), abgebrochen: () => true }
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'abgebrochen-von-aussen',
    })
  })

  it('lehnt einen ungebauten Codec beim Start ab, statt still zu ersetzen', async () => {
    const u = umgebungMit([antwort('a')])
    const eintrag = { ...EINTRAG, faehigkeiten: { ...EINTRAG.faehigkeiten!, codec: 'text' as const } }
    await expect(starteLauf(AUFTRAG, { ...u, eintrag })).rejects.toThrow(/text/)
  })

  it('lehnt werkzeugmodus text beim Start ab', async () => {
    const u = umgebungMit([antwort('a')])
    const eintrag = { ...EINTRAG, faehigkeiten: { ...EINTRAG.faehigkeiten!, werkzeugmodus: 'text' as const } }
    await expect(starteLauf(AUFTRAG, { ...u, eintrag })).rejects.toThrow(/Text-Protokoll/)
  })

  it('rechnet den Verbrauch bei der Fortsetzung aus dem Protokoll neu, statt bei null zu beginnen', async () => {
    // A run that already spent its one round before a crash must recognise the exhausted
    // budget on the very next turn after resuming — not rediscover it a full round later.
    const db = oeffneHarnessDb(':memory:')
    const laufId = 'lauf-fortsetzen'
    anhaengen(db, laufId, 'run.started', {
      auftragstext: AUFTRAG.auftragstext, modellId: AUFTRAG.modellId, werkzeuge: [],
    })
    anhaengen(db, laufId, 'prompt.sent', { text: 'BODY', zug: 1 })
    anhaengen(db, laufId, 'model.answered', {
      bloecke: [{ art: 'text', text: 'vor dem Absturz' }],
      stopGrund: { normalisiert: 'ende', roh: 'stop' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    })

    const u = { ...umgebungMit([antwort('Teilergebnis nach Wiederaufnahme')]), db }
    await setzeFort(laufId, { ...AUFTRAG, budgets: { ...AUFTRAG.budgets, runden: 1 } }, u)

    const ereignisse = lesen(db, laufId)
    // Exactly one more turn after resuming — the closing turn, not a normal one first.
    expect(ereignisse.filter(e => e.art === 'model.answered')).toHaveLength(2)
    expect(ereignisse.at(-1)?.nutzlast).toMatchObject({
      endzustand: 'fertig', grund: 'runden-erschoepft',
    })
  })
})

describe('verbrauchAusEreignissen', () => {
  const ev = (seq: number, art: Ereignis['art'], nutzlast: Record<string, unknown>, ts: string): Ereignis =>
    ({ laufId: 'x', seq, ts, art, nutzlast })

  it('zaehlt Runden aus model.answered und nimmt den Kontextstand der letzten Antwort, nicht die Summe', () => {
    const ereignisse: Ereignis[] = [
      ev(1, 'run.started', {}, '2026-08-18T10:00:00.000Z'),
      ev(2, 'model.answered', { usage: { eingabeToken: 100, ausgabeToken: 10, roh: null } }, '2026-08-18T10:01:00.000Z'),
      ev(3, 'model.answered', { usage: { eingabeToken: 200, ausgabeToken: 10, roh: null } }, '2026-08-18T10:02:00.000Z'),
      ev(4, 'model.answered', { usage: { eingabeToken: 300, ausgabeToken: 10, roh: null } }, '2026-08-18T10:03:00.000Z'),
    ]
    const v = verbrauchAusEreignissen(ereignisse, 'claude-sonnet-5', Date.parse('2026-08-18T10:05:00.000Z'))
    expect(v.runden).toBe(3)
    expect(v.letzteEingabeToken).toBe(300)
    // Elapsed time is measured from run.started's own timestamp, not from when this function runs.
    expect(v.verstricheneMs).toBe(5 * 60_000)
  })

  it('kostet ein leeres Protokoll ohne Antworten mit null Runden und null Kosten', () => {
    const ereignisse: Ereignis[] = [ev(1, 'run.started', {}, '2026-08-18T10:00:00.000Z')]
    const v = verbrauchAusEreignissen(ereignisse, 'claude-sonnet-5', Date.parse('2026-08-18T10:00:00.000Z'))
    expect(v).toEqual({ runden: 0, verstricheneMs: 0, kostenCent: 0, letzteEingabeToken: 0 })
  })
})
