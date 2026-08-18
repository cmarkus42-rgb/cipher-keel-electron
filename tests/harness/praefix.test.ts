import { describe, it, expect } from 'vitest'
import {
  baueStabilenTeil, serialisiereDeterministisch, baueFortschritt,
} from '../../src/main/harness/praefix'

const TEILE = {
  body: 'Du bist ein Pruefer.', capabilities: 'CAP-1', persona: 'Mimir',
  globaleRegeln: 'Belege schlagen Behauptungen.', auftragstext: 'finde die Warnregeln',
}
const STUMMEL = [
  { name: 'inhalt_suchen', beschreibung: 'Sucht per Regex.' },
  { name: 'datei_lesen', beschreibung: 'Liest eine Datei.' },
]

describe('baueStabilenTeil', () => {
  it('haelt die Reihenfolge aus M8 3.5 ein', () => {
    const p = baueStabilenTeil(TEILE, STUMMEL)
    const i = (s: string): number => p.indexOf(s)
    expect(i('Du bist ein Pruefer.')).toBeLessThan(i('CAP-1'))
    expect(i('CAP-1')).toBeLessThan(i('Mimir'))
    expect(i('Mimir')).toBeLessThan(i('Belege schlagen'))
    expect(i('Belege schlagen')).toBeLessThan(i('finde die Warnregeln'))
    expect(i('finde die Warnregeln')).toBeLessThan(i('datei_lesen'))
  })

  it('ist bei gleicher Eingabe zeichengleich', () => {
    expect(baueStabilenTeil(TEILE, STUMMEL)).toBe(baueStabilenTeil(TEILE, STUMMEL))
  })

  it('sortiert die Stummelliste, damit die Aufrufreihenfolge sie nicht verschiebt', () => {
    const a = baueStabilenTeil(TEILE, STUMMEL)
    const b = baueStabilenTeil(TEILE, [...STUMMEL].reverse())
    expect(a).toBe(b)
  })

  it('traegt kein Schema, nur die eine Zeile je Werkzeug', () => {
    const p = baueStabilenTeil(TEILE, [
      { name: 'datei_lesen', beschreibung: 'Liest eine Datei.', schema: { type: 'object' } },
    ])
    expect(p).toContain('datei_lesen')
    expect(p).not.toContain('"type"')
  })

  it('enthaelt keinen Zeitstempel und keine Rundenangabe', () => {
    const p = baueStabilenTeil(TEILE, STUMMEL)
    expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(p).not.toMatch(/Runde\s*\d/)
  })
})

describe('serialisiereDeterministisch', () => {
  it('sortiert Schluessel, damit zwei gleiche Objekte gleich aussehen', () => {
    expect(serialisiereDeterministisch({ b: 1, a: 2 }))
      .toBe(serialisiereDeterministisch({ a: 2, b: 1 }))
  })

  it('sortiert auch geschachtelte Schluessel', () => {
    expect(serialisiereDeterministisch({ x: { d: 1, c: 2 } }))
      .toBe('{"x":{"c":2,"d":1}}')
  })

  it('laesst Array-Reihenfolge unangetastet', () => {
    expect(serialisiereDeterministisch([2, 1])).toBe('[2,1]')
  })
})

describe('baueFortschritt', () => {
  it('ist bei leeren Listen leer, damit ein Lauf ohne Einheiten nichts anhaengt', () => {
    expect(baueFortschritt([], [])).toBe('')
  })

  it('nennt offene und erledigte Einheiten', () => {
    const f = baueFortschritt(['B pruefen'], ['A gelesen'])
    expect(f).toContain('A gelesen')
    expect(f).toContain('B pruefen')
  })
})
