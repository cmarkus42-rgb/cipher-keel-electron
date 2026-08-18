/**
 * codec-openai-chat — the dialect that reaches most of the field.
 *
 * OpenAI, DeepSeek, OpenRouter, Together, Fireworks, Groq, Mistral, vLLM — and Ollama's own
 * /v1 surface, which is how a local model is reachable in this stretch without the
 * ollama-native codec existing yet.
 *
 * `parallel_tool_calls` is written only when the capability row allows it: sent to a model
 * without support it answers HTTP 400 and takes the whole tool subsystem down (M8 section 5).
 */

import type { Faehigkeiten } from '../model/entry'
import type { Block, ModelAntwort, Nachricht } from './form'
import { CodecKannNicht, type Codec, type WerkzeugStummel } from './codec'

function inhaltsteil(b: Block, f: Faehigkeiten): Record<string, unknown> {
  switch (b.art) {
    case 'text':
    case 'denken':
      return { type: 'text', text: b.text }
    case 'bild':
      if (!f.bilder) throw new CodecKannNicht('bild', 'bilder', f)
      return { type: 'image_url', image_url: { url: `data:${b.medientyp};base64,${b.daten}` } }
    case 'dokument':
      if (!f.dokumente) throw new CodecKannNicht('dokument', 'dokumente', f)
      return { type: 'file', file: { filename: b.name, file_data: `data:${b.medientyp};base64,${b.daten}` } }
    default:
      return { type: 'text', text: '' }
  }
}

function stopGrund(roh: string): ModelAntwort['stopGrund'] {
  const normalisiert =
    roh === 'stop' ? 'ende' :
    roh === 'length' ? 'laenge' :
    roh === 'tool_calls' ? 'werkzeug' : 'anderes'
  return { normalisiert, roh }
}

export const openAiChatCodec: Codec = {
  name: 'openai-chat',

  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown {
    const messages: Array<Record<string, unknown>> = []
    for (const n of nachrichten) {
      const werkzeugErgebnisse = n.bloecke.filter(b => b.art === 'werkzeug-ergebnis')
      for (const w of werkzeugErgebnisse) {
        const e = w as Extract<Block, { art: 'werkzeug-ergebnis' }>
        messages.push({
          role: 'tool', tool_call_id: e.aufrufId,
          content: e.inhalt.map(b => inhaltsteil(b, f)),
        })
      }
      const aufrufe = n.bloecke.filter(b => b.art === 'werkzeug-aufruf')
      const rest = n.bloecke.filter(b => b.art !== 'werkzeug-ergebnis' && b.art !== 'werkzeug-aufruf')
      if (rest.length > 0 || aufrufe.length > 0) {
        const m: Record<string, unknown> = {
          role: n.rolle === 'nutzer' ? 'user' : 'assistant',
          content: rest.map(b => inhaltsteil(b, f)),
        }
        if (aufrufe.length > 0) {
          m.tool_calls = aufrufe.map(b => {
            const a = b as Extract<Block, { art: 'werkzeug-aufruf' }>
            return { id: a.id, type: 'function', function: { name: a.name, arguments: JSON.stringify(a.eingabe) } }
          })
        }
        messages.push(m)
      }
    }

    const körper: Record<string, unknown> = { messages, stream: false }
    if (werkzeuge.length > 0) {
      körper.tools = werkzeuge.map(w => ({
        type: 'function',
        function: {
          name: w.name,
          description: w.beschreibung,
          ...(w.schema ? { parameters: w.schema } : {}),
        },
      }))
      if (f.paralleleAufrufe) körper.parallel_tool_calls = true
    }
    return körper
  },

  fromWire(antwort: unknown): ModelAntwort {
    const a = antwort as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{
        id: string; function: { name: string; arguments: string }
      }> }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const wahl = a.choices?.[0]
    const bloecke: Block[] = []
    const text = wahl?.message?.content
    if (text) bloecke.push({ art: 'text', text })
    for (const t of wahl?.message?.tool_calls ?? []) {
      let eingabe: Record<string, unknown> = {}
      try {
        eingabe = JSON.parse(t.function.arguments) as Record<string, unknown>
      } catch {
        // Kept as a named failure rather than guessed: a wrong argument object would be run.
        eingabe = { __unlesbar: t.function.arguments }
      }
      bloecke.push({ art: 'werkzeug-aufruf', id: t.id, name: t.function.name, eingabe })
    }
    return {
      bloecke,
      stopGrund: stopGrund(wahl?.finish_reason ?? ''),
      usage: {
        eingabeToken: a.usage?.prompt_tokens ?? 0,
        ausgabeToken: a.usage?.completion_tokens ?? 0,
        roh: a.usage ?? null,
      },
    }
  },
}
