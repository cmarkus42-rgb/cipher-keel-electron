import { describe, it, expect } from 'vitest'
import { LAEUFER, laeuferKannArt, sperrgrund } from '../../src/main/model/eignung'
import type { Anbieterart } from '../../src/main/model/entry'

const ARTEN: Anbieterart[] = ['cli-harness', 'local-http', 'api']

describe('structural matrix: Laeufer x Anbieterart', () => {
  it('covers all nine cells with a definite answer', () => {
    for (const l of LAEUFER) {
      for (const a of ARTEN) expect(typeof laeuferKannArt(l, a)).toBe('boolean')
    }
  })

  it('lets the foreign CLI drive only a cli-harness model', () => {
    expect(laeuferKannArt('fremdes-cli', 'cli-harness')).toBe(true)
    expect(laeuferKannArt('fremdes-cli', 'local-http')).toBe(false)
    expect(laeuferKannArt('fremdes-cli', 'api')).toBe(false)
  })

  it('lets the own loop and the one-shot runner drive http and api, never a cli harness', () => {
    for (const l of ['eigene-schleife', 'ein-schuss'] as const) {
      expect(laeuferKannArt(l, 'local-http')).toBe(true)
      expect(laeuferKannArt(l, 'api')).toBe(true)
      expect(laeuferKannArt(l, 'cli-harness')).toBe(false)
    }
  })

  it('gives no reason for a cell that is open', () => {
    expect(sperrgrund('ein-schuss', 'api')).toBeNull()
  })

  // The two locked directions have different reasons, and the second is not technical.
  it('says the CLI brings its own model', () => {
    expect(sperrgrund('fremdes-cli', 'local-http')).toMatch(/bringt sein Modell selbst mit/)
  })

  it('says a subscription CLI is never driven through the own loop (M8 section 12)', () => {
    expect(sperrgrund('eigene-schleife', 'cli-harness')).toMatch(/Abo-Kontingent/)
    expect(sperrgrund('eigene-schleife', 'cli-harness')).toMatch(/Nutzungsbedingung/)
  })
})
