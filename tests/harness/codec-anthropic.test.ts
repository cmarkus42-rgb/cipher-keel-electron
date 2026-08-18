import { describe, it, expect } from 'vitest'
import { anthropicCodec } from '../../src/main/harness/codec-anthropic'
import type { Faehigkeiten } from '../../src/main/model/entry'

const KANN: Faehigkeiten = {
  codec: 'anthropic', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: true,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 200000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}
const STUMMEL = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]

describe('anthropicCodec.toWire', () => {
  it('uebersetzt ein Bild in eine base64-Quelle', () => {
    const w = anthropicCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(w.messages[0].content[0]).toEqual({
      type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
    })
  })

  it('gibt einen Denkblock samt Signatur woertlich zurueck', () => {
    const w = anthropicCodec.toWire(
      [{ rolle: 'modell', bloecke: [{ art: 'denken', text: 'ueberlegung', signatur: 'sig-1' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(w.messages[0].content[0]).toEqual({
      type: 'thinking', thinking: 'ueberlegung', signature: 'sig-1',
    })
  })

  it('uebersetzt einen Denkblock als Text, wenn denkbloecke: false', () => {
    const KANN_KEIN_DENKEN = { ...KANN, denkbloecke: false }
    const w = anthropicCodec.toWire(
      [{ rolle: 'modell', bloecke: [{ art: 'denken', text: 'geheim', signatur: 'sig-1' }] }],
      STUMMEL, KANN_KEIN_DENKEN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    // Denkblock wird als Text mit deutschem Vorspann übersetzt
    expect(w.messages[0].content[0]).toEqual({
      type: 'text', text: expect.stringContaining('Denkspur'),
    })
    expect(w.messages[0].content[0].text).toContain('geheim')
  })
})

describe('anthropicCodec.fromWire', () => {
  it('normalisiert max_tokens als laenge', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'text', text: 'abc' }], stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 3 },
    })
    expect(a.stopGrund).toEqual({ normalisiert: 'laenge', roh: 'max_tokens' })
  })

  it('haelt die Signatur eines Denkblocks fest', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'thinking', thinking: 'x', signature: 'sig-9' }],
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect(a.bloecke[0]).toEqual({ art: 'denken', text: 'x', signatur: 'sig-9' })
  })

  it('macht aus tool_use einen Werkzeug-Aufrufblock', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'tool_use', id: 'c1', name: 'datei_lesen', input: { pfad: 'a.ts' } }],
      stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect(a.bloecke[0]).toEqual({ art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } })
    expect(a.stopGrund.normalisiert).toBe('werkzeug')
  })

  it('wirft, wenn content fehlt', () => {
    expect(() => anthropicCodec.fromWire({
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })).toThrow()
  })

  it('wirft, wenn content kein Array ist', () => {
    expect(() => anthropicCodec.fromWire({
      content: 'string statt array', stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    })).toThrow()
  })

  it('akzeptiert ein leeres content-Array', () => {
    expect(() => anthropicCodec.fromWire({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })).not.toThrow()
    const a = anthropicCodec.fromWire({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect(a.bloecke).toEqual([])
  })

  it('uebersetzt unbekannte Blocktypen zu Text mit Hinweis', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'redacted_thinking', thinking: 'xxx' }],
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect(a.bloecke[0]).toEqual({
      art: 'text',
      text: expect.stringContaining('redacted_thinking'),
    })
  })
})
