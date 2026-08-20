/**
 * The rule the providers enforce, checked against the projection that has to satisfy it.
 *
 * `tests/harness/projektion.test.ts` checks the *shape* the projection produces. That is not the
 * same question as whether the shape is legal, and the difference cost a whole acceptance run:
 * the projection put a deferred schema into its own user message, every projection test agreed
 * that was the intended shape, and Anthropic answered
 *
 *   messages.4: `tool_use` ids were found without `tool_result` blocks immediately after
 *
 * on the first real call — because a `tool_use` and its `tool_result` must be adjacent, and the
 * schema message had wedged itself between them.
 *
 * So these tests assert the provider's contract, not our structure. They run the real codecs over
 * a real projection, and they are written so that moving the schema back into its own message
 * makes them fail.
 */

import { describe, it, expect } from 'vitest'
import { projiziere } from '../../src/main/harness/projektion'
import { anthropicCodec } from '../../src/main/harness/codec-anthropic'
import { openAiChatCodec } from '../../src/main/harness/codec-openai-chat'
import type { Ereignis } from '../../src/main/harness/ereignisse'
import type { Faehigkeiten } from '../../src/main/model/entry'

function ev(seq: number, art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis {
  return { laufId: 'l', seq, ts: '2026-08-18T00:00:00.000Z', art, nutzlast }
}

const kann: Faehigkeiten = {
  codec: 'anthropic', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: true,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 40,
  nutzbaresKontextfenster: 200000, vertragsStrenge: { schemaTiefe: 5, reparaturversuche: 2 },
  rundenbudget: 30, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}

/**
 * The Anthropic rule, in code: every assistant message that opens tool calls must be followed
 * immediately by a user message, and that message's *leading* blocks must be the tool_results for
 * exactly those ids. Returns the offending message index, or -1.
 */
function ersterVerstoss(messages: Array<Record<string, unknown>>): string | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const inhalt = (m.content as Array<Record<string, unknown>>) ?? []
    const offeneIds = inhalt.filter(b => b.type === 'tool_use').map(b => String(b.id))
    if (offeneIds.length === 0) continue

    const naechste = messages[i + 1]
    if (!naechste) return `Nachricht ${i} oeffnet ${offeneIds.join(', ')}, danach kommt nichts.`
    if (naechste.role !== 'user') {
      return `Nachricht ${i} oeffnet ${offeneIds.join(', ')}, Nachricht ${i + 1} hat die Rolle '${String(naechste.role)}' statt 'user'.`
    }
    const folge = (naechste.content as Array<Record<string, unknown>>) ?? []
    const fuehrende = folge.slice(0, offeneIds.length)
    for (let k = 0; k < offeneIds.length; k++) {
      const b = fuehrende[k]
      if (!b || b.type !== 'tool_result') {
        return `Nachricht ${i} oeffnet ${offeneIds[k]}, aber Block ${k} von Nachricht ${i + 1} ist '${String(b?.type)}' statt 'tool_result'.`
      }
    }
    const geliefert = fuehrende.map(b => String(b.tool_use_id))
    for (const id of offeneIds) {
      if (!geliefert.includes(id)) {
        return `Nachricht ${i} oeffnet ${id}, die fuehrenden Bloecke von Nachricht ${i + 1} liefern nur ${geliefert.join(', ')}.`
      }
    }
  }
  return null
}

/** Anthropic also rejects two messages of the same role in a row. */
function ersteRollenwiederholung(messages: Array<Record<string, unknown>>): string | null {
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) {
      return `Nachricht ${i - 1} und ${i} haben beide die Rolle '${String(messages[i].role)}'.`
    }
  }
  return null
}

