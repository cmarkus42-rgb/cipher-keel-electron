import { describe, it, expect } from 'vitest'
import { codecFuer } from '../../src/main/harness/codec'
import { projiziere } from '../../src/main/harness/projektion'
import type { Ereignis } from '../../src/main/harness/ereignisse'
import type { Faehigkeiten } from '../../src/main/model/entry'

/**
 * M8 section 8, first row: the same recorded run through *all* codecs, and what is compared is
 * the *event sequence*, not the wire form. Two providers, the same events — that is the
 * checkable version of "one code path, no regime".
 */
const ABLAUF: Ereignis[] = [
  { laufId: 'l', seq: 1, ts: 't', art: 'run.started', nutzlast: { auftragstext: 'a' } },
  { laufId: 'l', seq: 2, ts: 't', art: 'model.answered', nutzlast: { bloecke: [
    { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
  ] } },
  { laufId: 'l', seq: 3, ts: 't', art: 'tool.intent', nutzlast: { aufrufId: 'c1', name: 'datei_lesen' } },
  { laufId: 'l', seq: 4, ts: 't', art: 'tool.completed', nutzlast: { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'inhalt' }] } },
  { laufId: 'l', seq: 5, ts: 't', art: 'model.answered', nutzlast: { bloecke: [{ art: 'text', text: 'fertig' }] } },
]

const BASIS: Faehigkeiten = {
  codec: 'anthropic', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: true,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 100000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}

describe('Waechter: ein Codepfad, kein Regime', () => {
  it('beide Codecs uebersetzen denselben Ablauf ohne zu werfen', () => {
    const verlauf = projiziere(ABLAUF)
    const stummel = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]
    for (const name of ['anthropic', 'openai-chat'] as const) {
      expect(() => codecFuer(name).toWire(verlauf, stummel, { ...BASIS, codec: name })).not.toThrow()
    }
  })

  it('die Ereignisfolge ist von der Drahtform unabhaengig', () => {
    // The projection sees only the canonical form; nothing codec-specific may leak into it.
    const verlauf = projiziere(ABLAUF)
    expect(verlauf.map(n => n.rolle)).toEqual(['nutzer', 'modell', 'nutzer', 'modell'])
    expect(JSON.stringify(verlauf)).not.toContain('tool_use')
    expect(JSON.stringify(verlauf)).not.toContain('tool_calls')
  })
})
