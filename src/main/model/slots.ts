/**
 * slots — the seven assignment slots, and the one place their runner and niveau are stated.
 *
 * A slot's Laeufer is a property of the slot, never a user choice. The settings surface
 * therefore offers no runner picker, which is what keeps the eignung rules unrestated (see
 * the guard test in tests/model/eignung-einzige-quelle.test.ts).
 *
 * Three arts, three different things a Laeufer is bound to. A tier drives a CLI harness for
 * a whole session (`fremdes-cli`). A role is resolved from *inside* an already-running
 * context — either a single job (`tagging`, `worker`, `ein-schuss`) or, for `rechercheur`, a
 * bounded sub-loop with its own parent (`eigene-schleife`); "role" names where the
 * assignment is looked up, not how much work it does, and `rolle:rechercheur`'s own comment
 * below says so. A sitzung *is* the running context: a human starts it directly as a grid
 * cell, with no parent lauf, read at cell start like a tier rather than resolved per call
 * like a role — see `Sitzungsschluessel` below for why that combination does not fit under
 * `rollen`.
 *
 * `Tier`, `Rolle` and `Sitzungsschluessel` live here rather than in registry.ts so that
 * registry.ts can import this module without a cycle. registry.ts re-exports all three, so
 * no existing import breaks.
 */

import type { Laeufer } from './eignung'
import { CapabilityNiveau } from '../preset/niveau'

export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker' | 'rechercheur'
/**
 * Die dritte Art. Sie faehrt keinen CLI-Prozess wie ein Tier, und sie ist kein
 * Registry-Eintrag, der aus einem bereits laufenden Auftrag heraus fuer einen Job oder einen
 * Unterlauf aufgeloest wird wie eine Rolle — sie *ist* die laufende Sitzung: ein Mensch
 * startet sie direkt als Gitterzelle, ohne Elternlauf. Deshalb `wirkung: 'naechste-session'`
 * wie bei den Tiers (gelesen beim Zellenstart, nicht bei jeder Aufloesung), und trotzdem ein
 * Registry-Eintrag als Ziel wie bei den Rollen (ein Endpunkt, kein CLI-Handle). Unter
 * `rollen` zu haengen wuerde diese Mischung verstecken, nicht beschreiben.
 */
export type Sitzungsschluessel = 'niveau-b'

export type SlotId =
  | 'tier:light'
  | 'tier:standard'
  | 'tier:heavy'
  | 'rolle:tagging'
  | 'rolle:worker'
  | 'rolle:rechercheur'
  | 'sitzung:niveau-b'

export interface Slot {
  id: SlotId
  /** German: this text reaches the user. */
  beschriftung: string
  laeufer: Laeufer
  niveau: CapabilityNiveau
  art: 'tier' | 'rolle' | 'sitzung'
  schluessel: Tier | Rolle | Sitzungsschluessel
  /**
   * When a change takes effect. Tiers are read at session launch
   * (ipc-handlers.ts), roles on every resolution (rollen.ts).
   */
  wirkung: 'sofort' | 'naechste-session'
}

export const SLOTS: readonly Slot[] = [
  {
    id: 'tier:light', beschriftung: 'Tier „light" — mechanische Arbeit',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'light', wirkung: 'naechste-session',
  },
  {
    id: 'tier:standard', beschriftung: 'Tier „standard" — der Alltagsweg',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'standard', wirkung: 'naechste-session',
  },
  {
    id: 'tier:heavy', beschriftung: 'Tier „heavy" — dort, wo Fehler sich vervielfachen',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'heavy', wirkung: 'naechste-session',
  },
  {
    id: 'rolle:tagging', beschriftung: 'Rolle „Notizen-Verschlagwortung"',
    laeufer: 'ein-schuss', niveau: CapabilityNiveau.C,
    art: 'rolle', schluessel: 'tagging', wirkung: 'sofort',
  },
  {
    id: 'rolle:worker', beschriftung: 'Rolle „Niveau-C-Auftraege"',
    laeufer: 'ein-schuss', niveau: CapabilityNiveau.C,
    art: 'rolle', schluessel: 'worker', wirkung: 'sofort',
  },
  /**
   * Der Rechercheur-Unterlauf (harness/rechercheur.ts). Bis zum 2026-08-22 erbte er das Modell
   * des Hauptlaufs — die falsche Kopplung: der Unterlauf hat ein eigenes Aufgabenprofil (kurze
   * Kette, viel fremder Text, drei Werkzeuge, am Ende eine Zusammenfassung), und solange er
   * mitfaehrt, ist der Vergleich „welches Modell recherchiert am besten" gar nicht fahrbar.
   *
   * Zwei Felder, bei denen die naheliegende Wahl falsch waere:
   *
   * `laeufer: 'eigene-schleife'` — der Unterlauf *ist* eine Agentenschleife, mit eigenem
   * Runden- und Zeitbudget. `ein-schuss` wie bei den anderen beiden Rollen wuerde die
   * cli-harness-Sperre zwar genauso ziehen, aber die Zeile falsch beschreiben.
   *
   * `niveau: B`, nicht C. Auf C feuerte `unter-faehigkeit` („Das laeuft, nutzt den Laeufer aber
   * nicht aus") bei jeder Zuordnung, und das waere hier schlicht unwahr. Auf B feuert
   * stattdessen `nicht-gemessen`, solange die Faehigkeitszeile `vermutet` ist — was zutrifft.
   *
   * Rueckfall bei leerem Platz: das Modell des Hauptlaufs (rechercheur.ts). Deshalb hat diese
   * Rolle **keinen** `llm.*`-Endpunkt wie `tagging` und `worker`; ansicht.ts sagt das im
   * Rueckfalltext.
   */
  {
    id: 'rolle:rechercheur', beschriftung: 'Rolle „Rechercheur" — der abgeschottete Unterlauf',
    laeufer: 'eigene-schleife', niveau: CapabilityNiveau.B,
    art: 'rolle', schluessel: 'rechercheur', wirkung: 'sofort',
  },
  /**
   * Die Niveau-B-Sitzung im Gitter (agent/adapters/keel-harness.ts). Der einzige Platz, dessen
   * Laeufer eine ganze Sitzung traegt statt eines einzelnen Zuges oder Jobs.
   *
   * `wirkung: 'naechste-session'` wie bei den Tiers: gelesen wird beim Zellenstart. Mitten in
   * einem laufenden Auftrag das Modell zu wechseln, verwuerfe dessen Praefix-Zwischenspeicher.
   *
   * **Kein Rueckfall bei leerem Platz** — anders als `rolle:rechercheur`, wo das Modell des
   * Hauptlaufs einspringt. Der naechstliegende Rueckfall waere hier `llm.worker`, und das ist
   * ein Ein-Schuss-Endpunkt fuer einen einzelnen Job, keine Sitzung. ansicht.ts sagt das im
   * Rueckfalltext, und der Start scheitert benannt (session/schleifen-start.ts).
   */
  {
    id: 'sitzung:niveau-b',
    beschriftung: 'Sitzung „Niveau B" — die eigene Schleife im Gitter',
    laeufer: 'eigene-schleife', niveau: CapabilityNiveau.B,
    art: 'sitzung', schluessel: 'niveau-b', wirkung: 'naechste-session',
  },
]

export function slotFuerId(id: string): Slot | null {
  return SLOTS.find(s => s.id === id) ?? null
}

export function slotFuerTier(tier: Tier): Slot {
  const slot = SLOTS.find(s => s.art === 'tier' && s.schluessel === tier)
  if (!slot) throw new Error(`Unbekanntes Tier '${tier}'`)
  return slot
}
