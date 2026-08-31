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

/**
 * Der Rumpf ohne Entitaet. Exportiert allein fuer den Waechter in
 * tests/harness/werkzeugliste.test.ts: er stand bis zum 2026-08-30 auf „Du kannst nichts
 * schreiben und nichts ausfuehren" — zu einer Zeit, als die Registry `datei_schreiben`,
 * `datei_loeschen` und `shell_ausfuehren` laengst trug. Ein echter Beweislauf fand dieselbe
 * Luege in ka-body.md; diese zweite Kopie ueberlebte, weil die erste ohne Suche nach
 * Geschwistern behoben wurde.
 *
 * Kurz gehalten, weil er in den stabilen Praefix geht und bei jedem Zug bezahlt wird.
 */
export const BODY =
  'Du arbeitest in einem Projektverzeichnis und bearbeitest den Auftrag, der darin steht. ' +
  'Du kannst lesen, suchen, den Knowledge-Graph abfragen, Dateien schreiben und loeschen und ' +
  'Kommandos ausfuehren. Geschrieben und geloescht wird nur innerhalb der Projektwurzel; ' +
  'Kommandos laufen in einem Sandkasten ohne Netz — Paketbefehle wie `npm ci` bekommen es.'

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
