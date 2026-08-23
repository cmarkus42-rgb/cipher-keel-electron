import { describe, it, expect } from 'vitest'
import { projiziere } from '../../src/main/harness/projektion'
import type { Ereignis } from '../../src/main/harness/ereignisse'

let n = 0
const ev = (art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis =>
  ({ laufId: 'l1', seq: ++n, ts: '2026-08-23T10:00:00.000Z', art, nutzlast })

describe('auftrag.folgend in der Projektion', () => {
  it('wird zur eigenen Nutzer-Nachricht, wenn die letzte vom Modell kam', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('model.answered', { bloecke: [{ art: 'text', text: 'fertig' }] }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    expect(v.map(m => m.rolle)).toEqual(['nutzer', 'modell', 'nutzer'])
    expect(JSON.stringify(v[2].bloecke)).toContain('Zweiter')
  })

  /**
   * Die Falle. Ein mitten im Zug abgebrochener Lauf endet mit einer NUTZER-Nachricht (den
   * Werkzeugergebnissen). Ein Folgeauftrag als zweite Nutzer-Nachricht dahinter ist genau der
   * Fehler, der diesem Repo schon einen Abnahmelauf gekostet hat:
   * "messages.4: `tool_use` ids were found without `tool_result` blocks immediately after".
   */
  it('verschmilzt mit der letzten Nutzer-Nachricht, statt eine zweite zu oeffnen', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('model.answered', { bloecke: [{ art: 'werkzeug-aufruf', aufrufId: 'a1' }] }),
      ev('tool.intent', { aufrufId: 'a1' }),
      ev('tool.completed', { aufrufId: 'a1', inhalt: [{ art: 'text', text: 'ok' }] }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    const rollen = v.map(m => m.rolle)
    // Nirgends zwei 'nutzer' hintereinander.
    for (let i = 1; i < rollen.length; i++) {
      expect(rollen[i] === 'nutzer' && rollen[i - 1] === 'nutzer').toBe(false)
    }
    // Und der Auftrag ist trotzdem da — hinter den Werkzeugergebnissen, nicht davor.
    const letzte = v[v.length - 1]
    expect(letzte.rolle).toBe('nutzer')
    const texte = JSON.stringify(letzte.bloecke)
    expect(texte).toContain('Zweiter')
    expect(texte.indexOf('ok')).toBeLessThan(texte.indexOf('Zweiter'))
  })

  it('laesst run.started unangetastet — der erste Auftrag bleibt der erste', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('model.answered', { bloecke: [] }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    expect(JSON.stringify(v[0].bloecke)).toContain('Erster')
  })

  /**
   * Der schaerfere Fall zur selben Regel: hier gibt es kein `model.answered` dazwischen, also ist
   * die letzte Nachricht vor `auftrag.folgend` bereits `run.started` selbst — der Verschmelzungs-
   * zweig greift auf der allerersten Nachricht. Der obige Test bliebe hier gruen, egal ob
   * verschmolzen oder eine zweite Nachricht aufgemacht wird: `v[0]` enthaelt 'Erster' so oder so.
   * Dieser Test unterscheidet das: nur eine Nachricht, `run.started`s eigener Block unveraendert an
   * erster Stelle, und der Folgeauftrag als weiterer Block dahinter.
   */
  it('verschmilzt auch mit run.started selbst, wenn kein Modellzug dazwischen liegt', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    expect(v).toHaveLength(1)
    expect(v[0].rolle).toBe('nutzer')
    expect(v[0].bloecke[0]).toEqual({ art: 'text', text: 'Erster' })
    expect(JSON.stringify(v[0].bloecke)).toContain('Zweiter')
  })
})
