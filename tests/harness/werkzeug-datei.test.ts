import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DATEI_WERKZEUGE,
  _testSetzeSuchZeitbudgetMs,
  _testSuchZeitbudgetZuruecksetzen,
} from '../../src/main/harness/werkzeug-datei'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'

let heim: string
let wurzel: string
let ktx: { wache: { wurzel: string; heim: string; userDataPfad: string }; graphDb: null }

const werkzeug = (name: string) => {
  const w = DATEI_WERKZEUGE.find(x => x.name === name)
  if (!w) throw new Error(`kein Werkzeug ${name}`)
  return w
}

beforeAll(() => {
  heim = mkdtempSync(join(tmpdir(), 'keel-wz-'))
  wurzel = join(heim, 'projekt')
  mkdirSync(join(wurzel, 'unter'), { recursive: true })
  writeFileSync(join(wurzel, 'a.ts'), 'zeile 1\nzeile 2\nzeile 3\n')
  writeFileSync(join(wurzel, 'unter', 'b.ts'), 'export const warnungen = 1\n')
  writeFileSync(join(wurzel, '.env'), 'TOKEN=geheim')

  // Same filename inside and outside node_modules -- lets a test compare the two directly,
  // rather than only proving one side (see task-9 fix-round 2).
  mkdirSync(join(wurzel, 'node_modules', 'paket'), { recursive: true })
  writeFileSync(join(wurzel, 'node_modules', 'paket', 'ausserhalb.ts'), 'export const y = 1\n')
  writeFileSync(join(wurzel, 'ausserhalb.ts'), 'export const y = 1\n')

  // Guards against a substring/prefix implementation of the exclusion filter instead of a
  // whole-path-segment one: 'distribution' must not vanish because it starts with 'dist'.
  mkdirSync(join(wurzel, 'distribution'), { recursive: true })
  writeFileSync(join(wurzel, 'distribution', 'datei.ts'), 'export const z = 1\n')

  // Guards the same class of bug from the other direction: '.gitignore' must not vanish because
  // of some over-broad "starts with a dot" heuristic among the excluded names.
  writeFileSync(join(wurzel, '.gitignore'), 'node_modules/\n')

  // Depth-dependent exclusion fixture (task-9 fix-round 3): node_modules nests and must fall at
  // any depth; build-output names are only excluded directly under the root, so a same-named
  // source directory deeper in the tree must survive.
  mkdirSync(join(wurzel, 'node_modules', 'x', 'node_modules'), { recursive: true })
  writeFileSync(join(wurzel, 'node_modules', 'x', 'node_modules', 'tief.ts'), 'export const n = 1\n')
  mkdirSync(join(wurzel, 'build'), { recursive: true })
  writeFileSync(join(wurzel, 'build', 'erzeugt.ts'), 'export const b = 1\n')
  mkdirSync(join(wurzel, 'src', 'build'), { recursive: true })
  writeFileSync(join(wurzel, 'src', 'build', 'quelle.ts'), 'export const q = 1\n')
  mkdirSync(join(wurzel, 'src', 'node_modules'), { recursive: true })
  writeFileSync(join(wurzel, 'src', 'node_modules', 'fremd.ts'), 'export const f = 1\n')

  ktx = { wache: { wurzel, heim, userDataPfad: join(heim, 'ud') }, graphDb: null }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe('datei_lesen', () => {
  it('liest eine Datei in der Wurzel', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts') }, ktx)
    expect(r).toEqual({ ok: true, quelle: 'lokal', inhalt: [{ art: 'text', text: 'zeile 1\nzeile 2\nzeile 3\n' }] })
  })

  it('liest einen Zeilenbereich, wenn einer genannt ist', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts'), vonZeile: 2, bisZeile: 2 }, ktx)
    expect(r).toEqual({ ok: true, quelle: 'lokal', inhalt: [{ art: 'text', text: 'zeile 2' }] })
  })

  it('lehnt eine geschuetzte Datei ab, ohne den Lauf zu beenden', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, '.env') }, ktx)
    expect(r).toEqual({ ok: false, meldung: 'Pfad ist geschuetzt' })
  })

  it('meldet eine fehlende Datei als Werkzeugfehler, nicht als Wachefehler', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'gibtsnicht.ts') }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('nicht lesbar')
  })

  it('nennt das fehlende Feld statt zu raten', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({}, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('pfad')
  })
})

describe('datei_lesen — Zeilenbereich-Validierung', () => {
  it('lehnt vonZeile: 0 ab, statt (heute) die letzte Zeile zu liefern', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts'), vonZeile: 0 }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('vonZeile')
  })

  it('lehnt nicht-ganzzahlige Zeilenangaben ab', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts'), vonZeile: 1.5 }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('vonZeile')
  })

  it('lehnt bisZeile kleiner als vonZeile ab, statt still eine leere Zeichenkette zu liefern', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts'), vonZeile: 3, bisZeile: 1 }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('bisZeile')
  })

  it('kuerzt einen Bereich, der ueber das Dateiende hinausgeht, statt ihn abzulehnen', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts'), vonZeile: 2, bisZeile: 999 }, ktx)
    expect(r).toEqual({ ok: true, quelle: 'lokal', inhalt: [{ art: 'text', text: 'zeile 2\nzeile 3\n' }] })
  })
})

describe('verzeichnis_listen', () => {
  it('findet Dateien nach Muster, relativ zur Wurzel', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).toContain('a.ts')
      expect(text).toContain(join('unter', 'b.ts'))
    }
  })

  it('nennt geschuetzte Treffer gar nicht erst', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*' }, ktx)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).not.toContain('.env')
  })
})

