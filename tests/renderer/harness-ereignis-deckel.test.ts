/**
 * deckle — die Trimm-Logik fuer gesammelte Harness-Ereignisse (M-1, Review Task 10).
 *
 * Drei Faelle, weil der Reviewer zu Recht widersprach: "low-value" war die falsche Einschaetzung
 * fuer die einzige nicht-triviale Funktion im Diff, deren Fehlermodi erst ab Ereignis 501
 * sichtbar wuerden — das falsche Ende wegwerfen, oder ueber laufId-Grenzen hinweg schneiden.
 */
import { describe, it, expect } from 'vitest'
import { deckle } from '../../src/renderer/harness-ereignis-deckel'
import type { HarnessEreignis } from '../../src/shared/harness-types'

function ereignis(laufId: string, seq: number): HarnessEreignis {
  return { laufId, seq, ts: `2026-08-23T00:00:${String(seq).padStart(2, '0')}.000Z`, art: 'prompt.sent', nutzlast: {} }
}

describe('deckle', () => {
  it('haengt einfach an, solange der Lauf unter der Grenze bleibt', () => {
    const bisher = [ereignis('l1', 1), ereignis('l1', 2)]
    const ergebnis = deckle(bisher, ereignis('l1', 3), 5)
    expect(ergebnis.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('wirft beim Ueberschreiten die AELTESTEN Eintraege des Laufs weg, nicht die neuesten', () => {
    const bisher = [ereignis('l1', 1), ereignis('l1', 2), ereignis('l1', 3)]
    const ergebnis = deckle(bisher, ereignis('l1', 4), 3)
    // Die Grenze ist 3, es kommt ein viertes Ereignis dazu -- Ereignis 1 (das aelteste) muss
    // weichen, 2/3/4 bleiben. Eine Implementierung, die stattdessen das NEUESTE wegwuerfe (das
    // gerade angekommene Ereignis 4 selbst verwerfen), bestuende einen reinen Laengen-Test
    // ("hat 3 Eintraege") genauso -- deshalb wird hier auf die tatsaechlichen seq-Werte geprueft.
    expect(ergebnis.map((e) => e.seq)).toEqual([2, 3, 4])
  })

  it('schneidet nicht ueber laufId-Grenzen hinweg -- ein fremder Lauf bleibt unangetastet', () => {
    // l2 liegt bereits ueber dem, was fuer sich genommen sein Deckel waere (Grenze 2, 3
    // Eintraege) -- ein Trimmer, der global statt je laufId zaehlt, wuerde hier faelschlich
    // auch l2-Eintraege wegwerfen, obwohl das neue Ereignis zu l1 gehoert.
    const bisher = [ereignis('l2', 10), ereignis('l2', 11), ereignis('l2', 12), ereignis('l1', 1)]
    const ergebnis = deckle(bisher, ereignis('l1', 2), 2)
    expect(ergebnis.filter((e) => e.laufId === 'l2').map((e) => e.seq)).toEqual([10, 11, 12])
    expect(ergebnis.filter((e) => e.laufId === 'l1').map((e) => e.seq)).toEqual([1, 2])
  })
})
