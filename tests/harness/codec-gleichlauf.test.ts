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
  it('beide Codecs uebersetzen Werkzeugaufrufe und -ergebnisse strukturell vollstaendig', () => {
    // The property being tested: when the same canonical sequence is sent through both codecs,
    // the resulting wire forms both contain (1) a tool call with id 'c1' and (2) a tool result
    // referencing that same id — each in the vendor's own syntax, but both complete.
    // Losing either block (call or result) makes the test red.
    const verlauf = projiziere(ABLAUF)
    const stummel = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]

    // Anthropic structure
    const anthropic = codecFuer('anthropic').toWire(verlauf, stummel, {
      ...BASIS, codec: 'anthropic',
    }) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    const anthropicHasCall = anthropic.messages.some(m =>
      (m.content as Array<Record<string, unknown>>).some(c =>
        c.type === 'tool_use' && c.id === 'c1',
      ),
    )
    const anthropicHasResult = anthropic.messages.some(m =>
      (m.content as Array<Record<string, unknown>>).some(c =>
        c.type === 'tool_result' && c.tool_use_id === 'c1',
      ),
    )
    expect(anthropicHasCall).toBe(true)
    expect(anthropicHasResult).toBe(true)

    // OpenAI structure
    const openai = codecFuer('openai-chat').toWire(verlauf, stummel, {
      ...BASIS, codec: 'openai-chat',
    }) as {
      messages: Array<{
        role?: string
        tool_call_id?: string
        tool_calls?: Array<{ id: string }>
        content?: unknown
      }>
    }
    const openaiHasCall = openai.messages.some(m =>
      (m.tool_calls as Array<{ id: string }> ?? []).some(tc => tc.id === 'c1'),
    )
    const openaiHasResult = openai.messages.some(m =>
      m.role === 'tool' && m.tool_call_id === 'c1',
    )
    expect(openaiHasCall).toBe(true)
    expect(openaiHasResult).toBe(true)
  })

  it('die Ereignisfolge ist von der Drahtform unabhaengig', () => {
    // The projection sees only the canonical form; nothing codec-specific may leak into it.
    const verlauf = projiziere(ABLAUF)
    expect(verlauf.map(n => n.rolle)).toEqual(['nutzer', 'modell', 'nutzer', 'modell'])
    expect(JSON.stringify(verlauf)).not.toContain('tool_use')
    expect(JSON.stringify(verlauf)).not.toContain('tool_calls')
  })
})
