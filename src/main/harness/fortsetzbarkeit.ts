/**
 * fortsetzbarkeit — ob ein zweiter Auftrag in denselben Lauf darf.
 *
 * **Es erfindet keine zweite Budgetlogik.** Es fragt die bestehende (`pruefeBudgets`) mit
 * knapperem Mass: waere dieser Lauf schon im Abschlussverhalten, wenn seine Budgets um
 * FOLGE_RESERVE kleiner waeren? Dann traegt er keinen zweiten Auftrag mehr.
 *
 * Geprueft werden **alle vier** Budgets, nicht nur der Kontext: ein fortgesetzter Lauf erbt
 * Runden, Zeit und Kosten, weil verbrauchAusEreignissen kumulativ zaehlt.
 *
 * Damit steht nirgends eine Modellgroesse. Das 27B mit knappem Fenster faellt nach einem echten
 * Lauf auf `frisch`; ein Modell mit grossem Fenster und leichtem Auftrag fuehrt fort. Der
 * Schalter ist die Messung, nicht der Modellname.
 */

import type { Ereignis } from './ereignisse'
import { pruefeBudgets, type Budgets } from './budget'
import { verbrauchAusEreignissen } from './verbrauch'

/**
 * Wie viel jedes Budgets frei sein muss, damit ein Folgeauftrag hineindarf.
 *
 * **Geschaetzt, nicht gemessen.** Ein Viertel ist die Groessenordnung, in der ein Auftrag noch
 * mehr als eine Runde bekommt, ohne dass ein Lauf zur Dauereinrichtung wird. Wer das nachmisst,
 * ersetzt diesen Absatz durch die Zahl und das Datum — und nicht umgekehrt.
 */
export const FOLGE_RESERVE = 0.25

export function weiterOderFrisch(
  ereignisse: Ereignis[], modellId: string, budgets: Budgets,
  nutzbaresKontextfenster: number, jetztMs: number,
): { weiter: boolean; grund: string } {
  // Ohne run.started gibt es keinen Lauf, in den etwas hineinkoennte. Das ist kein Fehler,
  // sondern der Normalfall der ersten Beauftragung einer Zelle.
  if (!ereignisse.some(e => e.art === 'run.started')) {
    return { weiter: false, grund: 'Die Zelle hat noch keinen Lauf.' }
  }

  const knapp: Budgets = {
    runden: budgets.runden * (1 - FOLGE_RESERVE),
    wanduhrMs: budgets.wanduhrMs * (1 - FOLGE_RESERVE),
    kostenCent: budgets.kostenCent * (1 - FOLGE_RESERVE),
    kontextAnteil: budgets.kontextAnteil * (1 - FOLGE_RESERVE),
  }
  const verbrauch = verbrauchAusEreignissen(ereignisse, modellId, jetztMs)
  const grund = pruefeBudgets(knapp, verbrauch, nutzbaresKontextfenster)
  if (grund) return { weiter: false, grund: grund.anweisung }
  return { weiter: true, grund: '' }
}
