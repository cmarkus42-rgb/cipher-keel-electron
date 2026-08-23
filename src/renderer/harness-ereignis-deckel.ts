/**
 * harness-ereignis-deckel — die Trimm-Logik fuer die in index.tsx gesammelten Harness-Ereignisse.
 *
 * Rein herausgezogen (M-1, Review Task 10): das war das einzige nicht-triviale Stueck Logik im
 * urspruenglichen Diff ohne eigenen Test, weder Typ noch Test deckten es. Seine Fehlermodi sind
 * bis zum 501. Ereignis eines Laufs unsichtbar — das *neueste* statt des aeltesten wegwerfen,
 * oder ueber laufId-Grenzen hinweg schneiden — und werden erst im Betrieb bei langen Laeufen
 * sichtbar. Ein Fehler, der erst dort auffaellt, ist teurer als drei Zeilen Test.
 */
import type { HarnessEreignis } from '../shared/harness-types'

/**
 * Haengt `ereignis` an `bisher` an und wirft — falls der Lauf, zu dem `ereignis` gehoert, die
 * Grenze `deckel` ueberschreitet — dessen AELTESTE Eintraege weg, bis er sie wieder einhaelt.
 * Ereignisse anderer Laeufe bleiben unangetastet, auch wenn sie im selben Aufruf ueber ihrer
 * eigenen Grenze liegen wuerden (kann nach heutiger Aufrufweise nicht vorkommen, da immer nur ein
 * einzelnes neues Ereignis dazukommt, aber die Funktion behauptet das nicht implizit ueber ihre
 * Signatur hinaus).
 */
export function deckle(
  bisher: HarnessEreignis[], ereignis: HarnessEreignis, deckel: number,
): HarnessEreignis[] {
  const naechste = [...bisher, ereignis]
  const zuDiesemLauf = naechste.filter((x) => x.laufId === ereignis.laufId)
  if (zuDiesemLauf.length <= deckel) return naechste
  const ueberschuss = zuDiesemLauf.length - deckel
  let uebersprungen = 0
  return naechste.filter((x) => {
    if (x.laufId !== ereignis.laufId) return true
    if (uebersprungen < ueberschuss) { uebersprungen++; return false }
    return true
  })
}
