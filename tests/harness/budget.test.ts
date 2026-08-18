import { describe, it, expect } from 'vitest'
import { kostenCent, PREISTABELLE_STAND, VORGABE_PREISE } from '../../src/main/harness/preise'
import {
  pruefeBudgets, grundFuerStopGrund, ZIEL_ERREICHT,
} from '../../src/main/harness/budget'

const BUDGETS = { runden: 12, wanduhrMs: 600_000, kostenCent: 100, kontextAnteil: 0.8 }
const FRISCH = { runden: 0, verstricheneMs: 0, kostenCent: 0, letzteEingabeToken: 0 }

describe('kostenCent', () => {
  it('rechnet Ein- und Ausgabe getrennt gegen die Tabelle', () => {
    // claude-opus-5: 1500 cent/M input, 7500 cent/M output
    // 1M input + 0.5M output = 1500 + 3750 = 5250 cent
    const c = kostenCent('claude-opus-5', { eingabeToken: 1_000_000, ausgabeToken: 500_000 }, VORGABE_PREISE)
    expect(c).toBe(5250)
  })

  it('rechnet ein unbekanntes Modell mit null statt zu raten', () => {
    expect(kostenCent('kennt-keiner', { eingabeToken: 1_000_000, ausgabeToken: 1_000_000 }, VORGABE_PREISE))
      .toBe(0)
  })

  it('nennt einen Tabellenstand', () => {
    expect(PREISTABELLE_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('pruefeBudgets', () => {
  it('laesst einen frischen Lauf durch', () => {
    expect(pruefeBudgets(BUDGETS, FRISCH, 100_000)).toBeNull()
  })

  it('schlaegt bei erschoepften Runden an', () => {
    const g = pruefeBudgets(BUDGETS, { ...FRISCH, runden: 12 }, 100_000)
    expect(g?.code).toBe('runden-erschoepft')
  })

  it('schlaegt bei erschoepfter Wanduhr an', () => {
    expect(pruefeBudgets(BUDGETS, { ...FRISCH, verstricheneMs: 600_000 }, 100_000)?.code)
      .toBe('zeit-erschoepft')
  })

  it('nennt im Kostengrund den Tabellenstand mit', () => {
    const g = pruefeBudgets(BUDGETS, { ...FRISCH, kostenCent: 100 }, 100_000)
    expect(g?.code).toBe('kosten-erschoepft')
    expect(g?.anweisung).toContain(PREISTABELLE_STAND)
  })

  it('schlaegt an, wenn der Anteil des Kontextfensters erreicht ist', () => {
    expect(pruefeBudgets(BUDGETS, { ...FRISCH, letzteEingabeToken: 80_000 }, 100_000)?.code)
      .toBe('kontext-erschoepft')
  })

  it('gibt jedem Grund einen Anweisungstext, nicht nur einen Bezeichner', () => {
    const g = pruefeBudgets(BUDGETS, { ...FRISCH, runden: 12 }, 100_000)
    expect(g?.anweisung.length).toBeGreaterThan(40)
  })
})

describe('grundFuerStopGrund', () => {
  it('macht aus Trunkierung einen Transportfehler ohne Reparaturversuch', () => {
    const g = grundFuerStopGrund({ normalisiert: 'laenge', roh: 'max_tokens' })
    expect(g?.code).toBe('transportfehler')
    expect(g?.anweisung).toContain('max_tokens')
  })

  it('laesst ein normales Ende durch', () => {
    expect(grundFuerStopGrund({ normalisiert: 'ende', roh: 'end_turn' })).toBeNull()
  })

  it('laesst einen Werkzeugstopp durch, weil der Zug weitergeht', () => {
    expect(grundFuerStopGrund({ normalisiert: 'werkzeug', roh: 'tool_use' })).toBeNull()
  })

  it('kennt ziel-erreicht als eigenen Grund', () => {
    expect(ZIEL_ERREICHT.code).toBe('ziel-erreicht')
  })
})
