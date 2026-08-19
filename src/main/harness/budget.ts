/**
 * budget — four budgets, two end states, and a reason that carries its own instruction text.
 *
 * Hitting a budget is a *closing mode, not an exception*: one last turn without tools, with the
 * instruction to deliver the result in contract form. That is why every reason carries the text
 * itself rather than an identifier somebody else has to translate — one text, two uses, the same
 * construction result-contract.ts argues for in its own head.
 *
 * `ausgesetzt` is deliberately absent from the union. It is M8 section 7 row 6 and belongs to the
 * stretch that builds the wake service; adding it now would force a branch into every switch
 * that nothing can reach.
 */

import type { ModelAntwort } from './form'
import { PREISTABELLE_STAND } from './preise'
// pruefeBudgets only compares against the already-tracked Verbrauch; the pricing table and
// the arithmetic over it live in lauf.ts's verbrauchAusEreignissen, the module that actually
// reconstructs consumption from the event log.

export type Endzustand = 'fertig' | 'abgebrochen'

export type EndzustandCode =
  | 'ziel-erreicht'
  | 'runden-erschoepft' | 'zeit-erschoepft' | 'kosten-erschoepft' | 'kontext-erschoepft'
  | 'transportfehler' | 'abgebrochen-von-aussen'

export interface Abschlussgrund {
  code: EndzustandCode
  endzustand: Endzustand
  /** German. Goes to the model as the closing instruction *and* into the event. */
  anweisung: string
}

export interface Budgets {
  runden: number
  wanduhrMs: number
  kostenCent: number
  /** 0..1 of the usable context window. */
  kontextAnteil: number
}

export interface Verbrauch {
  runden: number
  verstricheneMs: number
  kostenCent: number
  letzteEingabeToken: number
}

const ABSCHLUSS =
  'Liefere jetzt das Ergebnis in Vertragsform — ein einzelner Block ```keel-ergebnis mit einem ' +
  'JSON-Objekt. Fuehre kein Werkzeug mehr aus. Ein Teilergebnis mit benannter Luecke ist besser ' +
  'als keines.'

export const ZIEL_ERREICHT: Abschlussgrund = {
  code: 'ziel-erreicht', endzustand: 'fertig',
  anweisung: 'Das Ziel ist erreicht.',
}

export const VON_AUSSEN: Abschlussgrund = {
  code: 'abgebrochen-von-aussen', endzustand: 'abgebrochen',
  anweisung: 'Der Lauf wurde von aussen abgebrochen.',
}

export function pruefeBudgets(
  b: Budgets, v: Verbrauch, nutzbaresKontextfenster: number,
): Abschlussgrund | null {
  if (v.runden >= b.runden) {
    return { code: 'runden-erschoepft', endzustand: 'fertig',
      anweisung: `Das Rundenbudget von ${b.runden} Zuegen ist erschoepft. ${ABSCHLUSS}` }
  }
  if (v.verstricheneMs >= b.wanduhrMs) {
    return { code: 'zeit-erschoepft', endzustand: 'fertig',
      anweisung: `Das Zeitbudget von ${Math.round(b.wanduhrMs / 1000)} Sekunden ist erschoepft. ${ABSCHLUSS}` }
  }
  if (v.kostenCent >= b.kostenCent) {
    // The table's date rides along: the arithmetic is certain, the table is not.
    return { code: 'kosten-erschoepft', endzustand: 'fertig',
      anweisung: `Das Kostenbudget von ${b.kostenCent} Cent ist erschoepft ` +
        `(Preistabelle ${PREISTABELLE_STAND}). ${ABSCHLUSS}` }
  }
  const schwelle = nutzbaresKontextfenster * b.kontextAnteil
  if (v.letzteEingabeToken >= schwelle) {
    return { code: 'kontext-erschoepft', endzustand: 'fertig',
      anweisung: `Der Kontext ist zu ${Math.round(b.kontextAnteil * 100)} Prozent gefuellt ` +
        `(${v.letzteEingabeToken} von ${nutzbaresKontextfenster} Token). ${ABSCHLUSS}` }
  }
  return null
}

/**
 * Truncation is a transport failure, not a format break — and the stop reason is read *before*
 * any repair decision, so the one repair attempt is not burned on a problem no amount of
 * thinking solves (M8 section 4.8).
 */
export function grundFuerStopGrund(s: ModelAntwort['stopGrund']): Abschlussgrund | null {
  if (s.normalisiert !== 'laenge') return null
  return {
    code: 'transportfehler', endzustand: 'abgebrochen',
    anweisung: `Die Antwort wurde abgeschnitten (${s.roh}). Das ist ein Transportfehler; ` +
      `ein Reparaturversuch loest ihn nicht.`,
  }
}
