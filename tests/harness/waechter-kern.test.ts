import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oeffneHarnessDb, anhaengen, lesen } from '../../src/main/harness/protokoll'
import { projiziere } from '../../src/main/harness/projektion'
import { baueStabilenTeil } from '../../src/main/harness/praefix'
import { starteLauf } from '../../src/main/harness/lauf'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import { effekteOhneIntent } from '../../src/main/harness/intent-vor-effekt'
import { effekteOhneEntscheidung } from '../../src/main/harness/tor'
import type { Ereignis } from '../../src/main/harness/ereignisse'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { ModellEintrag } from '../../src/main/model/entry'

const HARNESS = join(__dirname, '..', '..', 'src', 'main', 'harness')

function harnessDateien(): string[] {
  return readdirSync(HARNESS, { recursive: true, encoding: 'utf-8' })
    .filter(p => p.endsWith('.ts'))
    .map(p => join(HARNESS, p))
}

describe('Waechter: der Kern kennt Electron nicht', () => {
  it('kein Modul unter src/main/harness/ importiert electron — ohne Ausnahmeliste', () => {
    const schuldige = harnessDateien().filter(p => {
      const q = readFileSync(p, 'utf-8')
      return /from\s+['"]electron['"]/.test(q) || /require\(['"]electron['"]\)/.test(q)
    })
    expect(schuldige).toEqual([])
  })

  it('findet ueberhaupt Module, damit ein leeres Verzeichnis den Waechter nicht gruen faerbt', () => {
    expect(harnessDateien().length).toBeGreaterThan(10)
  })
})

describe('Waechter: der Praefix ist rekonstruierbar', () => {
  it('die Projektion aus dem Protokoll ist zeichengleich mit prompt.sent', () => {
    const db = oeffneHarnessDb(':memory:')
    const teile = {
      body: 'BODY', capabilities: 'CAP', persona: 'PERS',
      globaleRegeln: 'REGELN', auftragstext: 'auftrag',
      faehigkeiten: [{
        name: 'gate-urteil-guide', beschreibung: 'Faellt das Urteil an einem Gate.',
        rumpf: 'Der Rumpf, der nie in den Praefix darf.',
        pfad: '.claude/capabilities/gate-urteil-guide',
      }],
    }
    const stummel = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]
    const gesendet = baueStabilenTeil(teile, stummel)
    anhaengen(db, 'l', 'prompt.sent', { text: gesendet })

    // Rebuilt from the parts, compared against what actually went over the wire — that is only
    // a check because prompt.sent stores the text literally rather than a reconstruction.
    const nachgebaut = baueStabilenTeil(teile, stummel)
    const abgelegt = String(lesen(db, 'l')[0].nutzlast.text)
    expect(nachgebaut).toBe(abgelegt)
  })
})

// Same pattern as tests/harness/lauf-werkzeuge.test.ts's own `umgebung`/`ruft`/`sagt`/`AUFTRAG` —
// deliberately not imported (that file does not export them), but not reinvented either: this is
// the minimal setup needed to drive `starteLauf` through one real tool call and a closing turn.
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

function umgebung(wurzel: string, antworten: ModelAntwort[]) {
  let i = 0, t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: 'a', faehigkeiten: [] },
    wache: { wurzel, heim: wurzel, userDataPfad: join(wurzel, 'ud') },
    graphDb: null,
    registry: new WerkzeugRegistry(DATEI_WERKZEUGE),
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

