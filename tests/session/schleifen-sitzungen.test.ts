import { describe, it, expect } from 'vitest'
import { neuesRegister, pruefeZelleFrei } from '../../src/main/session/schleifen-sitzungen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zelle = (over: Partial<any> = {}) => ({
  name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
  zustand: 'leerlaufend' as const, laufId: null, letzterEndzustand: null, ...over,
})

describe('das Zellenregister', () => {
  it('nimmt einen Auftrag an, solange die Zelle leerlaeuft', () => {
    const r = neuesRegister()
    r.setze(zelle())
    expect(pruefeZelleFrei('z1', r).ok).toBe(true)
  })

  it('lehnt einen zweiten Auftrag benannt ab, solange einer faehrt', () => {
    const r = neuesRegister()
    r.setze(zelle({ zustand: 'laeuft', laufId: 'l1' }))
    const p = pruefeZelleFrei('z1', r)
    expect(p.ok).toBe(false)
    // Benannt, nicht still verworfen: der Auftrag darf nicht verschwinden, ohne dass es jemand
    // erfaehrt — dieselbe Form wie pruefeLaufLaeuftNicht.
    if (!p.ok) expect(p.meldung).toContain('laeuft bereits')
  })

  it('lehnt einen Auftrag an eine unbekannte Zelle benannt ab', () => {
    const p = pruefeZelleFrei('gibtsnicht', neuesRegister())
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.meldung).toContain('gibtsnicht')
  })

  it('behaelt die laufId, wenn die Zelle leerlaeuft — weiterOderFrisch braucht sie', () => {
    const r = neuesRegister()
    r.setze(zelle({ zustand: 'laeuft', laufId: 'l1' }))
    r.setzeZustand('z1', 'leerlaufend', 'ziel-erreicht')
    expect(r.hole('z1')!.laufId).toBe('l1')
    expect(r.hole('z1')!.letzterEndzustand).toBe('ziel-erreicht')
  })
})
