import { describe, it, expect, vi } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { istSchleifenAdapter } from '../../src/main/agent/agent-adapter'

// isCommandOnPath drives every currently-registered adapter's isAvailable() (ClaudeCodeAdapter
// calls it directly). Mocked so the third describe block below can assert both directions of
// the nichtVerfuegbarGrund() contract without depending on whether `claude` happens to be on
// this machine's PATH (M-3 fix-review finding) — a future adapter whose isAvailable() does not
// go through isCommandOnPath would not be covered by this override and needs its own test.
vi.mock('../../src/main/util/exec-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/util/exec-util')>()
  return { ...actual, isCommandOnPath: vi.fn(actual.isCommandOnPath) }
})
import { isCommandOnPath } from '../../src/main/util/exec-util'

const leserOhneArgumente = { getStartArgs: () => [] as string[] }

// Die Sitzungsart ist das Diskriminanzfeld, an dem SESSION_CREATE einengt. Ein Adapter ohne
// sie faellt dort in keinen Zweig — und ein `default`, das ihn auffinge, waere genau das stille
// Durchfallen, gegen das diese Trennung antritt. Der Test laeuft ueber *jeden* registrierten
// Adapter, nicht ueber eine Liste, die jemand pflegen muss.
describe('jeder registrierte Adapter erklaert seine Sitzungsart', () => {
  it('nennt fuer jede Id eine der beiden Arten', () => {
    const registry = new AdapterRegistry(leserOhneArgumente)
    // Der explizite `: boolean`-Rueckgabetyp ist noetig, weil TS ab 5.5 aus einer
    // Bedingung, die alle Werte eines geschlossenen Literal-Unions ausschliesst, sonst
    // automatisch einen Typprädikat ableitet und den Elementtyp auf `never` zusammenzieht —
    // das Prädikat waere dann immer "leer" und `.map(a => a.id)` liesse sich nicht mehr
    // pruefen, obwohl der Vergleich selbst genau das tut, was der Test verlangt.
    const ohneArt = registry.listIds()
      .map(id => registry.get(id)!)
      .filter((a): boolean => a.sitzungsart !== 'fremdes-cli' && a.sitzungsart !== 'eigene-schleife')
    expect(ohneArt.map(a => a.id)).toEqual([])
  })

  it('der Typwaechter trennt anhand einer echten Faehigkeit, nicht nur seines eigenen Vergleichs', () => {
    // istSchleifenAdapter ist selbst als `sitzungsart === 'eigene-schleife'` implementiert —
    // ihn gegen genau diesen Ausdruck zu pruefen, behauptet nichts (M-2 fix-review finding).
    // Stattdessen: die beiden Sitzungsarten haben disjunkte Methodenmengen (CliSitzungsAdapter
    // hat buildLaunchCommand und keine starteAuftrag/brichAb, SchleifenSitzungsAdapter
    // umgekehrt) — der Typwaechter muss mit dieser echten Formunterscheidung uebereinstimmen.
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      if (istSchleifenAdapter(a)) {
        expect(typeof a.starteAuftrag).toBe('function')
        expect('buildLaunchCommand' in a).toBe(false)
      } else {
        expect(typeof a.buildLaunchCommand).toBe('function')
        expect('starteAuftrag' in a).toBe(false)
      }
    }
  })
})

describe('jeder Adapter kann sagen, warum er nicht verfuegbar ist', () => {
  it('meldet null, wenn der Adapter verfuegbar ist', () => {
    vi.mocked(isCommandOnPath).mockReturnValue(true)
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      expect(a.isAvailable()).toBe(true)
      expect(a.nichtVerfuegbarGrund()).toBeNull()
    }
  })

  it('meldet einen nicht-leeren Grund, wenn der Adapter nicht verfuegbar ist', () => {
    // Nicht geprueft: dass der Grund deutsch ist. Die Hausregel verlangt das (was einen
    // Nutzer erreicht, ist deutsch), aber ein Lauf ueber jeden registrierten Adapter kennt
    // dessen Texte nicht im Voraus und kann Sprache nicht generisch pruefen — nur, dass
    // ueberhaupt ein Grund da ist. Ein Adapter, der `false` meldet und dazu schweigt, laesst
    // SESSION_CREATE wieder einen Text erfinden, den der Adapter besser weiss.
    vi.mocked(isCommandOnPath).mockReturnValue(false)
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      expect(a.isAvailable()).toBe(false)
      const grund = a.nichtVerfuegbarGrund()
      expect(typeof grund === 'string' && grund.length > 0).toBe(true)
    }
  })
})
