import { describe, it, expect } from 'vitest'
import { getEntityRahmen, getEntityDefinition } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { isKnownPresetId } from '../../src/shared/preset-catalog'

describe('Preset keel-arbeiter', () => {
  it('erklaert die eigene Laufzeit und Niveau B', () => {
    const r = getEntityRahmen('keel-arbeiter', CapabilityNiveau.B)!
    expect(r.runtime).toBe('keel-harness')
    expect(r.capabilityNiveau).toBe(CapabilityNiveau.B)
  })

  it('nennt kein Modell — das entscheidet der Zuordnungsplatz', () => {
    // Zwei Antworten auf eine Frage sind eine zu viel. Der Platz sitzung:niveau-b ist die eine.
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      expect(getEntityRahmen('keel-arbeiter', n)!.model).toBe('')
    }
  })

  it('hat einen nicht-leeren Body und steht im Launcher-Katalog', () => {
    expect(getEntityDefinition('keel-arbeiter', CapabilityNiveau.B)!.body.length).toBeGreaterThan(0)
    expect(isKnownPresetId('keel-arbeiter')).toBe(true)
  })
})
