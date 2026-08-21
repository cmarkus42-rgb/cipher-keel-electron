import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oeffneHarnessDb, anhaengen, lesen } from '../../src/main/harness/protokoll'
import { starteLauf, setzeFort } from '../../src/main/harness/lauf'
import { WerkzeugRegistry, META_WERKZEUG_NAME, type Werkzeug } from '../../src/main/harness/werkzeuge'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { ModellEintrag } from '../../src/main/model/entry'

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

function umgebung(wurzel: string, antworten: ModelAntwort[], werkzeuge: Werkzeug[] = DATEI_WERKZEUGE) {
  let i = 0, t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: 'a', faehigkeiten: [] },
    wache: { wurzel, heim: wurzel, userDataPfad: join(wurzel, 'ud') },
    graphDb: null,
    registry: new WerkzeugRegistry(werkzeuge),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    sende: async (): Promise<ModelAntwort> => antworten[i++],
  }
}

const ruft = (name: string, eingabe: Record<string, unknown>, id = 'c1'): ModelAntwort => ({
  bloecke: [{ art: 'werkzeug-aufruf', id, name, eingabe }],
  stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const sagt = (text: string): ModelAntwort => ({
  bloecke: [{ art: 'text', text }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const AUFTRAG = (wurzel: string) => ({
  auftragstext: 'lies a.ts', modellId: 'test-modell', wurzel,
  budgets: { runden: 6, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 },
})

describe('Werkzeugausfuehrung', () => {
  it('schreibt tool.intent vor tool.completed', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'inhalt')
    const u = umgebung(w, [ruft('datei_lesen', { pfad: join(w, 'a.ts') }), sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const arten = lesen(u.db, id).map(e => e.art)
    expect(arten.indexOf('tool.intent')).toBeLessThan(arten.indexOf('tool.completed'))
    rmSync(w, { recursive: true, force: true })
  })

  it('macht aus einer abgelehnten Pfadpruefung ein tool.failed und laeuft weiter', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, '.env'), 'TOKEN=x')
    const u = umgebung(w, [ruft('datei_lesen', { pfad: join(w, '.env') }), sagt('verstanden')])
    const id = await starteLauf(AUFTRAG(w), u)
    const ev = lesen(u.db, id)
    expect(ev.some(e => e.art === 'tool.failed')).toBe(true)
    expect(ev.at(-1)?.nutzlast).toMatchObject({ endzustand: 'fertig' })
    rmSync(w, { recursive: true, force: true })
  })

  it('reicht ein Schema nach und schreibt tool.schema_loaded', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft('werkzeug_schema', { name: 'datei_lesen' }), sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const geladen = lesen(u.db, id).find(e => e.art === 'tool.schema_loaded')
    expect(geladen?.nutzlast.name).toBe('datei_lesen')
    rmSync(w, { recursive: true, force: true })
  })

  it('haelt den stabilen Anfang zeichengleich, waehrend der volatile Schwanz sich unterscheidet', async () => {
    // The stable part is computed once per run and handed to every turn unchanged -- so any test
    // that never grows the progress tail (e.g. a run with no tool calls at all) would find the two
    // sent prompts fully IDENTICAL, not merely prefix-equal, and could not fail no matter what the
    // code does. A tool call between two turns is what makes the tail actually move: after the
    // first turn's werkzeug_schema call completes, `## Fortschritt` gains a line the first prompt
    // never had. That is the only way this test can tell "prefix preserved" from "nothing changed".
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft('werkzeug_schema', { name: 'datei_lesen' }), sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const prompts = lesen(u.db, id).filter(e => e.art === 'prompt.sent')
      .map(e => String(e.nutzlast.text))
    expect(prompts).toHaveLength(2)

    // The stable start is byte-identical...
    const stabilerAnfang = prompts[0].split('## Fortschritt')[0]
    expect(prompts[1].startsWith(stabilerAnfang)).toBe(true)
    // The schema is in the history, never in the stable part.
    expect(prompts[0]).not.toContain('"required"')

    // ...but the two full prompts are demonstrably NOT the same string: the second carries a
    // progress tail the first does not have. Without this half, `startsWith` would pass just as
    // well on two identical strings and prove nothing about the volatile part at all.
    expect(prompts[0]).not.toContain('## Fortschritt')
    expect(prompts[1]).toContain('## Fortschritt')
    expect(prompts[1]).not.toBe(prompts[0])
    rmSync(w, { recursive: true, force: true })
  })

  it('lehnt ein unbekanntes Werkzeug beim Namen ab', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft('zaubern', {}), sagt('ok')])
    const id = await starteLauf(AUFTRAG(w), u)
    const f = lesen(u.db, id).find(e => e.art === 'tool.failed')
    expect(String(f?.nutzlast.meldung)).toContain('zaubern')
    rmSync(w, { recursive: true, force: true })
  })

  it('fuehrt mehrere lesende Aufrufe eines Zuges aus', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'A')
    writeFileSync(join(w, 'b.ts'), 'B')
    const zwei: ModelAntwort = {
      bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: join(w, 'a.ts') } },
        { art: 'werkzeug-aufruf', id: 'c2', name: 'datei_lesen', eingabe: { pfad: join(w, 'b.ts') } },
      ],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebung(w, [zwei, sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    expect(lesen(u.db, id).filter(e => e.art === 'tool.completed')).toHaveLength(2)
    rmSync(w, { recursive: true, force: true })
  })

  it('fuehrt mehrere Aufrufe eines Zuges tatsaechlich nebenlaeufig aus, nicht nur der Form nach', async () => {
    // A naive `for (const a of aufrufe) await fuehreAus(...)` would satisfy every assertion above
    // (right count, right order of intent-before-completed) while running strictly sequentially.
    // Only timing tells the two apart: two calls with different delays, both slower ones started
    // before the faster one finishes, prove Promise.all() is doing real concurrent work.
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const ablauf: string[] = []
    const verzoegert = (name: string, ms: number): Werkzeug => ({
      name,
      beschreibung: 'Verzoegertes Test-Werkzeug',
      schema: () => ({ type: 'object', properties: {} }),
      async ausfuehren() {
        ablauf.push(`start:${name}`)
        await new Promise(resolve => setTimeout(resolve, ms))
        ablauf.push(`ende:${name}`)
        return { ok: true, inhalt: [{ art: 'text', text: name }] }
      },
    })
    const langsam = verzoegert('langsam', 40)
    const schnell = verzoegert('schnell', 5)
    const zwei: ModelAntwort = {
      bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'langsam', eingabe: {} },
        { art: 'werkzeug-aufruf', id: 'c2', name: 'schnell', eingabe: {} },
      ],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebung(w, [zwei, sagt('fertig')], [langsam, schnell])
    await starteLauf(AUFTRAG(w), u)
    // Sequential execution would produce start:langsam, ende:langsam, start:schnell, ende:schnell.
    // Concurrent execution starts both before either finishes, and the faster one finishes first.
    expect(ablauf).toEqual(['start:langsam', 'start:schnell', 'ende:schnell', 'ende:langsam'])
    rmSync(w, { recursive: true, force: true })
  })

  it('macht aus einem werfenden Werkzeug ein tool.failed, statt den Lauf abzubrechen', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const wirft: Werkzeug = {
      name: 'wirft',
      beschreibung: 'Wirft immer',
      schema: () => ({ type: 'object', properties: {} }),
      async ausfuehren() { throw new Error('Kaboom') },
    }
    const u = umgebung(w, [ruft('wirft', {}), sagt('trotzdem fertig')], [wirft])
    const id = await starteLauf(AUFTRAG(w), u)
    const ev = lesen(u.db, id)
    const f = ev.find(e => e.art === 'tool.failed')
    expect(String(f?.nutzlast.meldung)).toContain('Kaboom')
    expect(ev.some(e => e.art === 'tool.completed')).toBe(false)
    expect(ev.at(-1)?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'ziel-erreicht' })
    rmSync(w, { recursive: true, force: true })
  })

  it('schreibt zwei vollstaendige Ergebnisse, wenn zwei Aufrufe eines Zuges dieselbe Aufruf-ID tragen', async () => {
    // The model is the one making a contract error here, not the loop -- the loop does not
    // deduplicate by aufrufId. Both calls run, both get an intent and a result written; the
    // projection (tested separately) is what turns the second one into a visible contradiction
    // rather than the loop silently dropping or merging one of them.
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'A')
    writeFileSync(join(w, 'b.ts'), 'B')
    const kollision: ModelAntwort = {
      bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: join(w, 'a.ts') } },
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: join(w, 'b.ts') } },
      ],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebung(w, [kollision, sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const ev = lesen(u.db, id)
    expect(ev.filter(e => e.art === 'tool.intent' && e.nutzlast.aufrufId === 'c1')).toHaveLength(2)
    expect(ev.filter(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'c1')).toHaveLength(2)
    expect(ev.at(-1)?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'ziel-erreicht' })
    rmSync(w, { recursive: true, force: true })
  })

  it('lehnt beim Meta-Werkzeug einen unbekannten Werkzeugnamen ab', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft(META_WERKZEUG_NAME, { name: 'gibtsnicht' }), sagt('ok')])
    const id = await starteLauf(AUFTRAG(w), u)
    const ev = lesen(u.db, id)
    const f = ev.find(e => e.art === 'tool.failed')
    expect(String(f?.nutzlast.meldung)).toContain('gibtsnicht')
    expect(ev.some(e => e.art === 'tool.schema_loaded')).toBe(false)
    rmSync(w, { recursive: true, force: true })
  })

  it('maskiert einen Werkzeugaufruf im Abschlusszug, statt ihn stillschweigend zu verwerfen', async () => {
    // The closing turn is exactly one turn (M8, and the note from Task 11's review): the model
    // already had its turn to comply. A tool call that arrives anyway must be logged and refused,
    // not silently swallowed by nurText() and not given a second closing turn to try again.
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'A')
    const u = umgebung(w, [
      sagt('erster Zug'),
      ruft('datei_lesen', { pfad: join(w, 'a.ts') }, 'c-abschluss'),
    ])
    const id = await starteLauf({ ...AUFTRAG(w), budgets: { ...AUFTRAG(w).budgets, runden: 1 } }, u)
    const ev = lesen(u.db, id)

    // 1. The refusal is on the record, with the closing-turn reason.
    const failed = ev.find(e => e.art === 'tool.failed' && e.nutzlast.aufrufId === 'c-abschluss')
    expect(String(failed?.nutzlast.meldung)).toContain('Abschlusszug')

    // 2. The tool was NOT executed -- the important half. Logging a refusal proves something was
    // written; only the absence of a completion proves nothing ran.
    expect(ev.some(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'c-abschluss')).toBe(false)

    // 3. The run ends on the original closing reason, exactly one closing turn, not a retry
    // loop. The closing turn itself carried no text (only the masked tool call) -- Fund 2's
    // fallback kicks in and the result is the earlier turn's text, marked as a fallback rather
    // than left empty or silently passed off as an answer to the closing instruction.
    const ende = ev.at(-1)
    expect(ende?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'runden-erschoepft' })
    const ergebnis = String(ende?.nutzlast.ergebnis)
    expect(ergebnis).toContain('erster Zug')
    expect(ergebnis).not.toBe('erster Zug')
    expect(ev.filter(e => e.art === 'model.answered')).toHaveLength(2)
    rmSync(w, { recursive: true, force: true })
  })
})

