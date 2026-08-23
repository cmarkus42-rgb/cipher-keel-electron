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
 * Damit steht nirgends eine Modellgroesse: wer Platz hat, fuehrt fort; wer keinen hat, faengt
 * frisch an. Der Schalter ist die Messung, nicht der Modellname.
 *
 * **Korrektur vom 2026-08-23, in der Beweisfahrt zu Task 11 gemessen.** Hier stand bis zuletzt
 * der Satz *"Das 27B mit knappem Fenster faellt nach einem echten Lauf auf `frisch`"* — als
 * Beispiel fuer den Mechanismus und als Grund, den `weiter`-Zweig im Feld fuer mit diesem Modell
 * ueberhaupt nicht fahrbar zu halten.
 *
 * **Das war ungeprueft behauptet, und es war falsch.** `spark-qwen38-27b` traegt
 * `nutzbaresKontextfenster: 65536` (`model/defaults.ts`, `quelle: 'vermutet'`); die Schwelle
 * liegt bei 65536 * 0,8 * 0,75 = 39.322 Token. Gemessen wurden 1.700-1.900 Token je Zug. Fuenf
 * aufeinanderfolgende echte Auftraege in dieselbe Zelle liefen deshalb alle in denselben Lauf —
 * vier davon als echter Folgeauftrag (der erste Auftrag hatte den Lauf erst eroeffnet) —, jeweils
 * gegen `harness.db` geprueft, nicht gegen den Fenstertext.
 *
 * Der Mechanismus ist damit **bestaetigt, nicht widerlegt**: er hat gemessen entschieden, und die
 * Messung fiel anders aus als die Annahme. Falsch war die Illustration, nicht die Regel — und
 * genau deshalb steht sie hier korrigiert statt geloescht. (Am naechsten waere ein sechster oder
 * siebter Auftrag ohnehin nicht am Kontext gekippt: Runden lagen bei 5 von 9 knappen, Wanduhrzeit
 * bei rund 61 Prozent der knappen 675 Sekunden, Kontext bei unter 5 Prozent der knappen 39.322
 * Token. Siehe `docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md`.)
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
