import { describe, it, expect } from 'vitest'
import { oeffneHarnessDb, anhaengen, lesen, laufIds } from '../../src/main/harness/protokoll'

describe('protokoll', () => {
  it('vergibt seq je Lauf aufsteigend ab 1', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'run.started', { modellId: 'x' })
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    anhaengen(db, 'lauf-b', 'run.started', { modellId: 'y' })
    expect(lesen(db, 'lauf-a').map(e => e.seq)).toEqual([1, 2])
    expect(lesen(db, 'lauf-b').map(e => e.seq)).toEqual([1])
  })

  it('gibt die Nutzlast als Objekt zurueck, nicht als JSON-Text', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    expect(lesen(db, 'lauf-a')[0].nutzlast).toEqual({ text: 'hallo' })
  })

  it('lehnt UPDATE auf der Ereignistabelle ab', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    expect(() => db.prepare("UPDATE ereignisse SET art = 'x'").run())
      .toThrow('Ereignisse sind append-only')
  })

  it('lehnt DELETE auf der Ereignistabelle ab', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    expect(() => db.prepare('DELETE FROM ereignisse').run())
      .toThrow('Ereignisse sind append-only')
  })

  it('nennt die Laeufe in der Reihenfolge ihres Beginns', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'run.started', {})
    anhaengen(db, 'lauf-b', 'run.started', {})
    expect(laufIds(db)).toEqual(['lauf-a', 'lauf-b'])
  })
})
