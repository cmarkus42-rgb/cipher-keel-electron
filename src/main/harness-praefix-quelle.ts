/**
 * harness-praefix-quelle — where the stable prefix's sections come from.
 *
 * Separate from the handlers because it is the seam to the preset layer: today it hands over a
 * plain body and the house rules, later it hands over an entity's assembled body, capabilities
 * and persona. Keeping it a named function means that later change touches one file.
 */

import type { Faehigkeit, PraefixTeile } from './harness'

const BODY =
  'Du arbeitest in einem Projektverzeichnis und beantwortest die Frage, die im Auftrag steht. ' +
  'Du kannst lesen, suchen und den Knowledge-Graph abfragen. Du kannst nichts schreiben und ' +
  'nichts ausfuehren.'

const REGELN = [
  'Belege schlagen Behauptungen: Nenne Datei und Zeile, wenn du etwas ueber den Code sagst.',
  'Wenn ein Werkzeug abgelehnt wird, nenne die Ablehnung in deiner Antwort statt sie zu umgehen.',
  'Was du nicht geprueft hast, sagst du nicht.',
].join('\n')

/**
 * Die Faehigkeiten kommen als Argument herein, nicht aus einem Lesevorgang hier drin: der Leser
 * meldet uebersprungene Verzeichnisse mit, und wer sie hier lesen liesse, muesste diese Meldung
 * entweder wegwerfen oder eine zweite Rueckgabe erfinden. Gelesen und gemeldet wird deshalb dort,
 * wo es auch jemanden gibt, der die Meldung loswerden kann (harness-handlers.ts).
 */
export function assemblePraefixTeile(
  auftragstext: string, faehigkeiten: Faehigkeit[],
): PraefixTeile {
  return {
    body: BODY,
    capabilities: '',
    persona: '',
    globaleRegeln: `## Regeln\n\n${REGELN}`,
    auftragstext,
    faehigkeiten,
  }
}
