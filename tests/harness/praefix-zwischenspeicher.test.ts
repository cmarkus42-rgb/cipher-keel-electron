/**
 * Der Haltepunkt, ohne den die ganze Praefix-Ordnung nichts einbringt.
 *
 * Die Spec nennt es die teuerste Zusicherung ihres Abschnitts: "Ein zweiter Lauf meldet einen
 * Cache-Treffer." Die Ordnung dafuer stand von Anfang an — keine Zeitstempel, sortierte Stummel,
 * zeichengleicher stabiler Teil. Was fehlte, war die Bitte: Anthropic legt nichts in den
 * Zwischenspeicher, solange kein `cache_control`-Haltepunkt gesetzt ist. Der erste echte Lauf
 * meldete darum ueber alle vier Zuege
 *
 *   cache_creation_input_tokens: 0, cache_read_input_tokens: 0
 *
 * und bezahlte jeden Zug voll. Bei OpenAI-kompatiblen Anbietern greift das Praefix-Caching von
 * allein, weshalb es dort nie auffiel.
 *
 * Der Haltepunkt muss *zwischen* den stabilen Teil und das Fortschrittsobjekt. Setzt man ihn ans
 * Ende von beidem, faellt der Zwischenspeicher genau dann aus, wenn ein Werkzeug lief — also
 * immer dann, wenn er sich lohnen wuerde. Genau das pruefen die Tests hier.
 */

import { describe, it, expect } from 'vitest'
import { mitSystemPraefix } from '../../src/main/harness-handlers'

const STABIL = 'Du arbeitest in einem Projektverzeichnis.\n\n## Werkzeuge\n\n- `datei_lesen` — liest'
const FORTSCHRITT_A = '## Fortschritt\n\n- [ ] README lesen'
const FORTSCHRITT_B = '## Fortschritt\n\n- [x] README lesen\n- [ ] Kennzahl nennen'

type Block = { type: string; text: string; cache_control?: { type: string } }

function systemBloecke(koerper: unknown): Block[] {
  const s = (koerper as { system?: unknown }).system
  expect(Array.isArray(s)).toBe(true)
  return s as Block[]
}

describe('mitSystemPraefix — Haltepunkt fuer den Zwischenspeicher', () => {
  it('setzt bei Anthropic einen cache_control-Haltepunkt auf den stabilen Teil', () => {
    const k = mitSystemPraefix({}, { stabil: STABIL, fluechtig: FORTSCHRITT_A }, 'anthropic')
    const bloecke = systemBloecke(k)
    expect(bloecke[0].text).toBe(STABIL)
    expect(bloecke[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('laesst das Fortschrittsobjekt hinter dem Haltepunkt — es traegt selbst keinen', () => {
    const k = mitSystemPraefix({}, { stabil: STABIL, fluechtig: FORTSCHRITT_A }, 'anthropic')
    const bloecke = systemBloecke(k)
    expect(bloecke).toHaveLength(2)
    expect(bloecke[1].text).toBe(FORTSCHRITT_A)
    expect(bloecke[1].cache_control).toBeUndefined()
  })

  /**
   * Der eigentliche Punkt. Ein Haltepunkt hinter dem Fortschritt saehe in den beiden Tests oben
   * genauso aus wie ein richtiger, wuerde aber bei jedem Werkzeugaufruf verfehlen. Deshalb wird
   * hier gepruft, was ueber zwei Zuege hinweg zeichengleich bleibt: alles bis einschliesslich
   * des Haltepunkts.
   */
  it('haelt den zwischengespeicherten Teil ueber zwei Zuege mit verschiedenem Fortschritt zeichengleich', () => {
    const zug1 = systemBloecke(mitSystemPraefix({}, { stabil: STABIL, fluechtig: FORTSCHRITT_A }, 'anthropic'))
    const zug2 = systemBloecke(mitSystemPraefix({}, { stabil: STABIL, fluechtig: FORTSCHRITT_B }, 'anthropic'))

    const bisHaltepunkt = (b: Block[]): Block[] => {
      const i = b.findIndex(x => x.cache_control)
      expect(i).toBeGreaterThanOrEqual(0)
      return b.slice(0, i + 1)
    }
    expect(JSON.stringify(bisHaltepunkt(zug2))).toBe(JSON.stringify(bisHaltepunkt(zug1)))
    // Und die Zuege unterscheiden sich wirklich — sonst prueft der Vergleich oben nichts.
    expect(JSON.stringify(zug2)).not.toBe(JSON.stringify(zug1))
  })

  it('erzeugt ohne Fortschritt genau einen Block, und der traegt den Haltepunkt', () => {
    const bloecke = systemBloecke(mitSystemPraefix({}, { stabil: STABIL, fluechtig: '' }, 'anthropic'))
    expect(bloecke).toHaveLength(1)
    expect(bloecke[0].text).toBe(STABIL)
    expect(bloecke[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('schreibt nie einen leeren Textblock — Anthropic weist den ab', () => {
    for (const teile of [
      { stabil: STABIL, fluechtig: '' },
      { stabil: '', fluechtig: FORTSCHRITT_A },
      { stabil: '', fluechtig: '' },
    ]) {
      const s = (mitSystemPraefix({}, teile, 'anthropic') as { system?: unknown }).system
      for (const b of (Array.isArray(s) ? s : []) as Block[]) {
        expect(b.text).not.toBe('')
      }
    }
  })

  it('laesst den uebrigen Koerper unangetastet', () => {
    const k = mitSystemPraefix(
      { messages: [{ role: 'user', content: 'x' }], tools: [{ name: 't' }] },
      { stabil: STABIL, fluechtig: '' }, 'anthropic',
    ) as Record<string, unknown>
    expect(k.messages).toEqual([{ role: 'user', content: 'x' }])
    expect(k.tools).toEqual([{ name: 't' }])
  })

  it('bleibt bei openai-chat bei der einen Systemnachricht ohne Haltepunkt', () => {
    // Dort ist das Praefix-Caching des Anbieters automatisch und braucht keine Bitte; ein
    // fremdes Feld im Koerper waere dagegen ein Risiko fuer HTTP 400 quer durch den Dialekt.
    const k = mitSystemPraefix(
      { messages: [{ role: 'user', content: 'x' }] },
      { stabil: STABIL, fluechtig: FORTSCHRITT_A }, 'openai-chat',
    ) as { messages: Array<Record<string, unknown>> }
    expect(k.messages[0].role).toBe('system')
    expect(k.messages[0].content).toBe(`${STABIL}\n\n${FORTSCHRITT_A}`)
    expect(JSON.stringify(k)).not.toContain('cache_control')
    expect(k.messages[1]).toEqual({ role: 'user', content: 'x' })
  })

  it('haengt bei openai-chat ohne Fortschritt keine leere Zeile an', () => {
    const k = mitSystemPraefix({ messages: [] }, { stabil: STABIL, fluechtig: '' }, 'openai-chat') as
      { messages: Array<Record<string, unknown>> }
    expect(k.messages[0].content).toBe(STABIL)
  })
})
