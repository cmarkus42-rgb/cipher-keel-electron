/**
 * harness-praefix-quelle — where the stable prefix's sections come from.
 *
 * Separate from the handlers because it is the seam to the preset layer: without an `entitaet`,
 * this hands over a plain body and the house rules — the harness window's path, unchanged since
 * before this seam existed. With one, an entity's assembled body, persona, capabilities and
 * house rules win instead. Keeping it a named function means that change touches one file.
 *
 * `auftragstext` never comes from the entity, with or without one: it is the run's own business
 * — what this call was asked to do right now — not the role's. An entity supplies who is
 * answering and what it may do; it does not supply what was asked.
 */

import type { Faehigkeit, PraefixTeile } from './harness'
import type { EntitaetsTeile } from './agent/agent-adapter'

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
 * wo es auch jemanden gibt, der die Meldung loswerden kann (harness-sitzung.ts).
 */
export function assemblePraefixTeile(
  auftragstext: string, faehigkeiten: Faehigkeit[], entitaet?: EntitaetsTeile,
): PraefixTeile {
  return {
    body: entitaet?.body ?? BODY,
    capabilities: entitaet?.capabilities ?? '',
    persona: entitaet?.persona ?? '',
    globaleRegeln: entitaet?.globaleRegeln ?? `## Regeln\n\n${REGELN}`,
    auftragstext,
    faehigkeiten,
  }
}
