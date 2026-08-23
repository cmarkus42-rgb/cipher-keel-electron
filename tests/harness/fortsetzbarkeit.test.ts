import { describe, it, expect } from 'vitest'
import { weiterOderFrisch, FOLGE_RESERVE } from '../../src/main/harness/fortsetzbarkeit'
import { STANDARD_BUDGETS } from '../../src/main/harness-sitzung'
import type { Ereignis } from '../../src/main/harness/ereignisse'

// Die echte Konstante, nicht ein Nachbau: `grep -rn STANDARD_BUDGETS tests/` war vor diesem
// Import leer, und ein wortgleicher Literal-Nachbau haette eine Aenderung an
// harness-sitzung.ts nicht bemerkt -- derselbe Fehler, den `werkzeugliste.test.ts` schon einmal
// gemacht hat (siehe dessen Kommentar). Die „wortwoertlich"-Tests unten (9, 675.000, 150, ...)
// rechnen von hier weiter; wer STANDARD_BUDGETS aendert, sieht sie rot, nicht nur den Import.
const BUDGETS = STANDARD_BUDGETS
const FENSTER = 32_000
const START = Date.parse('2026-08-23T10:00:00.000Z')

let n = 0
const ev = (art: Ereignis['art'], nutzlast: Record<string, unknown>, ts = START): Ereignis =>
  ({ laufId: 'l1', seq: ++n, ts: new Date(ts).toISOString(), art, nutzlast })

const antwort = (eingabeToken: number) =>
  ev('model.answered', { usage: { eingabeToken, ausgabeToken: 100 } })

describe('weiterOderFrisch', () => {
  it('fuehrt fort, solange in jedem Budget Reserve steht', () => {
    const e = [ev('run.started', {}), antwort(2_000)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 10_000)
    expect(r.weiter).toBe(true)
  })

  it('faengt frisch an, wenn der Kontext zu voll ist', () => {
    // Schwelle bei Reserve: 32000 * 0.8 * (1 - FOLGE_RESERVE)
    const knapp = Math.ceil(FENSTER * BUDGETS.kontextAnteil * (1 - FOLGE_RESERVE)) + 1
    const e = [ev('run.started', {}), antwort(knapp)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 10_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Kontext')
  })

  /**
   * Der Punkt, den nur ein Kontexttest verfehlen wuerde: ein fortgesetzter Lauf ERBT Runden,
   * Zeit und Kosten, weil verbrauchAusEreignissen kumulativ zaehlt. Genau die Fehlersorte, die
   * diese Strecke dreimal bezahlt hat — eine Zahl, die fuer einen Verbraucher richtig war, gilt
   * fuer den zweiten nicht.
   */
  it('faengt frisch an, wenn die Runden knapp sind, obwohl der Kontext leer ist', () => {
    const noetig = Math.ceil(BUDGETS.runden * (1 - FOLGE_RESERVE))
    const e: Ereignis[] = [ev('run.started', {})]
    for (let i = 0; i < noetig; i++) e.push(antwort(10))
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 1_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Rundenbudget')
  })

  it('faengt frisch an, wenn die Wanduhr knapp ist', () => {
    const e = [ev('run.started', {}), antwort(10)]
    const spaet = START + Math.ceil(BUDGETS.wanduhrMs * (1 - FOLGE_RESERVE))
    expect(weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, spaet).weiter).toBe(false)
  })

  it('faengt frisch an, wenn es gar keinen vorherigen Lauf gibt', () => {
    expect(weiterOderFrisch([], 'm1', BUDGETS, FENSTER, START).weiter).toBe(false)
  })
})

/**
 * Die Tests oben rechnen ihre Schwelle aus der importierten FOLGE_RESERVE selbst aus
 * (`BUDGETS.runden * (1 - FOLGE_RESERVE)`). Damit wandert die Schwelle mit der Konstanten mit,
 * und ein solcher Test kann `0.25` nicht von `0` unterscheiden — er behauptet nur „es wird
 * ueberhaupt eine Reserve angewandt", nicht „die Reserve betraegt ein Viertel". Das haelt die
 * *Struktur* (alle vier Budgets werden gestaucht, nicht nur der Kontext) und bleibt unabhaengig
 * vom Zahlenwert richtig — deshalb bleiben diese Tests stehen.
 *
 * Die Tests hier nageln zusaetzlich den *Wert* fest: die Zahlen 9, 8, 675_000, 674_999, 19_200,
 * 19_199, 150 und 149 stehen wortwoertlich da, nicht als Rechnung ueber FOLGE_RESERVE. Sie
 * brechen deshalb absichtlich, wenn jemand FOLGE_RESERVE aendert — das ist ihr Zweck: der Wert
 * ist eine Entscheidung, keine Stellschraube, und wer ihn aendert, soll es an einem roten Test
 * merken und den Eintrag in docs/anpassbare-flaechen.md mitziehen. Beide Testsorten braucht es:
 * die oberen halten die Verdrahtung (alle vier Budgets werden gestaucht), diese hier halten den
 * Wert — und zwar fuer alle vier: Runden, Wanduhr, Kontext und Kosten.
 */
