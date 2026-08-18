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
})