describe('Wiederaufnahme', () => {
  it('fuehrt kein Werkzeug ein zweites Mal aus', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'inhalt')
    const u = umgebung(w, [sagt('fertig')])
    const id = 'lauf-fortsetzen'
    // A run that already got as far as a completed tool call.
    anhaengen(u.db, id, 'run.started', { auftragstext: 'a', modellId: 'test-modell', werkzeuge: [] })
    anhaengen(u.db, id, 'model.answered', { bloecke: [
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: join(w, 'a.ts') } },
    ] })
    anhaengen(u.db, id, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' })
    anhaengen(u.db, id, 'tool.completed', { aufrufId: 'c1', name: 'datei_lesen', inhalt: [{ art: 'text', text: 'inhalt' }] })

    await setzeFort(id, AUFTRAG(w), u)
    expect(lesen(u.db, id).filter(e => e.art === 'tool.intent')).toHaveLength(1)
    rmSync(w, { recursive: true, force: true })
  })

  it('gibt einem offenen Intent ein Ergebnis mit unbekannter Ausfuehrung', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [sagt('verstanden')])
    const id = 'lauf-offen'
    anhaengen(u.db, id, 'run.started', { auftragstext: 'a', modellId: 'test-modell', werkzeuge: [] })
    anhaengen(u.db, id, 'model.answered', { bloecke: [
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
    ] })
    anhaengen(u.db, id, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' })

    await setzeFort(id, AUFTRAG(w), u)
    const prompt = lesen(u.db, id).filter(e => e.art === 'prompt.sent').at(-1)
    // The projection put it into the history; the loop must not re-run the call.
    expect(lesen(u.db, id).filter(e => e.art === 'tool.intent')).toHaveLength(1)
    expect(prompt).toBeDefined()
    rmSync(w, { recursive: true, force: true })
  })
})
