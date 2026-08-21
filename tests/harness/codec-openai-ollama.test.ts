/**
 * Was der openai-chat-Codec ueber Ollamas /v1-Flaeche einhalten muss.
 *
 * Zwei gemessene Fehlerfaelle stehen hinter diesen Tests, beide betreffen nur die Drahtform, nicht
 * die kanonische Form:
 *
 * (a) Ollama-Fehler #14181: eine Assistant-Nachricht mit `tool_calls` und `content: []` reicht die
 *     /v1-Schicht ungefiltert an den Renderer weiter, wo ein *leerer* Wert anders gerendert wird
 *     als ein *fehlendes* Feld. qwen3-coder faellt danach in Folge-Zuegen aus dem strukturierten
 *     Werkzeugmodus in Text-Markup (`<function=...>`). Also: Feld weglassen, nicht leeren.
 *
 * (b) Ollamas /v1 erzeugt pro Inhaltsteil eine eigene interne Nachricht. Ob Rolle `tool` mit
 *     Array-Content ueberhaupt durchgeht, ist unbelegt (Messpunkt M2 im Entwurf 1.5/2). Wo der
 *     Inhalt aus genau einem Textblock besteht, geht die Zeichenketten-Form -- die einzige, die
 *     jeder /v1-Server sicher kann.
 *
 * Anthropic ist von beidem nicht beruehrt: der andere Codec wird nicht angefasst. Die Reihenfolge-
 * Zusicherung aus `verlauf-anbietervertrag.test.ts` (Werkzeugergebnisse als eigene `tool`-
 * Nachrichten vor allem anderen) bleibt unveraendert -- hier aendert sich nur die *Form* des
 * `content`-Feldes, nie die Zahl oder die Reihenfolge der Nachrichten.
 */

import { describe, it, expect } from 'vitest'
import { openAiChatCodec } from '../../src/main/harness/codec-openai-chat'
import { anthropicCodec } from '../../src/main/harness/codec-anthropic'
import type { Faehigkeiten } from '../../src/main/model/entry'
import type { Nachricht } from '../../src/main/harness/form'

const KANN: Faehigkeiten = {
  codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 128000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}

type Draht = { messages: Array<Record<string, unknown>> }

function draht(nachrichten: Nachricht[]): Array<Record<string, unknown>> {
  return (openAiChatCodec.toWire(nachrichten, [], KANN) as Draht).messages
}

describe('openai-chat gegen Ollama /v1: leerer content (Fehler #14181)', () => {
  it('laesst content weg, wenn die Assistant-Nachricht nur Werkzeugaufrufe traegt', () => {
    const m = draht([{ rolle: 'modell', bloecke: [
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
    ] }])[0]
    // Auf Anwesenheit pruefen, nicht auf Falsy: `[]`, `null` und `""` sind alle falsy-nah bzw.
    // truthy-verwirrend, und genau diese drei Werte sind der Fehlerfall. `'content' in m` ist die
    // einzige Pruefung, die sie von einem fehlenden Feld unterscheidet.
    expect('content' in m).toBe(false)
    expect(m.role).toBe('assistant')
    expect((m.tool_calls as Array<{ id: string }>).map(t => t.id)).toEqual(['c1'])
  })

  it('laesst content auch bei zwei parallelen Aufrufen ohne Text weg', () => {
    const m = draht([{ rolle: 'modell', bloecke: [
      { art: 'werkzeug-aufruf', id: 'c1', name: 'a', eingabe: {} },
      { art: 'werkzeug-aufruf', id: 'c2', name: 'b', eingabe: {} },
    ] }])[0]
    expect('content' in m).toBe(false)
    expect((m.tool_calls as unknown[]).length).toBe(2)
  })

  it('schreibt den Text als Zeichenkette, wenn Text und Aufrufe zusammen kommen', () => {
    const m = draht([{ rolle: 'modell', bloecke: [
      { art: 'text', text: 'Ich lese die Datei.' },
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
    ] }])[0]
    expect(m.content).toBe('Ich lese die Datei.')
    expect((m.tool_calls as Array<{ function: { name: string } }>)[0].function.name).toBe('datei_lesen')
  })
})

describe('openai-chat gegen Ollama /v1: ein Textblock als Zeichenkette (M2)', () => {
  it('sendet ein Werkzeugergebnis aus einem Textblock als Zeichenkette', () => {
    const m = draht([{ rolle: 'nutzer', bloecke: [
      { art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: false,
        inhalt: [{ art: 'text', text: 'Inhalt von a.ts' }] },
    ] }])[0]
    expect(m.role).toBe('tool')
    expect(m.tool_call_id).toBe('c1')
    expect(m.content).toBe('Inhalt von a.ts')
  })

  it('sendet eine reine Nutzernachricht aus einem Textblock als Zeichenkette', () => {
    const m = draht([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'lies die README' }] }])[0]
    expect(m.role).toBe('user')
    expect(m.content).toBe('lies die README')
  })

  it('laesst ein Werkzeugergebnis aus zwei Textbloecken ein Array', () => {
    // Bewusst so entschieden: die Zusammenlegung zweier Bloecke waere eine Erfindung -- welcher
    // Trenner? -- und Ollamas Verhalten bei Array-Content in Rolle `tool` ist unbelegt (M2).
    // Solange nicht gemessen ist, ob das ueberhaupt durchgeht, wird nur der Fall geaendert, bei
    // dem die Zeichenkette nachweislich verlustfrei ist. Faellt M2 negativ aus, ist das hier die
    // Stelle, an der die Entscheidung neu getroffen wird.
    const m = draht([{ rolle: 'nutzer', bloecke: [
      { art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: false, inhalt: [
        { art: 'text', text: 'erster' },
        { art: 'text', text: 'zweiter' },
      ] },
    ] }])[0]
    expect(Array.isArray(m.content)).toBe(true)
    expect(m.content).toEqual([
      { type: 'text', text: 'erster' },
      { type: 'text', text: 'zweiter' },
    ])
  })

  it('laesst einen Bildblock unveraendert ein Array mit image_url', () => {
    const m = draht([{ rolle: 'nutzer', bloecke: [
      { art: 'bild', medientyp: 'image/png', daten: 'AAA' },
    ] }])[0]
    expect(m.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ])
  })

  it('laesst Text plus Bild ein Array, auch wenn ein Textblock dabei ist', () => {
    const m = draht([{ rolle: 'nutzer', bloecke: [
      { art: 'text', text: 'was ist das?' },
      { art: 'bild', medientyp: 'image/png', daten: 'AAA' },
    ] }])[0]
    expect(Array.isArray(m.content)).toBe(true)
    expect((m.content as unknown[]).length).toBe(2)
  })
})

describe('Anthropic bleibt unberuehrt', () => {
  it('schreibt fuer dieselben Nachrichten weiter Array-Content und laesst nichts weg', () => {
    const koerper = anthropicCodec.toWire([
      { rolle: 'modell', bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
      ] },
      { rolle: 'nutzer', bloecke: [
        { art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: false,
          inhalt: [{ art: 'text', text: 'Inhalt von a.ts' }] },
      ] },
    ], [], { ...KANN, codec: 'anthropic', denkbloecke: true }) as Draht
    for (const m of koerper.messages) {
      expect('content' in m).toBe(true)
      expect(Array.isArray(m.content)).toBe(true)
    }
  })
})
