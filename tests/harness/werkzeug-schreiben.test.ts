import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCHREIB_WERKZEUGE } from '../../src/main/harness/werkzeug-schreiben'
import type { WerkzeugKontext } from '../../src/main/harness/werkzeuge'

const schreiben = SCHREIB_WERKZEUGE.find(w => w.name === 'datei_schreiben')!
const loeschen = SCHREIB_WERKZEUGE.find(w => w.name === 'datei_loeschen')!

let heim: string
let wurzel: string
let ktx: WerkzeugKontext

beforeEach(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-schr-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  mkdirSync(join(heim, 'geheim'), { recursive: true })
  writeFileSync(join(heim, 'geheim', 'ziel.txt'), 'unberuehrt')
  ktx = {
    wache: { wurzel, heim, userDataPfad: join(heim, 'userData') },
    graphDb: null,
  }
})
afterEach(() => rmSync(heim, { recursive: true, force: true }))

describe('datei_schreiben', () => {
  it('legt eine Datei an', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'a.ts', inhalt: 'export const a = 1' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'a.ts'), 'utf-8')).toBe('export const a = 1')
  })

  it('legt fehlende Elternverzeichnisse an', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'src/tief/b.ts', inhalt: 'x' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'src', 'tief', 'b.ts'), 'utf-8')).toBe('x')
  })

  it('ersetzt eine bestehende Datei vollstaendig', async () => {
    writeFileSync(join(wurzel, 'c.ts'), 'alt und laenger')
    await schreiben.ausfuehren({ pfad: 'c.ts', inhalt: 'neu' }, ktx)
    expect(readFileSync(join(wurzel, 'c.ts'), 'utf-8')).toBe('neu')
  })

  it('lehnt einen Pfad ausserhalb der Wurzel ab, ohne zu schreiben', async () => {
    const ziel = join(heim, 'geheim', 'ziel.txt')
    const r = await schreiben.ausfuehren({ pfad: ziel, inhalt: 'zerstoert' }, ktx)
    expect(r.ok).toBe(false)
    expect(readFileSync(ziel, 'utf-8')).toBe('unberuehrt')
  })

  it('lehnt .env ab, auch in der Wurzel', async () => {
    const r = await schreiben.ausfuehren({ pfad: '.env', inhalt: 'x' }, ktx)
    expect(r.ok).toBe(false)
    expect(existsSync(join(wurzel, '.env'))).toBe(false)
  })

  it('folgt keinem Symlink aus der Wurzel heraus', async () => {
    // Was dieser Test belegt, ist die **Pfadwache**, nicht O_NOFOLLOW: `pruefePfad` loest den
    // Symlink auf, sieht ein Ziel ausserhalb der Wurzel und lehnt ab — `openSync` wird nie
    // erreicht. O_NOFOLLOW greift nur bei einem Tausch *nach* der Aufloesung, und diesen Fall
    // belegt kein Test dieser Strecke (siehe den Kommentar an `dateiSchreiben`).
    symlinkSync(join(heim, 'geheim', 'ziel.txt'), join(wurzel, 'abkuerzung.txt'))
    const r = await schreiben.ausfuehren({ pfad: 'abkuerzung.txt', inhalt: 'zerstoert' }, ktx)
    expect(r.ok).toBe(false)
    expect(readFileSync(join(heim, 'geheim', 'ziel.txt'), 'utf-8')).toBe('unberuehrt')
  })

  it('nennt ein fehlendes Feld statt still nichts zu tun', async () => {
    const r = await schreiben.ausfuehren({ inhalt: 'x' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('pfad')
  })

  it('verlangt inhalt als Zeichenkette', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'a.ts' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('inhalt')
  })

  it('nennt seine Quelle als lokal', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'a.ts', inhalt: 'x' }, ktx)
    if (r.ok) expect(r.quelle).toBe('lokal')
  })
})

describe('datei_loeschen', () => {
  it('loescht eine Datei in der Wurzel', async () => {
    writeFileSync(join(wurzel, 'weg.ts'), 'x')
    const r = await loeschen.ausfuehren({ pfad: 'weg.ts' }, ktx)
    expect(r.ok).toBe(true)
    expect(existsSync(join(wurzel, 'weg.ts'))).toBe(false)
  })

  it('loescht nichts ausserhalb der Wurzel', async () => {
    const r = await loeschen.ausfuehren({ pfad: join(heim, 'geheim', 'ziel.txt') }, ktx)
    expect(r.ok).toBe(false)
    expect(existsSync(join(heim, 'geheim', 'ziel.txt'))).toBe(true)
  })

  it('loescht kein Verzeichnis — dafuer gibt es die Shell mit ihrer Grenze', async () => {
    mkdirSync(join(wurzel, 'ordner'), { recursive: true })
    const r = await loeschen.ausfuehren({ pfad: 'ordner' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Verzeichnis')
    expect(existsSync(join(wurzel, 'ordner'))).toBe(true)
  })

  it('nennt eine fehlende Datei statt zu schweigen', async () => {
    const r = await loeschen.ausfuehren({ pfad: 'gibtsnicht.ts' }, ktx)
    expect(r.ok).toBe(false)
  })
})
