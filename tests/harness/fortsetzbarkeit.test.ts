import { describe, it, expect } from 'vitest'
import { weiterOderFrisch, FOLGE_RESERVE } from '../../src/main/harness/fortsetzbarkeit'
import type { Ereignis } from '../../src/main/harness/ereignisse'

const BUDGETS = { runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8 }
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
