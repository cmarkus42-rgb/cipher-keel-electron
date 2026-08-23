import { describe, it, expect } from 'vitest'
import { baueSchleifenSitzung } from '../../src/main/session/schleifen-start'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { RollenTyp, type PresetRahmen } from '../../src/main/preset/schema'
import type { EntityDefinition } from '../../src/main/preset/registry'
import type { ModellEintrag } from '../../src/main/model/entry'

// Full literals, not `as any` (M-5, Task 6 review): a typo in either object is now a
// compile error instead of silently passing through.
const rahmen: PresetRahmen = {
  id: 'keel-arbeiter', name: 'keel-Arbeiter', rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: [], capabilityAnbindung: ['ka-testpaket'],
  graphAnbindung: { lesen: false, schreiben: false },
  personaVorgabe: '', runtime: 'keel-harness', model: '',
  capabilityNiveau: CapabilityNiveau.B, harnessBindung: '',
}
const def: EntityDefinition = { id: 'keel-arbeiter', body: 'BODY', persona: null, rahmen }
const eintrag: ModellEintrag = {
  id: 'm1', name: 'Testmodell', art: 'local-http',
  erreichbarkeit: { art: 'local-http', host: 'localhost', port: 11434, model: 'test' },
  oertlichkeit: 'lokal', erklaertext: '', empfehlung: '',
}

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