// The exact sequence of the failed acceptance run: the model calls a tool wrongly, gets a named
// error, fetches the schema through the meta tool, and the meta call completes.
const nachladeLauf: Ereignis[] = [
  ev(1, 'run.started', { auftragstext: 'lies die README und nenne die Kennzahl' }),
  ev(2, 'model.answered', { bloecke: [
    { art: 'text', text: 'Ich lese die README.' },
    { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
  ] }),
  ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen', eingabe: {} }),
  ev(4, 'tool.failed', { aufrufId: 'c1', name: 'datei_lesen', meldung: "Das Feld 'pfad' fehlt in der Eingabe." }),
  ev(5, 'model.answered', { bloecke: [
    { art: 'text', text: 'Ich pruefe das Schema.' },
    { art: 'werkzeug-aufruf', id: 'c2', name: 'werkzeug_schema', eingabe: { name: 'datei_lesen' } },
  ] }),
  ev(6, 'tool.intent', { aufrufId: 'c2', name: 'werkzeug_schema', eingabe: { name: 'datei_lesen' } }),
  ev(7, 'tool.schema_loaded', { name: 'datei_lesen', schema: {
    type: 'object', properties: { pfad: { type: 'string' } }, required: ['pfad'],
  } }),
  ev(8, 'tool.completed', { aufrufId: 'c2', name: 'werkzeug_schema',
    inhalt: [{ art: 'text', text: 'Schema fuer datei_lesen steht im Verlauf.' }] }),
]

describe('Verlauf gegen den Anbietervertrag', () => {
  it('haelt nach einem Schema-Nachladen die Anthropic-Nachbarschaft von tool_use und tool_result ein', () => {
    const koerper = anthropicCodec.toWire(projiziere(nachladeLauf), [], kann) as {
      messages: Array<Record<string, unknown>>
    }
    expect(ersterVerstoss(koerper.messages)).toBeNull()
  })

  it('erzeugt nach einem Schema-Nachladen keine zwei Nutzernachrichten hintereinander', () => {
    const koerper = anthropicCodec.toWire(projiziere(nachladeLauf), [], kann) as {
      messages: Array<Record<string, unknown>>
    }
    expect(ersteRollenwiederholung(koerper.messages)).toBeNull()
  })

  it('traegt das nachgeladene Schema trotzdem in den Verlauf, nicht in den Praefix', () => {
    const koerper = anthropicCodec.toWire(projiziere(nachladeLauf), [], kann) as {
      messages: Array<Record<string, unknown>>
      tools?: unknown
    }
    // The point of deferred loading is that the schema reaches the model at all. A fix that
    // satisfied the adjacency rule by dropping the schema would pass the two tests above.
    // Anchored on the delivery sentence, not on a field name: 'pfad' also appears in the error
    // message of the failed first call, so searching for it would pass without any schema.
    expect(JSON.stringify(koerper.messages)).toContain('Schema fuer datei_lesen:')
    // And it must be in a message, never in the tools array that forms the stable prefix.
    expect(koerper.tools).toBeUndefined()
  })

  it('haelt die Reihenfolge auch beim openai-chat-Codec: erst die tool-Nachricht, dann das Schema', () => {
    const koerper = openAiChatCodec.toWire(projiziere(nachladeLauf), [], { ...kann, codec: 'openai-chat' }) as {
      messages: Array<Record<string, unknown>>
    }
    const rollen = koerper.messages.map(m => String(m.role))
    // Each tool call is answered by a `tool` message before anything else follows it.
    for (let i = 0; i < koerper.messages.length; i++) {
      const m = koerper.messages[i]
      if (m.role !== 'assistant' || !m.tool_calls) continue
      const anzahl = (m.tool_calls as unknown[]).length
      for (let k = 1; k <= anzahl; k++) {
        expect(rollen[i + k]).toBe('tool')
      }
    }
    expect(JSON.stringify(koerper.messages)).toContain('Schema fuer datei_lesen:')
  })

  // The mixed turn: a real tool is still running when the schema arrives. Its result must still
  // lead the user message, and the schema must not slip in front of it.
  it('haelt die Nachbarschaft auch, wenn im selben Zug ein echtes Werkzeug mitlaeuft', () => {
    const gemischt: Ereignis[] = [
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.md' } },
        { art: 'werkzeug-aufruf', id: 'c2', name: 'werkzeug_schema', eingabe: { name: 'verzeichnis_listen' } },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.md' } }),
      ev(4, 'tool.intent', { aufrufId: 'c2', name: 'werkzeug_schema', eingabe: { name: 'verzeichnis_listen' } }),
      ev(5, 'tool.schema_loaded', { name: 'verzeichnis_listen', schema: { type: 'object' } }),
      ev(6, 'tool.completed', { aufrufId: 'c2', name: 'werkzeug_schema',
        inhalt: [{ art: 'text', text: 'Schema fuer verzeichnis_listen steht im Verlauf.' }] }),
      ev(7, 'tool.completed', { aufrufId: 'c1', name: 'datei_lesen',
        inhalt: [{ art: 'text', text: 'Inhalt von a.md' }] }),
    ]
    const koerper = anthropicCodec.toWire(projiziere(gemischt), [], kann) as {
      messages: Array<Record<string, unknown>>
    }
    expect(ersterVerstoss(koerper.messages)).toBeNull()
    expect(ersteRollenwiederholung(koerper.messages)).toBeNull()
  })
})
