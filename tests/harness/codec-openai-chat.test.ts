import { describe, it, expect } from 'vitest'
import { openAiChatCodec } from '../../src/main/harness/codec-openai-chat'
import { CodecKannNicht } from '../../src/main/harness/codec'
import type { Faehigkeiten } from '../../src/main/model/entry'

const KANN: Faehigkeiten = {
  codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 128000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}
const KANN_KEINE_BILDER: Faehigkeiten = { ...KANN, bilder: false }
const OHNE_PARALLEL: Faehigkeiten = { ...KANN, paralleleAufrufe: false }

const STUMMEL = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]

describe('openAiChatCodec.toWire', () => {
  it('setzt parallel_tool_calls nur, wenn die Faehigkeitszeile es hergibt', () => {
    const mit = openAiChatCodec.toWire([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'a' }] }], STUMMEL, KANN) as Record<string, unknown>
    const ohne = openAiChatCodec.toWire([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'a' }] }], STUMMEL, OHNE_PARALLEL) as Record<string, unknown>
    expect(mit.parallel_tool_calls).toBe(true)
    expect('parallel_tool_calls' in ohne).toBe(false)
  })

  it('uebersetzt ein Bild in eine data-URL', () => {
    const w = openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(w.messages[0].content[0]).toEqual({
      type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' },
    })
  })

  it('meldet Unvermoegen ausdruecklich, statt den Block wegzulassen', () => {
    expect(() => openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN_KEINE_BILDER,
    )).toThrow(CodecKannNicht)
  })

  it('nennt in der Meldung den Blocktyp und die Quelle der Faehigkeitszeile', () => {
    expect(() => openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN_KEINE_BILDER,
    )).toThrow(/bilder: false.*vermutet/s)
  })

  it('schreibt die Stummelliste als Werkzeuge in die Drahtform', () => {
    const w = openAiChatCodec.toWire([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'a' }] }], STUMMEL, KANN) as {
      tools: Array<{ function: { name: string; description: string } }>
    }
    expect(w.tools[0].function).toMatchObject({ name: 'datei_lesen', description: 'Liest eine Datei.' })
  })

  it('markiert einen Denken-Block mit Vorspann, wenn das Modell keine Denkbloecke fuehrt', () => {
    const w = openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'denken', text: 'Innere Ueberlegung' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    const inhaltstext = (w.messages[0].content[0] as Record<string, string>).text
    expect(inhaltstext).toContain('[Denken-Block ohne Unterstuetzung:')
    expect(inhaltstext).toContain('Innere Ueberlegung')
  })

  it('wirft bei Blocktyp im default-Fall (z.B. verschachtelte Werkzeugergebnisse)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nestedBlock: any = { art: 'werkzeug-aufruf', id: 'c2', name: 'nested', eingabe: {} }
    expect(() => openAiChatCodec.toWire(
      [{ rolle: 'modell', bloecke: [{
        art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: false,
        inhalt: [nestedBlock],
      }] }],
      [], KANN,
    )).toThrow(/werkzeug-aufruf/)
  })
})

describe('openAiChatCodec.fromWire', () => {
  it('normalisiert finish_reason length als laenge und behaelt das Rohe', () => {
    const a = openAiChatCodec.fromWire({
      choices: [{ message: { content: 'abc' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    })
    expect(a.stopGrund).toEqual({ normalisiert: 'laenge', roh: 'length' })
    expect(a.usage.eingabeToken).toBe(10)
    expect(a.usage.roh).toEqual({ prompt_tokens: 10, completion_tokens: 3 })
  })

  it('macht aus tool_calls Werkzeug-Aufrufbloecke', () => {
    const a = openAiChatCodec.fromWire({
      choices: [{ message: { content: null, tool_calls: [
        { id: 'c1', function: { name: 'datei_lesen', arguments: '{"pfad":"a.ts"}' } },
      ] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })
    expect(a.bloecke).toEqual([
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
    ])
    expect(a.stopGrund.normalisiert).toBe('werkzeug')
  })

  it('wirft, wenn choices fehlt oder leer ist (kaputte Antwort)', () => {
    expect(() => openAiChatCodec.fromWire({ usage: { prompt_tokens: 1, completion_tokens: 1 } })).toThrow(/choices/)
    expect(() => openAiChatCodec.fromWire({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } })).toThrow(/choices/)
  })
})
