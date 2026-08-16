import { describe, it, expect } from 'vitest'
import { DEFAULT_EINTRAEGE } from '../../src/main/model/defaults'

describe('bundled default entries', () => {
  it('has unique ids', () => {
    const ids = DEFAULT_EINTRAEGE.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries no measured capability row — nothing has been measured by a canary yet', () => {
    const gemessen = DEFAULT_EINTRAEGE.filter(e => e.faehigkeiten?.quelle === 'gemessen')
    expect(gemessen.map(e => e.id)).toEqual([])
  })

  it('holds no secret — api entries name a keyRef instead', () => {
    for (const e of DEFAULT_EINTRAEGE) {
      if (e.erreichbarkeit.art === 'api') {
        expect(e.erreichbarkeit.keyRef).toBeTruthy()
        expect(JSON.stringify(e)).not.toMatch(/sk-|api[_-]?key["' ]*[:=]/i)
      }
    }
  })

  it('covers all three provider kinds', () => {
    expect(new Set(DEFAULT_EINTRAEGE.map(e => e.art)))
      .toEqual(new Set(['cli-harness', 'local-http', 'api']))
  })

  it('gives every entry prose — the user wants to read why', () => {
    for (const e of DEFAULT_EINTRAEGE) {
      expect(e.erklaertext.length, `${e.id} ohne erklaertext`).toBeGreaterThan(0)
      expect(e.empfehlung.length, `${e.id} ohne empfehlung`).toBeGreaterThan(0)
    }
  })
})
