/**
 * Der Waechter fuer das Ereignis-Panel: keine Ereignisart darf stumm sein.
 *
 * `skill.geladen` fehlte nach seiner Einfuehrung sowohl in der Farbtabelle als auch im `switch`
 * der Kurzfassung. Der default-Zweig lieferte die leere Zeichenkette, also erschien im Fenster
 * eine Zeile mit Nummer und Art und sonst nichts — ausgerechnet bei dem Ereignis, dessen einzige
 * Daseinsberechtigung laut Spec 5.2 lautet, sichtbar zu machen, dass eine Faehigkeit geladen
 * wurde. Der Compiler faengt das nicht: `HarnessEreignis.art` ist an der IPC-Grenze `string`,
 * nicht `EreignisArt`, also gibt es keine Vollstaendigkeitspruefung im `switch`.
 *
 * Dieser Test laeuft ueber `EREIGNIS_ARTEN` und faengt damit nicht diesen einen Fall, sondern
 * jeden kuenftigen. Er prueft die beiden Funktionen als reine Funktionen — kein Rendern noetig.
 */

import { describe, it, expect } from 'vitest'
import { EREIGNIS_ARTEN } from '../../src/main/harness/ereignisse'
import { FARBE, kurzfassung } from '../../src/renderer/components/harness/EreignisPanel'
import type { HarnessEreignis } from '../../src/shared/harness-types'

/** Eine Nutzlast, die alle Felder traegt, die irgendeine Art liest. */
const NUTZLAST: Record<string, unknown> = {
  modellId: 'spark-qwen38-27b',
  codec: 'openai-chat',
  werkzeuge: ['datei_lesen', 'faehigkeit_lesen'],
  text: 'ein Rumpf mit Substanz',
  zug: 3,
  bloecke: [{ art: 'text', text: 'x' }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  name: 'web-recherche',
  aufrufId: 'c1',
  meldung: 'Das Feld fehlt.',
  grund: 'runden-erschoepft',
  endzustand: 'fertig',
  werkzeug: 'seite_lesen',
  sprung: 1,
  url: 'https://beispiel.test/a',
  host: 'beispiel.test',
  unterLaufId: 'u1',
  kostenCent: 3,
  runden: 4,
  auftragstext: 'ein Folgeauftrag mit Substanz',
}

function ereignis(art: string): HarnessEreignis {
  return { laufId: 'l', seq: 1, ts: '2026-08-21T00:00:00.000Z', art, nutzlast: NUTZLAST } as HarnessEreignis
}

describe('EreignisPanel — jede Ereignisart ist sichtbar', () => {
  it.each([...EREIGNIS_ARTEN])('%s hat eine Farbe', (art) => {
    expect(FARBE[art], `Ereignisart '${art}' fehlt in der Farbtabelle`).toBeTruthy()
  })

  it.each([...EREIGNIS_ARTEN])('%s hat eine nicht-leere Kurzfassung', (art) => {
    const text = kurzfassung(ereignis(art))
    expect(text, `Ereignisart '${art}' faellt in den default-Zweig und wird stumm dargestellt`)
      .not.toBe('')
  })

  it('nennt bei skill.geladen den Namen der Faehigkeit', () => {
    // Der Name ist der Punkt: bei Messpunkt M7 wird gezaehlt, *welche* Faehigkeit ein Modell
    // geholt hat. Eine Kurzfassung, die nur 'geladen' sagt, macht die Messung unmoeglich.
    expect(kurzfassung(ereignis('skill.geladen'))).toContain('web-recherche')
  })

  it('nennt bei auftrag.folgend die tatsaechliche Laenge des Auftragstexts', () => {
    // Ohne eine feste Erwartung an die Zahl selbst waere diese Zeile bloss der allgemeine
    // Nicht-leer-Test von oben noch einmal: `${n.auftragstext ?? ''}.length` liefert auch fuer
    // eine fehlende Angabe "0 Zeichen" — nicht leer, aber falsch. Erst der Abgleich gegen die
    // Laenge des Fixture-Texts zeigt, dass die Kurzfassung wirklich die Nutzlast liest und nicht
    // eine Konstante, die diesen Test genauso bestuende.
    const laenge = String(NUTZLAST.auftragstext).length
    expect(kurzfassung(ereignis('auftrag.folgend'))).toBe(`${laenge} Zeichen`)
  })

  it('erfindet fuer eine unbekannte Art nichts', () => {
    // Die Gegenrichtung: der default-Zweig bleibt leer, statt zu raten. Eine erfundene
    // Kurzfassung fuer eine Art, die dieser Code nicht kennt, waere schlimmer als keine.
    expect(kurzfassung(ereignis('gibt.es.nicht'))).toBe('')
  })
})
