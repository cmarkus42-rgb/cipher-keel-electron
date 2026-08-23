import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { istSchleifenAdapter } from '../../src/main/agent/agent-adapter'

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

  it('der Typwaechter trennt genau entlang der Sitzungsart', () => {
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      expect(istSchleifenAdapter(a)).toBe(a.sitzungsart === 'eigene-schleife')
    }
  })

  it('jeder Adapter kann sagen, warum er nicht verfuegbar ist', () => {
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      // Verfuegbar -> null. Nicht verfuegbar -> ein nicht-leerer deutscher Grund.
      // Ein Adapter, der `false` meldet und dazu schweigt, laesst SESSION_CREATE
      // wieder einen Text erfinden, den der Adapter besser weiss.
      const grund = a.nichtVerfuegbarGrund()
      if (a.isAvailable()) expect(grund).toBeNull()
      else expect(typeof grund === 'string' && grund.length > 0).toBe(true)
    }
  })
})
