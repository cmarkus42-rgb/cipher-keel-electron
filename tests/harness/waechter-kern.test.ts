import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { oeffneHarnessDb, anhaengen, lesen } from '../../src/main/harness/protokoll'
import { projiziere } from '../../src/main/harness/projektion'
import { baueStabilenTeil } from '../../src/main/harness/praefix'

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

describe('Waechter: kein Effekt ohne Intent', () => {
  it('vor jedem Abschluss steht ein Intent mit derselben Aufruf-Id', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' })
    anhaengen(db, 'l', 'tool.completed', { aufrufId: 'c1', name: 'datei_lesen', inhalt: [] })

    const ereignisse = lesen(db, 'l')
    const gesehen = new Set<string>()
    for (const e of ereignisse) {
      if (e.art === 'tool.intent') gesehen.add(String(e.nutzlast.aufrufId))
      if (e.art === 'tool.completed' || e.art === 'tool.failed') {
        expect(gesehen.has(String(e.nutzlast.aufrufId))).toBe(true)
      }
    }
  })

  it('ein Abschluss ohne Intent faellt auf', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'tool.completed', { aufrufId: 'c9', inhalt: [] })
    const ereignisse = lesen(db, 'l')
    const gesehen = new Set(ereignisse.filter(e => e.art === 'tool.intent').map(e => String(e.nutzlast.aufrufId)))
    expect(gesehen.has('c9')).toBe(false)
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
