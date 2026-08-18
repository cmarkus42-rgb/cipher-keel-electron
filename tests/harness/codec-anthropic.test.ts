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

  it('wirft auf Deutsch mit begrenztem Ausschnitt, wenn content fehlt', () => {
    expect(() => anthropicCodec.fromWire({
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })).toThrow(/fromWire.*content.*Erhalten/)
  })

  it('begrenzt die Fehlermeldung auf 200 Zeichen Ausschnitt, wenn content fehlt', () => {
    // Build a response with a very long field so the unbounded message would run into the
    // thousands of characters — only then does the 500-char assertion actually discriminate
    // between a bounded and an unbounded snippet.
    const longField = 'x'.repeat(5000)
    const malformed = { [longField]: 'value', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }
    let thrownMsg = ''
    try {
      anthropicCodec.fromWire(malformed)
    } catch (err) {
      thrownMsg = (err as Error).message
    }
    // The message must be substantially shorter than the malformed input
    expect(thrownMsg.length).toBeLessThan(500)
    // But long enough to include the fixed preamble and still have snippet
    expect(thrownMsg.length).toBeGreaterThan(100)
  })

  it('wirft auf Deutsch mit begrenztem Ausschnitt, wenn content kein Array ist', () => {
    expect(() => anthropicCodec.fromWire({
      content: 'string statt array', stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    })).toThrow(/fromWire.*Array.*Erhalten/)
  })

  it('begrenzt die Fehlermeldung auf 200 Zeichen Ausschnitt, wenn content kein Array ist', () => {
    // Build a response with content as a very long string so the unbounded message would run
    // into the thousands of characters — only then does the 500-char assertion actually
    // discriminate between a bounded and an unbounded snippet.
    const longContent = 'y'.repeat(5000)
    const malformed = { content: longContent, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }
    let thrownMsg = ''
    try {
      anthropicCodec.fromWire(malformed)
    } catch (err) {
      thrownMsg = (err as Error).message
    }
    // The message must be substantially shorter than the malformed input
    expect(thrownMsg.length).toBeLessThan(500)
    // But long enough to include the fixed preamble and still have snippet
    expect(thrownMsg.length).toBeGreaterThan(100)
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
