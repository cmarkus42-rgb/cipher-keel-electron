import { describe, it, expect } from 'vitest'
import { projiziere } from '../../src/main/harness/projektion'
import type { Ereignis } from '../../src/main/harness/ereignisse'

function ev(seq: number, art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis {
  return { laufId: 'l', seq, ts: '2026-08-18T00:00:00.000Z', art, nutzlast }
}

describe('projiziere', () => {
  it('macht aus run.started die erste Nutzernachricht', () => {
    const v = projiziere([ev(1, 'run.started', { auftragstext: 'finde die Warnregeln' })])
    expect(v).toEqual([
      { rolle: 'nutzer', bloecke: [{ art: 'text', text: 'finde die Warnregeln' }] },
    ])
  })

  it('haengt Anhaenge als eigene Bloecke an die erste Nachricht', () => {
    const v = projiziere([ev(1, 'run.started', {
      auftragstext: 'was ist das',
      anhangBloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }],
    })])
    expect(v[0].bloecke).toEqual([
      { art: 'text', text: 'was ist das' },
      { art: 'bild', medientyp: 'image/png', daten: 'AAA' },
    ])
  })

  it('macht aus model.answered eine Modellnachricht', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [{ art: 'text', text: 'b' }] }),
    ])
    expect(v[1]).toEqual({ rolle: 'modell', bloecke: [{ art: 'text', text: 'b' }] })
  })

  it('fasst alle Werkzeugergebnisse eines Zuges zu einer Nutzernachricht zusammen', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
        { art: 'werkzeug-aufruf', id: 'c2', name: 'datei_lesen', eingabe: {} },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' }),
      ev(4, 'tool.completed', { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'inhalt-1' }] }),
      ev(5, 'tool.intent', { aufrufId: 'c2', name: 'datei_lesen' }),
      ev(6, 'tool.failed', { aufrufId: 'c2', meldung: 'Pfad ist geschuetzt' }),
    ])
    expect(v[2]).toEqual({
      rolle: 'nutzer',
      bloecke: [
        { art: 'werkzeug-ergebnis', aufrufId: 'c1', inhalt: [{ art: 'text', text: 'inhalt-1' }], fehler: false },
        { art: 'werkzeug-ergebnis', aufrufId: 'c2', inhalt: [{ art: 'text', text: 'Pfad ist geschuetzt' }], fehler: true },
      ],
    })
  })

  it('gibt einem offenen Intent ein Ergebnis mit unbekannter Ausfuehrung', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' }),
    ])
    const block = v[2].bloecke[0]
    expect(block).toMatchObject({ art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: true })
    expect(JSON.stringify(block)).toContain('Ausfuehrung unbekannt')
  })

  it('haengt ein nachgeladenes Schema an den Verlauf, nie an den Praefix', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'tool.schema_loaded', { name: 'datei_lesen', schema: { typ: 'objekt' } }),
    ])
    expect(v[1].rolle).toBe('nutzer')
    expect(JSON.stringify(v[1].bloecke)).toContain('datei_lesen')
  })

  it('markiert ein Ergebnis ohne vorherigen Intent mit deutschem Hinweis', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'tool.completed', { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'ergebnis' }] }),
    ])
    const block = v[1].bloecke[0]
    expect(block).toMatchObject({ art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: false })
    const inhaltStr = JSON.stringify(block)
    expect(inhaltStr).toContain('Intent')
  })

  it('markiert ein widerspruchliches Ergebnis nach Zwangsabschluss mit deutschem Hinweis', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' }),
      ev(4, 'model.answered', { bloecke: [{ art: 'text', text: 'modell antwortet' }] }),
      ev(5, 'tool.completed', { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'verspätetes ergebnis' }] }),
    ])
    const block = v[4].bloecke[0]
    expect(block).toMatchObject({ art: 'werkzeug-ergebnis', aufrufId: 'c1' })
    const inhaltStr = JSON.stringify(block)
    expect(inhaltStr).toContain('Ausfuehrung unbekannt')
  })

  it('markiert tool.failed-Ergebnis ohne Intent mit Hinweis', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'tool.failed', { aufrufId: 'c1', meldung: 'Fehler ohne Intent' }),
    ])
    const block = v[1].bloecke[0]
    expect(block).toMatchObject({ art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: true })
    const inhaltStr = JSON.stringify(block)
    expect(inhaltStr).toContain('Intent')
  })

  it('unterscheidet zwischen Zwangsabschluss und echter Doppelantwort im Hinweis', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' }),
      ev(4, 'tool.completed', { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'erstes ergebnis' }] }),
      ev(5, 'tool.completed', { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'zweites ergebnis' }] }),
    ])
    const secondBlock = v[2].bloecke[1]
    expect(secondBlock).toMatchObject({ art: 'werkzeug-ergebnis', aufrufId: 'c1' })
    const inhaltStr = JSON.stringify(secondBlock)
    expect(inhaltStr).not.toContain('Ausfuehrung unbekannt')
    expect(inhaltStr).toContain('bereits')
  })
})
