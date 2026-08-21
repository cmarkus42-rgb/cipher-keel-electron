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
      return { type: 'text', text: b.text }
    case 'denken': {
      // A thinking block is text. A model without thinking capability *can* see a text — rejection
      // would block continuation of a run from Model A to Model B, a case we want. Instead: mark
      // the block visibly as translated, not silently.
      if (!f.denkbloecke) {
        const text = `[Denken-Block ohne Unterstuetzung: Dieses Modell fuehrt keine Denkbloecke. Inhalt wird als normaler Text uebersetzt.]\n\n${b.text}`
        return { type: 'text', text }
      }
      return { type: 'text', text: b.text }
    }
    case 'bild':
      if (!f.bilder) throw new CodecKannNicht('bild', 'bilder', f)
      return { type: 'image_url', image_url: { url: `data:${b.medientyp};base64,${b.daten}` } }
    case 'dokument':
      if (!f.dokumente) throw new CodecKannNicht('dokument', 'dokumente', f)
      return { type: 'file', file: { filename: b.name, file_data: `data:${b.medientyp};base64,${b.daten}` } }
    default: {
      const blockArt = (b as Record<string, unknown>).art ?? 'unbekannt'
      throw new Error(
        `Block-Typ '${blockArt}' kann in inhaltsteil() nicht vorkommen (keine Werkzeug-Aufrufe oder -Ergebnisse hier).`,
      )
    }
  }
}

/**
 * Der `content`-Wert fuer eine Nachricht — Zeichenkette, wo das verlustfrei geht, sonst Array.
 *
 * Ollamas /v1-Schicht baut aus jedem Inhaltsteil eine eigene interne Nachricht. Ob Rolle `tool`
 * mit Array-Content ueberhaupt durchgeht, ist unbelegt (Messpunkt M2). Ein einzelner Textblock
 * traegt in der Zeichenketten-Form dieselbe Information und ist die Form, die jeder /v1-Server
 * sicher kann; alles andere bleibt Array, weil das Zusammenlegen mehrerer Bloecke einen Trenner
 * erfinden wuerde, den niemand gemessen hat.
 *
 * Bewusst am kanonischen Blocktyp `text` aufgehaengt, nicht am erzeugten Teil: ein `denken`-Block
 * ohne Modellunterstuetzung wird zu einem Textteil mit Vorspann, behaelt aber die Array-Form —
 * dieser Uebersetzungspfad ist in `codec-openai-chat.test.ts` auf die Teil-Form festgelegt, und
 * er ist nicht der Pfad, den Fehler #14181 oder M2 betreffen.
 */
function inhaltswert(bloecke: Block[], f: Faehigkeiten): unknown {
  if (bloecke.length === 1 && bloecke[0].art === 'text') return bloecke[0].text
  return bloecke.map(b => inhaltsteil(b, f))
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
          content: inhaltswert(e.inhalt, f),
        })
      }
      const aufrufe = n.bloecke.filter(b => b.art === 'werkzeug-aufruf')
      const rest = n.bloecke.filter(b => b.art !== 'werkzeug-ergebnis' && b.art !== 'werkzeug-aufruf')
      if (rest.length > 0 || aufrufe.length > 0) {
        const m: Record<string, unknown> = {
          role: n.rolle === 'nutzer' ? 'user' : 'assistant',
        }
        // Feld weglassen statt leer schreiben. Ollama-Fehler #14181: `content: []` neben
        // `tool_calls` reicht die /v1-Schicht ungefiltert an den Renderer, der einen leeren Wert
        // anders behandelt als ein fehlendes Feld — qwen3-coder faellt danach in Folge-Zuegen aus
        // dem strukturierten Werkzeugmodus in Text-Markup (`<function=...>`).
        if (rest.length > 0) m.content = inhaltswert(rest, f)
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
    // Nur wenn die Faehigkeitszeile den Block traegt. Ein Eintrag ohne ihn muss byteweise
    // denselben Koerper erzeugen wie vor dieser Aenderung — sonst wuerden bestehende Eintraege
    // stillschweigend anders laufen als bisher.
    //
    // Umgekehrt gilt: ist der Block da, gehen alle vier Zahlen hinaus, auch die Nullen. Ollamas
    // /v1 setzt ein weggelassenes `temperature` oder `top_p` zwangsweise auf 1.0 (openai.go
    // L663/L681) — ein Feld wegzulassen heisst hier also nicht „Serverwert behalten", sondern
    // „mit 1.0 ueberschreiben". Ein `if (wert)` statt der Existenzpruefung wuerde genau das
    // ausloesen, sobald jemand presencePenalty auf 0 stellt.
    const s = f.sampler
    if (s) {
      körper.temperature = s.temperature
      körper.top_p = s.topP
      körper.presence_penalty = s.presencePenalty
      körper.max_tokens = s.maxTokens
      if (s.reasoningEffort !== undefined) körper.reasoning_effort = s.reasoningEffort
    }
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
    if (!a.choices || a.choices.length === 0) {
      const snippet = JSON.stringify(antwort).substring(0, 200)
      throw new Error(
        `fromWire: choices fehlt oder ist leer — kaputte Antwort vom Modell. ` +
        `Erhalten: ${snippet}`,
      )
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
