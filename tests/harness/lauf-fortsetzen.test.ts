import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oeffneHarnessDb, anhaengen, lesen } from '../../src/main/harness/protokoll'
import { setzeFort } from '../../src/main/harness/lauf'
import { WerkzeugRegistry, type Werkzeug } from '../../src/main/harness/werkzeuge'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { ModellEintrag } from '../../src/main/model/entry'
import { auftragAusProtokoll, laufAbgeschlossen, pruefeLaufLaeuftNicht } from '../../src/main/harness-handlers'

// auftragAusProtokoll and laufAbgeschlossen back HARNESS_LAUF_FORTSETZEN (Fix-Runde 3): the
// handler itself is untestable here (no test in this repo reaches ipcMain), but the two pure
// functions it is built from are — same pattern as pruefeAnhaenge in anhaenge-provenienz.test.ts.

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

const BUDGETS = { runden: 6, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 }

const sagt = (text: string): ModelAntwort => ({
  bloecke: [{ art: 'text', text }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

describe('auftragAusProtokoll', () => {
  it('rekonstruiert Auftragstext, Modell-Id, Wurzel und Budgets aus run.started', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'run.started', {
      auftragstext: 'lies etwas', modellId: 'test-modell', wurzel: '/tmp/projekt', budgets: BUDGETS,
    })
    expect(auftragAusProtokoll(lesen(db, 'l'))).toEqual({
      auftragstext: 'lies etwas', modellId: 'test-modell', wurzel: '/tmp/projekt', budgets: BUDGETS,
    })
  })

  it('gibt null zurueck, wenn das Protokoll gar kein run.started traegt', () => {
    expect(auftragAusProtokoll([])).toBeNull()
  })

  it('gibt null zurueck, wenn die Wurzel fehlt (aeltere Laeufe vor diesem Feld)', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'run.started', { auftragstext: 'x', modellId: 'test-modell', budgets: BUDGETS })
    expect(auftragAusProtokoll(lesen(db, 'l'))).toBeNull()
  })

  it('gibt null zurueck, wenn die Budgets unvollstaendig sind', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'run.started', {
      auftragstext: 'x', modellId: 'test-modell', wurzel: '/tmp', budgets: { runden: 6 },
    })
    expect(auftragAusProtokoll(lesen(db, 'l'))).toBeNull()
  })

  it('laesst anhaenge und pflichtfelder aus dem rekonstruierten Auftrag weg', () => {
    // Deliberate: see the comment on auftragAusProtokoll in harness-handlers.ts. Attachments
    // reach the resumed run through run.started's own anhangBloecke via the projection, not
    // through a re-read Auftrag.anhaenge -- and anhangBloecke() (the file read) is only ever
    // called from starteLauf, never from setzeFort/fahre.
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'run.started', {
      auftragstext: 'x', modellId: 'test-modell', wurzel: '/tmp', budgets: BUDGETS,
      anhangBloecke: [{ art: 'text', text: 'ein Anhang' }],
    })
    const auftrag = auftragAusProtokoll(lesen(db, 'l'))
    expect(auftrag).not.toHaveProperty('anhaenge')
    expect(auftrag).not.toHaveProperty('pflichtfelder')
  })
})

describe('laufAbgeschlossen', () => {
  it('ist falsch ohne run.finished', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'run.started', { auftragstext: 'x', modellId: 'm', wurzel: '/tmp', budgets: BUDGETS })
    expect(laufAbgeschlossen(lesen(db, 'l'))).toBe(false)
  })

  it('ist wahr, sobald run.finished im Protokoll steht', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'run.started', { auftragstext: 'x', modellId: 'm', wurzel: '/tmp', budgets: BUDGETS })
    anhaengen(db, 'l', 'run.finished', { endzustand: 'fertig', grund: 'ziel-erreicht' })
    expect(laufAbgeschlossen(lesen(db, 'l'))).toBe(true)
  })
})

// Regression: laufAbgeschlossen() alone cannot tell a crashed run apart from one that is this
// very process's own loop, still executing right now -- both show endzustand: null, because
// neither has written run.finished yet. Without this second check, clicking "Fortsetzen" on a
// run that is already running started a second fahre() loop over the same run id and database:
// every tool call doubled, two interleaved conversations in one append-only protocol.
describe('pruefeLaufLaeuftNicht', () => {
  it('laesst einen Lauf zu, der in keinem laufenden Verzeichnis steht', () => {
    expect(pruefeLaufLaeuftNicht('l1', new Set())).toEqual({ ok: true })
  })

  it('lehnt einen Lauf ab, der bereits als laufend markiert ist, benannt', () => {
    const ergebnis = pruefeLaufLaeuftNicht('l1', new Set(['l1', 'l2']))
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.meldung).toContain('l1')
  })

  it('laesst einen anderen Lauf zu, obwohl irgendein Lauf gerade laeuft', () => {
    expect(pruefeLaufLaeuftNicht('l3', new Set(['l1', 'l2']))).toEqual({ ok: true })
  })
})

describe('Wiederaufnahme ueber den rekonstruierten Auftrag (Beleg 8)', () => {
  it('fuehrt beim Fortsetzen kein Werkzeug erneut aus, dessen Intent schon offen im Protokoll stand', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-fortsetzen-'))
    let aufrufe = 0
    const zaehlwerkzeug: Werkzeug = {
      name: 'zaehlt',
      beschreibung: 'Zaehlt seine Aufrufe',
      schema: () => ({ type: 'object', properties: {} }),
      async ausfuehren() {
        aufrufe += 1
        return { ok: true, inhalt: [{ art: 'text', text: 'ok' }] }
      },
    }

    const laufId = 'lauf-fortsetzen-wiring'
    const db = oeffneHarnessDb(':memory:')
    // Exactly the situation Beleg 8 (Aufgabe 15) describes: the process died between a tool's
    // intent and its result -- an open tool.intent with no matching tool.completed/tool.failed.
    anhaengen(db, laufId, 'run.started', {
      auftragstext: 'zaehle', modellId: 'test-modell', wurzel: w, budgets: BUDGETS,
    })
    anhaengen(db, laufId, 'model.answered', {
      bloecke: [{ art: 'werkzeug-aufruf', id: 'c1', name: 'zaehlt', eingabe: {} }],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    })
    anhaengen(db, laufId, 'tool.intent', { aufrufId: 'c1', name: 'zaehlt', eingabe: {} })

    // Same reconstruction path HARNESS_LAUF_FORTSETZEN takes, not a hand-built Auftrag.
    expect(laufAbgeschlossen(lesen(db, laufId))).toBe(false)
    const auftrag = auftragAusProtokoll(lesen(db, laufId))
    expect(auftrag).not.toBeNull()

    await setzeFort(laufId, auftrag!, {
      db,
      eintrag: EINTRAG,
      praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: 'a' },
      wache: { wurzel: w, heim: w, userDataPfad: join(w, 'ud') },
      graphDb: null,
      registry: new WerkzeugRegistry([zaehlwerkzeug]),
      strom: () => {},
      uhr: () => 0,
      abgebrochen: () => false,
      sende: async (): Promise<ModelAntwort> => sagt('verstanden'),
    })

    // The important half: the tool's own code never ran a second time.
    expect(aufrufe).toBe(0)
    const ereignisse = lesen(db, laufId)
    expect(ereignisse.filter(e => e.art === 'tool.intent')).toHaveLength(1)
    expect(ereignisse.at(-1)?.nutzlast).toMatchObject({ endzustand: 'fertig' })
    rmSync(w, { recursive: true, force: true })
  })
})