describe('weiterOderFrisch — der Wert der Reserve, nicht nur ihre Verdrahtung', () => {
  it('faengt bei genau neun verbrauchten Runden frisch an (12 * 0.75 = 9, wortwoertlich)', () => {
    const e: Ereignis[] = [ev('run.started', {})]
    for (let i = 0; i < 9; i++) e.push(antwort(10))
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 1_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Rundenbudget')
  })

  it('fuehrt bei acht verbrauchten Runden noch fort (eine Runde unter der Schwelle)', () => {
    const e: Ereignis[] = [ev('run.started', {})]
    for (let i = 0; i < 8; i++) e.push(antwort(10))
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 1_000)
    expect(r.weiter).toBe(true)
  })

  it('faengt bei genau 675.000 ms Wanduhr frisch an (900.000 * 0.75, wortwoertlich)', () => {
    const e = [ev('run.started', {}), antwort(10)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 675_000)
    expect(r.weiter).toBe(false)
  })

  it('fuehrt bei 674.999 ms Wanduhr noch fort (eine Millisekunde unter der Schwelle)', () => {
    const e = [ev('run.started', {}), antwort(10)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 674_999)
    expect(r.weiter).toBe(true)
  })

  /**
   * Rechnerisch liegt die Schwelle bei 32.000 * 0.8 * 0.75 = 19.200 — aber `knapp.kontextAnteil`
   * wird als eigener Gleitkommawert gebildet (`0.8 * 0.75`), und dessen Produkt mit dem Fenster
   * rundet in IEEE754 auf 19200.000000000004, nicht exakt auf 19200 (nachgemessen: `node -e
   * "console.log(32000 * (0.8 * 0.75))"`). Exakt 19.200 Token loesen die Schwelle deshalb noch
   * NICHT aus; 19.201 ist der kleinste ganzzahlige Wert, der sie sicher ueberschreitet.
   */
  it('faengt bei 19.201 eingehenden Token frisch an (Schwelle rechnerisch 19.200, real 19200.000000000004)', () => {
    const e = [ev('run.started', {}), antwort(19_201)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 10_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Kontext')
  })

  it('fuehrt bei 19.199 eingehenden Token noch fort (ein Token unter der Schwelle)', () => {
    const e = [ev('run.started', {}), antwort(19_199)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 10_000)
    expect(r.weiter).toBe(true)
  })

  /**
   * 'm1' steht nicht in VORGABE_PREISE — kostenCent() liefert dafuer 0, ein model.answered
   * traegt hier also nie Kosten ins Protokoll. unterlauf.verbraucht umgeht die Preistabelle
   * ganz: verbrauchAusEreignissen addiert dessen kostenCent direkt (siehe verbrauch.ts). Das
   * macht diesen Test zugleich robuster als einer ueber model.answered waere — er haengt an
   * keiner Tabelle, die sich mit der Zeit aendert.
   */
  it('faengt bei genau 150 Cent Unterlaufkosten frisch an (200 * 0.75, wortwoertlich)', () => {
    const e: Ereignis[] = [
      ev('run.started', {}),
      ev('unterlauf.verbraucht', { unterLaufId: 'u1', kostenCent: 150, runden: 1 }),
    ]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 1_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Kostenbudget')
  })

  it('fuehrt bei 149 Cent Unterlaufkosten noch fort (ein Cent unter der Schwelle)', () => {
    const e: Ereignis[] = [
      ev('run.started', {}),
      ev('unterlauf.verbraucht', { unterLaufId: 'u1', kostenCent: 149, runden: 1 }),
    ]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 1_000)
    expect(r.weiter).toBe(true)
  })
})

/**
 * `STANDARD_BUDGETS` selbst, direkt und wertfest -- nicht nur ueber die abgeleiteten Schwellen
 * oben. Die Zahlen hier stehen auch in `fortsetzbarkeit.ts` (Kommentar zur Beweisfahrt),
 * `docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md` und README.md als
 * Feldzahlen ("675 s / 9 Runden"). Bricht dieser Test, muessen die mitgezogen werden.
 */
describe('STANDARD_BUDGETS — die Werte, die die Tests oben voraussetzen', () => {
  it('hat exakt die vier Werte, auf denen 9 Runden / 675.000 ms / 150 Cent / 19.200 Token beruhen', () => {
    expect(STANDARD_BUDGETS).toEqual({
      runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8,
    })
  })
})
