import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  WIRKENDE_WERKZEUGE, istWirkend, entscheide, effekteOhneEntscheidung,
} from '../../src/main/harness/tor'
import type { Ereignis } from '../../src/main/harness/ereignisse'

let heim: string
let wurzel: string
let wache: { wurzel: string; heim: string; userDataPfad: string }

beforeAll(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-tor-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  wache = { wurzel, heim, userDataPfad: join(heim, 'userData') }
})
afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe('WIRKENDE_WERKZEUGE', () => {
  it('nennt genau die drei wirkenden Werkzeuge', () => {
    expect([...WIRKENDE_WERKZEUGE].sort()).toEqual(
      ['datei_loeschen', 'datei_schreiben', 'shell_ausfuehren'],
    )
  })
  it('istWirkend sagt bei einem lesenden Werkzeug nein', () => {
    expect(istWirkend('datei_lesen')).toBe(false)
    expect(istWirkend('datei_schreiben')).toBe(true)
  })
})

describe('entscheide — datei_schreiben', () => {
  it('erlaubt einen Pfad in der Wurzel', () => {
    const u = entscheide('datei_schreiben', { pfad: 'src/a.ts', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(true)
  })
  it('lehnt einen Pfad ausserhalb der Wurzel ab, mit Grund', () => {
    const u = entscheide('datei_schreiben', { pfad: '/etc/hosts', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
    expect(u.grund).toContain('ausserhalb der Wurzel')
  })
  it('lehnt eine .env ab, auch in der Wurzel', () => {
    const u = entscheide('datei_schreiben', { pfad: '.env', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
    expect(u.grund).toContain('geschuetzt')
  })
  it('lehnt einen Pfad unter .git ab', () => {
    const u = entscheide('datei_schreiben', { pfad: '.git/HEAD', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
  })
  it('lehnt eine fehlende Pfadangabe ab, statt sie durchzulassen', () => {
    const u = entscheide('datei_schreiben', { inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
    expect(u.grund).toContain('pfad')
  })
})

describe('entscheide — datei_loeschen', () => {
  it('lehnt einen Pfad ausserhalb der Wurzel ab', () => {
    expect(entscheide('datei_loeschen', { pfad: '/etc/hosts' }, wache).erlaubt).toBe(false)
  })
  it('erlaubt einen Pfad in der Wurzel', () => {
    expect(entscheide('datei_loeschen', { pfad: 'weg.ts' }, wache).erlaubt).toBe(true)
  })
})

describe('entscheide — shell_ausfuehren', () => {
  it('erlaubt jedes Kommando: die Grenze setzt der Sandkasten, nicht das Tor', () => {
    const u = entscheide('shell_ausfuehren', { kommando: 'rm -rf /' }, wache)
    expect(u.erlaubt).toBe(true)
  })
  it('nennt den Sandkasten als Grund, damit das Protokoll nicht schweigt', () => {
    const u = entscheide('shell_ausfuehren', { kommando: 'npm test' }, wache)
    expect(u.grund).toContain('Sandkasten')
  })
  it('lehnt ein fehlendes Kommando ab', () => {
    expect(entscheide('shell_ausfuehren', {}, wache).erlaubt).toBe(false)
  })
})

function e(art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis {
  return { laufId: 'l', seq: 0, ts: '2026-08-30T00:00:00Z', art, nutzlast }
}

describe('effekteOhneEntscheidung', () => {
  it('findet ein completed eines wirkenden Werkzeugs ohne vorherige Entscheidung', () => {
    const v = effekteOhneEntscheidung([
      e('tool.intent', { aufrufId: '1', name: 'datei_schreiben' }),
      e('tool.completed', { aufrufId: '1', name: 'datei_schreiben' }),
    ])
    expect(v).toHaveLength(1)
  })
  it('laesst eine vollstaendige Kette durch', () => {
    const v = effekteOhneEntscheidung([
      e('tool.intent', { aufrufId: '1', name: 'datei_schreiben' }),
      e('tool.entschieden', { aufrufId: '1', name: 'datei_schreiben', erlaubt: true, grund: 'ok' }),
      e('tool.completed', { aufrufId: '1', name: 'datei_schreiben' }),
    ])
    expect(v).toEqual([])
  })
  it('verlangt von einem lesenden Werkzeug keine Entscheidung', () => {
    const v = effekteOhneEntscheidung([
      e('tool.intent', { aufrufId: '1', name: 'datei_lesen' }),
      e('tool.completed', { aufrufId: '1', name: 'datei_lesen' }),
    ])
    expect(v).toEqual([])
  })
  it('achtet auf die Reihenfolge — eine Entscheidung danach zaehlt nicht', () => {
    const v = effekteOhneEntscheidung([
      e('tool.completed', { aufrufId: '1', name: 'datei_schreiben' }),
      e('tool.entschieden', { aufrufId: '1', name: 'datei_schreiben', erlaubt: true, grund: 'ok' }),
    ])
    expect(v).toHaveLength(1)
  })
})
