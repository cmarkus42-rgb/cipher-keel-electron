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

  // Ollamas /v1 setzt temperature und top_p zwangsweise auf 1.0, wenn der Client sie weglaesst
  // (openai.go L663/L681). Deshalb traegt die Faehigkeitszeile sie optional — und deshalb ist der
  // erste dieser beiden Tests der wichtigere: er haelt fest, dass ein Eintrag ohne sampler-Block
  // exakt denselben Koerper erzeugt wie vor dieser Aenderung.
  describe('sampler-Block', () => {
    const MIT_SAMPLER: Faehigkeiten = {
      ...KANN,
      sampler: {
        temperature: 1.0, topP: 0.95, presencePenalty: 0.0, maxTokens: 8192,
        reasoningEffort: 'medium',
      },
    }
    const EINE_NACHRICHT = [{ rolle: 'nutzer' as const, bloecke: [{ art: 'text' as const, text: 'a' }] }]

    it('laesst den Koerper ohne sampler-Block unveraendert', () => {
      const w = openAiChatCodec.toWire(EINE_NACHRICHT, STUMMEL, KANN)
      expect(w).toEqual({
        messages: [{ role: 'user', content: 'a' }],
        stream: false,
        tools: [{ type: 'function', function: { name: 'datei_lesen', description: 'Liest eine Datei.' } }],
        parallel_tool_calls: true,
      })
    })

    it('schreibt mit sampler-Block die Draht-Namen, nicht die keel-Namen', () => {
      const w = openAiChatCodec.toWire(EINE_NACHRICHT, STUMMEL, MIT_SAMPLER) as Record<string, unknown>
      expect(w.temperature).toBe(1.0)
      expect(w.top_p).toBe(0.95)
      expect(w.presence_penalty).toBe(0.0)
      expect(w.max_tokens).toBe(8192)
      expect(w.reasoning_effort).toBe('medium')
      expect('topP' in w).toBe(false)
      expect('maxTokens' in w).toBe(false)
      expect('presencePenalty' in w).toBe(false)
      expect('reasoningEffort' in w).toBe(false)
    })

    it('laesst reasoning_effort weg, wenn die Zeile keine Stufe nennt', () => {
      const ohneStufe: Faehigkeiten = {
        ...KANN,
        sampler: { temperature: 0.7, topP: 0.8, presencePenalty: 1.5, maxTokens: 2048 },
      }
      const w = openAiChatCodec.toWire(EINE_NACHRICHT, STUMMEL, ohneStufe) as Record<string, unknown>
      expect('reasoning_effort' in w).toBe(false)
      expect(w.presence_penalty).toBe(1.5)
    })

    it('schreibt eine 0 als 0, nicht als weggelassenes Feld', () => {
      // presencePenalty 0.0 ist der Vorgabewert des Thinking-Satzes und muss trotzdem auf den
      // Draht: ein `if (wert)`-Test wuerde ihn wegwerfen und Ollamas eigenen Default gewinnen
      // lassen — derselbe stille Fehlermodus wie beim weggelassenen top_p.
      const w = openAiChatCodec.toWire(EINE_NACHRICHT, STUMMEL, MIT_SAMPLER) as Record<string, unknown>
      expect('presence_penalty' in w).toBe(true)
      expect(w.presence_penalty).toBe(0)
    })
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
