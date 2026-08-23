import { describe, it, expect } from 'vitest'
import { baueSchleifenSitzung } from '../../src/main/session/schleifen-start'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const def = {
  id: 'keel-arbeiter', body: 'BODY', persona: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rahmen: { capabilityNiveau: CapabilityNiveau.B } as any,
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eintrag = { id: 'm1', art: 'local-http' } as any

describe('baueSchleifenSitzung', () => {
  it('scheitert benannt ohne Registry-Eintrag', () => {
    const e = baueSchleifenSitzung({ name: 'z1', cwd: '/p', entityId: 'keel-arbeiter', def, eintrag: null })
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.meldung).toContain('Einstellungen')
  })

  it('baut Zelle und Praefixteile aus der Entitaetsdefinition', () => {
    const e = baueSchleifenSitzung({ name: 'z1', cwd: '/p', entityId: 'keel-arbeiter', def, eintrag })
    expect(e.ok).toBe(true)
    if (e.ok) {
      expect(e.zelle.zustand).toBe('leerlaufend')
      expect(e.zelle.laufId).toBeNull()
      expect(e.zelle.eintragId).toBe('m1')
      expect(e.praefix.body).toBe('BODY')
      expect(e.praefix.persona).toBe('')
    }
  })
})
