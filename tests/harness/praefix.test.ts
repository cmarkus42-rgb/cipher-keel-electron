import { describe, it, expect } from 'vitest'
import {
  baueStabilenTeil, baueFortschritt,
} from '../../src/main/harness/praefix'

const TEILE = {
  body: 'Du bist ein Pruefer.', capabilities: 'CAP-1', persona: 'Mimir',
  globaleRegeln: 'Belege schlagen Behauptungen.', auftragstext: 'finde die Warnregeln',
  faehigkeiten: [],
}
const STUMMEL = [
  { name: 'inhalt_suchen', beschreibung: 'Sucht per Regex.' },
  { name: 'datei_lesen', beschreibung: 'Liest eine Datei.' },
]

const FAEHIGKEITEN = [
  {
    name: 'web-recherche', beschreibung: 'Sucht im Netz und liest Seiten.',
    rumpf: 'Ein sehr langer Rumpf, der nie in den Praefix gehoert.',
    pfad: '.claude/skills/web-recherche',
  },
  {
    name: 'gate-urteil-guide', beschreibung: 'Faellt das Urteil an einem Gate.',
    rumpf: 'Noch ein Rumpf.', pfad: '.claude/capabilities/gate-urteil-guide',
  },
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

describe('baueStabilenTeil: der Abschnitt Faehigkeiten', () => {
  it('nennt je Faehigkeit Namen und Beschreibung in einer Zeile', () => {
    const p = baueStabilenTeil({ ...TEILE, faehigkeiten: FAEHIGKEITEN }, STUMMEL)
    expect(p).toContain('## Faehigkeiten')
    expect(p).toContain('- `web-recherche` — Sucht im Netz und liest Seiten.')
    expect(p).toContain('- `gate-urteil-guide` — Faellt das Urteil an einem Gate.')
  })

  it('traegt den Rumpf nicht — der gehoert in die Historie, nicht in den Praefix', () => {
    const p = baueStabilenTeil({ ...TEILE, faehigkeiten: FAEHIGKEITEN }, STUMMEL)
    expect(p).not.toContain('nie in den Praefix gehoert')
    expect(p).not.toContain('Noch ein Rumpf.')
  })

  it('sortiert nach Namen, damit die Lesereihenfolge kein Byte verschiebt', () => {
    const a = baueStabilenTeil({ ...TEILE, faehigkeiten: FAEHIGKEITEN }, STUMMEL)
    const b = baueStabilenTeil({ ...TEILE, faehigkeiten: [...FAEHIGKEITEN].reverse() }, STUMMEL)
    expect(a).toBe(b)
    // Und die Sortierung ist wirklich alphabetisch, nicht die zufaellig passende Eingabefolge.
    expect(a.indexOf('gate-urteil-guide')).toBeLessThan(a.indexOf('web-recherche'))
  })

  it('ist ueber zwei Aufrufe zeichengleich', () => {
    const teile = { ...TEILE, faehigkeiten: FAEHIGKEITEN }
    expect(baueStabilenTeil(teile, STUMMEL)).toBe(baueStabilenTeil(teile, STUMMEL))
  })

  it('laesst den Abschnitt bei null Faehigkeiten ganz weg — kein leeres Ueberschriften-Byte', () => {
    const p = baueStabilenTeil({ ...TEILE, faehigkeiten: [] }, STUMMEL)
    expect(p).not.toContain('Faehigkeiten')
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