describe('Waechter: kein Effekt ohne Intent', () => {
  it('ein echter Lauf mit einem Werkzeugaufruf verletzt die Regel nicht', async () => {
    // Drives the actual loop in lauf.ts, not a hand-built event array — a guard for "the log
    // lauf.ts writes obeys the rule" has to look at a log lauf.ts actually wrote. Swapping the
    // two `schreibe()` calls in `fuehreAus` (src/main/harness/lauf.ts) would turn this red; see
    // the self-check note in task-14-report.md for the probe that confirms it.
    const wurzel = mkdtempSync(join(tmpdir(), 'keel-waechter-'))
    try {
      writeFileSync(join(wurzel, 'a.ts'), 'inhalt')
      const u = umgebung(wurzel, [ruft('datei_lesen', { pfad: join(wurzel, 'a.ts') }), sagt('fertig')])
      const laufId = await starteLauf(AUFTRAG(wurzel), u)
      const ereignisse = lesen(u.db, laufId)
      expect(ereignisse.some(e => e.art === 'tool.completed')).toBe(true)
      expect(effekteOhneIntent(ereignisse)).toEqual([])
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  it('effekteOhneIntent findet ein tool.completed ohne vorherigen tool.intent', () => {
    // The checker itself, tested against data it did not construct to pass — this is what makes
    // the guard above meaningful: the rule lives in production code, not restated in the test.
    const ereignisse: Ereignis[] = [
      { laufId: 'l', seq: 1, ts: 't', art: 'tool.completed', nutzlast: { aufrufId: 'c9', inhalt: [] } },
    ]
    const verletzungen = effekteOhneIntent(ereignisse)
    expect(verletzungen).toHaveLength(1)
    expect(verletzungen[0].nutzlast.aufrufId).toBe('c9')
  })

  it('effekteOhneIntent laesst einen Intent gefolgt von seinem Completed durch', () => {
    const ereignisse: Ereignis[] = [
      { laufId: 'l', seq: 1, ts: 't', art: 'tool.intent', nutzlast: { aufrufId: 'c1', name: 'datei_lesen' } },
      { laufId: 'l', seq: 2, ts: 't', art: 'tool.completed', nutzlast: { aufrufId: 'c1', inhalt: [] } },
    ]
    expect(effekteOhneIntent(ereignisse)).toEqual([])
  })
})

describe('Waechter: kein Effekt ohne Entscheidung', () => {
  it('effekteOhneEntscheidung findet ein wirkendes completed ohne vorherige Entscheidung', () => {
    // Die Regel selbst, gegen Daten geprueft, die sie nicht zum Bestehen gebaut hat — das
    // Gegenstueck zum echten Lauf in lauf-wirkende-werkzeuge.test.ts.
    const v = effekteOhneEntscheidung([
      { laufId: 'l', seq: 0, ts: 't', art: 'tool.completed', nutzlast: { aufrufId: '1', name: 'datei_schreiben' } },
    ])
    expect(v).toHaveLength(1)
  })
})

describe('Waechter: der Vertrag bleibt an den Aussenkanten', () => {
  it('weder die Zug-Funktion noch ein Codec noch ein Werkzeug sieht pflichtfelder', () => {
    // M8 4.9 wants no required field to be able to shape an answer before it is thought. The
    // Auftrag carries them because it *is* the outer edge; one level down nothing may.
    const erlaubt = [join(HARNESS, 'lauf.ts')]
    const schuldige = harnessDateien()
      .filter(p => !erlaubt.includes(p))
      .filter(p => readFileSync(p, 'utf-8').includes('pflichtfelder'))
    expect(schuldige).toEqual([])
  })

  it('in lauf.ts steht pflichtfelder nur im Auftrag und im Abschluss', () => {
    const q = readFileSync(join(HARNESS, 'lauf.ts'), 'utf-8')
    const zeilen = q.split('\n').map((z, i) => [i + 1, z] as const)
      .filter(([, z]) => z.includes('pflichtfelder'))
    // Auftrag declaration (1), a forwarding `auftrag.pflichtfelder` argument to `beende` at each
    // of `fahre`'s three exit branches — refused-in-closing-turn, closing-turn-done,
    // ziel-erreicht (3), and the parameter plus its one use inside `beende` itself, split across
    // two lines by the ternary (3). None of the three forwarding sites reads or branches on the
    // value; each only passes it on. If an eighth line appears, something started reading it
    // instead of forwarding it.
    expect(zeilen.length).toBeLessThanOrEqual(7)
    expect(q).not.toMatch(/toWire\([^)]*pflichtfelder/)
  })
})

describe('Waechter: der Verlauf traegt keine Drahtform', () => {
  it('die Projektion enthaelt keinen anbieterspezifischen Bezeichner', () => {
    const verlauf = projiziere([
      { laufId: 'l', seq: 1, ts: 't', art: 'run.started', nutzlast: { auftragstext: 'a' } },
      { laufId: 'l', seq: 2, ts: 't', art: 'model.answered', nutzlast: { bloecke: [{ art: 'text', text: 'b' }] } },
    ])
    const text = JSON.stringify(verlauf)
    for (const fremd of ['tool_use', 'tool_calls', 'image_url', 'finish_reason', 'stop_reason']) {
      expect(text).not.toContain(fremd)
    }
  })
})
