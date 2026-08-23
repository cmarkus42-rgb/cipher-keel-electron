/**
 * verbrauch — wie viel ein Lauf verbraucht hat, rekonstruiert aus seinem Ereignisprotokoll.
 *
 * Eigenes Modul und nicht mehr eine Funktion in lauf.ts: der Rechercheur muss den Verbrauch
 * seines Unterlaufs ausrechnen, um ihn dem Elternlauf anzuschreiben, und lauf.ts importiert
 * rechercheur.ts — ein Import in die Gegenrichtung waere ein Zyklus in genau den zwei Modulen,
 * die die Kapselung tragen. lauf.ts reicht die Funktion unveraendert weiter, damit die bisherigen
 * Importstellen bleiben, wo sie sind.
 */

import type { Ereignis } from './ereignisse'
import type { Verbrauch } from './budget'
import { kostenCent, VORGABE_PREISE, type Preis } from './preise'

/**
 * Reconstruct consumption from the event log rather than carrying it in a variable across turns
 * — the same rule the rest of the loop follows for the conversation itself. Pure: events in,
 * `Verbrauch` out, nothing read from anywhere else.
 *
 * - Rounds are the count of `model.answered` events — one per turn actually taken.
 * - Context fill is the *last* answer's input token count, not a sum: it is a level, not an
 *   amount, and the provider reports the whole conversation's size on every turn.
 * - Cost is a sum: every turn's tokens are billed once and stay billed. **Dazu die Kosten der
 *   Unterlaeufe** (`unterlauf.verbraucht`, geschrieben von rechercheur.ts): deren `model.answered`
 *   stehen unter einer anderen laufId und sind hier nicht zu sehen. Ohne diesen Posten war der
 *   ganze Verbrauch eines Unterlaufs fuer das Kostenbudget des Hauptlaufs unsichtbar — gemessen:
 *   acht `recherchieren`-Aufrufe in einer Antwort, neun Laeufe, und `pruefeBudgets` schlug nie an.
 * - Elapsed wall time is measured from `run.started`'s own timestamp, not from when this
 *   function happens to run. That is a deliberate reading of "wall clock", not the only
 *   possible one: it counts time the run spent not running at all, between a crash and its
 *   resumption, as budget spent. A run that has been dead for an hour has used an hour of
 *   wall clock either way.
 */
export function verbrauchAusEreignissen(
  ereignisse: Ereignis[], modellId: string, jetztMs: number,
  tabelle: Record<string, Preis> = VORGABE_PREISE,
): Verbrauch {
  const gestartet = ereignisse.find(e => e.art === 'run.started')
  const begonnenMs = gestartet ? Date.parse(gestartet.ts) : jetztMs

  let runden = 0
  let kostenGesamt = 0
  let letzteEingabeToken = 0
  for (const e of ereignisse) {
    if (e.art === 'unterlauf.verbraucht') {
      const wert = e.nutzlast.kostenCent
      // Nur eine endliche Zahl zaehlt. Ein Wurf waere hier falsch, so gern dieses Repo Fehler
      // benennt: diese Funktion laeuft mitten in `fahre()`, und eine Ausnahme daraus liesse den
      // Lauf ohne `run.finished` fuer immer auf „laeuft" stehen — genau der Fehlermodus, den
      // lauf.ts zweimal geschlossen hat. Geschrieben wird das Feld von rechercheur.ts als Zahl;
      // eine andere Form kann nur aus einem von Hand gebauten Protokoll kommen.
      if (typeof wert === 'number' && Number.isFinite(wert)) kostenGesamt += wert
      continue
    }
    if (e.art !== 'model.answered') continue
    runden += 1
    const usage = e.nutzlast.usage as { eingabeToken: number; ausgabeToken: number } | undefined
    if (usage) {
      kostenGesamt += kostenCent(modellId, usage, tabelle)
      letzteEingabeToken = usage.eingabeToken
    }
  }

  return { runden, verstricheneMs: jetztMs - begonnenMs, kostenCent: kostenGesamt, letzteEingabeToken }
}