describe('verzeichnis_listen — schwere Verzeichnisse ausgeschlossen (Relevanzfilter, keine Sicherheitsgrenze)', () => {
  it('listet eine Datei ausserhalb von node_modules', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain('ausserhalb.ts')
  })

  it('listet die gleichnamige Datei innerhalb von node_modules nicht — Kontrolle daneben beweist, dass sie ohne Filter auftauchen wuerde', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).not.toContain(join('node_modules', 'paket', 'ausserhalb.ts'))
    }
  })

  it('vermerkt ausgeschlossene Verzeichnisse im Ergebnis, statt Vollstaendigkeit vorzutaeuschen', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text.toLowerCase()
      expect(text).toContain('ausgeschlossen')
      expect(text).toContain('node_modules')
    }
  })

  it('schliesst .gitignore nicht faelschlich aus', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '.gitignore' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain('.gitignore')
  })

  it('schliesst ein Verzeichnis "distribution" nicht faelschlich aus, weil es mit "dist" beginnt', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain(join('distribution', 'datei.ts'))
  })
})

describe('verzeichnis_listen — tiefenabhaengiger Ausschluss (node_modules & Co. ueberall, Build-Namen nur an der Wurzel)', () => {
  it('schliesst node_modules auch verschachtelt aus', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).not.toContain(join('node_modules', 'x', 'node_modules', 'tief.ts'))
    }
  })

  it('schliesst ein build-Verzeichnis direkt an der Wurzel aus', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).not.toContain(join('build', 'erzeugt.ts'))
  })

  it('laesst ein gleichnamiges "build"-Verzeichnis in der Tiefe sichtbar — das ist der eigentliche Fund', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain(join('src', 'build', 'quelle.ts'))
  })

  it('schliesst ein node_modules-Verzeichnis in der Tiefe trotzdem aus (Gegenstueck zum vorigen Test)', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).not.toContain(join('src', 'node_modules', 'fremd.ts'))
  })

  it('unterscheidet im Ausschluss-Hinweis zwischen "jede Tiefe" und "nur direkt unter der Wurzel"', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).toContain('jede Tiefe')
      expect(text).toContain('nur direkt unter der Wurzel')
    }
  })
})

describe('inhalt_suchen', () => {
  it('findet einen Treffer samt Datei und Zeilennummer', async () => {
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: 'warnungen' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).toContain('b.ts')
      expect(text).toContain(':1:')
    }
  })

  it('meldet eine unbrauchbare Regex, statt sie zu verschlucken', async () => {
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: '([' }, ktx)
    expect(r.ok).toBe(false)
  })

  it('durchsucht geschuetzte Dateien nicht', async () => {
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: 'geheim' }, ktx)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).not.toContain('.env')
  })
})

describe('inhalt_suchen — Groessenschranke', () => {
  it('ueberspringt eine zu grosse Datei, statt sie synchron einzulesen, und vermerkt das', async () => {
    const grossePfad = join(wurzel, 'gross.log')
    writeFileSync(grossePfad, 'warnungen\n'.repeat(100_000)) // deutlich ueber MAX_BYTES
    try {
      const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: 'warnungen' }, ktx)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const text = (r.inhalt[0] as { text: string }).text
        expect(text).not.toContain('gross.log')
        expect(text.toLowerCase()).toContain('uebersprungen')
      }
    } finally {
      rmSync(grossePfad)
    }
  })
})

describe('inhalt_suchen — Musterlaenge', () => {
  it('lehnt ein zu langes Muster ab, statt es auszuwerten', async () => {
    const zuLang = 'a'.repeat(1000)
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: zuLang }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toMatch(/\d+/)
  })
})

describe('inhalt_suchen — Zeitbudget', () => {
  afterEach(() => _testSuchZeitbudgetZuruecksetzen())

  it('bricht die Suche ab, wenn das Zeitbudget ueberschritten ist, und sagt warum', async () => {
    // Ein bereits (auch bei 0ms Verstreichen) ueberschrittenes Budget -- prueft, dass die
    // Schranke selbst greift, ohne auf echtes katastrophales Backtracking angewiesen zu sein.
    _testSetzeSuchZeitbudgetMs(-1)
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: 'warnungen' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung.toLowerCase()).toContain('zeitbudget')
  })
})

describe('WerkzeugRegistry', () => {
  it('gibt bei aufgeschobenem Laden Stummel ohne Schema fuer echte Werkzeuge', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    const s = r.stummel(true)
    expect(s.filter(x => x.name !== 'werkzeug_schema').every(x => x.schema === undefined)).toBe(true)
    expect(s.some(x => x.name === 'werkzeug_schema')).toBe(true)
  })

  it('traegt beim Meta-Werkzeug schon im aufgeschobenen Modus ein Schema, sonst waere es selbst nicht aufrufbar', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    const s = r.stummel(true)
    const meta = s.find(x => x.name === 'werkzeug_schema')
    expect(meta?.schema).toBeDefined()
  })

  it('gibt ohne aufgeschobenes Laden alle Schemata mit und kein Meta-Werkzeug', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    const s = r.stummel(false)
    expect(s.every(x => x.schema !== undefined)).toBe(true)
    expect(s.some(x => x.name === 'werkzeug_schema')).toBe(false)
  })

  it('nennt ein unbekanntes Werkzeug beim Namen', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    expect(r.finde('zaubern')).toBeNull()
  })
})
