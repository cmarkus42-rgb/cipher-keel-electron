import { describe, it, expect } from 'vitest'
import { LAEUFER, laeuferTraegtNiveau, laeuferFaehigkeit } from '../../src/main/model/eignung'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const NIVEAUS = [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]

describe('Niveau against Laeufer', () => {
  // Monotonicity as a property, not as a recomputation: whatever a Laeufer carries, it
  // must also carry everything weaker. A test that rebuilt the expected value from the
  // implementation's own table would pass even if that table were wrong — the repo already
  // has one such test (`niveauMinimum-sync`, which checks a derivation against itself) and
  // it is a known defect, not a model. The anchors are pinned in the tests below.
  it('is monotone: carrying a niveau implies carrying every weaker one', () => {
    const schwaecher: Record<CapabilityNiveau, CapabilityNiveau[]> = {
      [CapabilityNiveau.A]: [CapabilityNiveau.B, CapabilityNiveau.C],
      [CapabilityNiveau.B]: [CapabilityNiveau.C],
      [CapabilityNiveau.C]: [],
    }
    for (const l of LAEUFER) {
      for (const n of NIVEAUS) {
        if (!laeuferTraegtNiveau(l, n)) continue
        for (const schwach of schwaecher[n]) {
          expect(laeuferTraegtNiveau(l, schwach), `${l} traegt ${n}, aber nicht ${schwach}`).toBe(true)
        }
      }
    }
  })

  it('puts the own loop on A — decision E21, not a forecast', () => {
    expect(laeuferFaehigkeit('eigene-schleife')).toBe(CapabilityNiveau.A)
    expect(laeuferTraegtNiveau('eigene-schleife', CapabilityNiveau.A)).toBe(true)
  })

  it('keeps the one-shot runner at C', () => {
    expect(laeuferFaehigkeit('ein-schuss')).toBe(CapabilityNiveau.C)
    expect(laeuferTraegtNiveau('ein-schuss', CapabilityNiveau.B)).toBe(false)
    expect(laeuferTraegtNiveau('ein-schuss', CapabilityNiveau.A)).toBe(false)
  })

  it('allows a niveau below the runner capability — wasteful, not forbidden', () => {
    expect(laeuferTraegtNiveau('fremdes-cli', CapabilityNiveau.C)).toBe(true)
  })
})
