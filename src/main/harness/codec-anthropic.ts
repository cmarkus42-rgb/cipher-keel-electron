/**
 * codec-anthropic — the vendor with its own shape, and the reference for the canonical form.
 *
 * Thinking blocks go back verbatim including their signature. A form without that field loses
 * continuation exactly where thinking was expensive — and with tools, continuing after a
 * thinking block is the normal case, not the exception.
 */

import type { Faehigkeiten } from '../model/entry'
import type { Block, ModelAntwort, Nachricht } from './form'
import { CodecKannNicht, type Codec, type WerkzeugStummel } from './codec'

function teil(b: Block, f: Faehigkeiten): Record<string, unknown> {
  switch (b.art) {
    case 'text':
      return { type: 'text', text: b.text }
    case 'denken':
      // If the capability row says this model cannot handle thinking blocks, translate them
      // as text with a German preamble. Do not throw: a thinking trace is still text and
      // remains legible, and hard rejection would break continuation flows where model A's
      // output becomes model B's input. This is the same reason as in Task 3 for OpenAI.
      if (!f.denkbloecke) {
        return {
          type: 'text',
          text: `[Denkspur aus der vorigen Antwort — dieses Modell fuehrt keine Denkbloecke, daher als Text:]\n${b.text}`,
        }
      }
      return { type: 'thinking', thinking: b.text, ...(b.signatur ? { signature: b.signatur } : {}) }
    case 'bild':
      if (!f.bilder) throw new CodecKannNicht('bild', 'bilder', f)
      return { type: 'image', source: { type: 'base64', media_type: b.medientyp, data: b.daten } }
    case 'dokument':
      if (!f.dokumente) throw new CodecKannNicht('dokument', 'dokumente', f)
      return { type: 'document', source: { type: 'base64', media_type: b.medientyp, data: b.daten }, title: b.name }
    case 'werkzeug-aufruf':
      return { type: 'tool_use', id: b.id, name: b.name, input: b.eingabe }
    case 'werkzeug-ergebnis':
      return {
        type: 'tool_result', tool_use_id: b.aufrufId, is_error: b.fehler,
        content: b.inhalt.map(x => teil(x, f)),
      }
  }
}

function stopGrund(roh: string): ModelAntwort['stopGrund'] {
  const normalisiert =
    roh === 'end_turn' || roh === 'stop_sequence' ? 'ende' :
    roh === 'max_tokens' ? 'laenge' :
    roh === 'tool_use' ? 'werkzeug' : 'anderes'
  return { normalisiert, roh }
}

export const anthropicCodec: Codec = {
  name: 'anthropic',

  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown {
    const körper: Record<string, unknown> = {
      messages: nachrichten.map(n => ({
        role: n.rolle === 'nutzer' ? 'user' : 'assistant',
        content: n.bloecke.map(b => teil(b, f)),
      })),
    }
    if (werkzeuge.length > 0) {
      körper.tools = werkzeuge.map(w => ({
        name: w.name,
        description: w.beschreibung,
        input_schema: w.schema ?? { type: 'object', properties: {} },
      }))
      // Anthropic disables parallel calls via a flag rather than enabling them; only touched
      // when the capability row says the model cannot do them.
      if (!f.paralleleAufrufe) körper.tool_choice = { type: 'auto', disable_parallel_tool_use: true }
    }
    return körper
  },

  fromWire(antwort: unknown): ModelAntwort {
    const a = antwort as {
      content?: Array<Record<string, unknown>>
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    // Validate content: must exist and be an array. An empty array is fine (unlike OpenAI,
    // where an empty choices array is malformed). This asymmetry is intentional: Anthropic
    // and OpenAI have different normal error states, and we should not "harmonize" away the
    // distinction.
    if (!a.content) {
      const snippet = JSON.stringify(antwort).substring(0, 200)
      throw new Error(
        `fromWire: content fehlt oder ist leer — kaputte Antwort vom Modell. Erhalten: ${snippet}…`,
      )
    }
    if (!Array.isArray(a.content)) {
      const snippet = JSON.stringify(antwort).substring(0, 200)
      throw new Error(
        `fromWire: content muss ein Array sein, nicht ${typeof a.content} — kaputte Antwort. ` +
        `Erhalten: ${snippet}…`,
      )
    }

    const bloecke: Block[] = []
    for (const c of a.content) {
      if (c.type === 'text') bloecke.push({ art: 'text', text: String(c.text ?? '') })
      else if (c.type === 'thinking') bloecke.push({
        art: 'denken', text: String(c.thinking ?? ''),
        ...(c.signature ? { signatur: String(c.signature) } : {}),
      })
      else if (c.type === 'tool_use') bloecke.push({
        art: 'werkzeug-aufruf', id: String(c.id), name: String(c.name),
        eingabe: (c.input as Record<string, unknown>) ?? {},
      })
      else {
        // Unknown block type: do not throw, but make it visible. Real Anthropic types like
        // redacted_thinking and web_search_tool_result must be handled in later stretches.
        // For now, translate to text with a note about the type and that it is not yet
        // translatable in this version.
        bloecke.push({
          art: 'text',
          text: `[Unbekannter Block-Typ '${String(c.type)}' von Anthropic — nicht in dieser ` +
            `Ausbaustufe uebersetzbar]`,
        })
      }
    }
    return {
      bloecke,
      stopGrund: stopGrund(a.stop_reason ?? ''),
      usage: {
        eingabeToken: a.usage?.input_tokens ?? 0,
        ausgabeToken: a.usage?.output_tokens ?? 0,
        roh: a.usage ?? null,
      },
    }
  },
}
