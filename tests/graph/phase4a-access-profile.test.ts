import { describe, it, expect } from 'vitest'
import { deriveProfile } from '../../src/main/graph/access-profile'
import { RollenTyp } from '../../src/main/preset/schema'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import type { PresetRahmen } from '../../src/main/preset/schema'

function makeRahmen(overrides: Partial<PresetRahmen> = {}): PresetRahmen {
  return {
    id: 'test',
    name: 'Test',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['architecture'],
    capabilityAnbindung: ['cap-1'],
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: '',
    runtime: '',
    model: '',
    capabilityNiveau: CapabilityNiveau.A,
    harnessBindung: '',
    ...overrides,
  }
}

describe('deriveProfile — graphAnbindung override (DE-2)', () => {
  it('PhasenEntitaet with graphAnbindung lesen:true gets read:wide', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: true, schreiben: false },
    }))
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('phase-scoped')
  })

  it('PhasenEntitaet with graphAnbindung schreiben:true gets write:full', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: false, schreiben: true },
    }))
    expect(profile.write).toBe('full')
  })

  it('PhasenEntitaet with both lesen+schreiben true gets read:wide write:full', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: true, schreiben: true },
    }))
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })

  it('PhasenEntitaet with both false falls back to RollenTyp default', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: false, schreiben: false },
    }))
    expect(profile.read).toBe('phase-scoped')
    expect(profile.write).toBe('phase-scoped')
  })

  it('QuerliegenSE ignores override (already wide/full)', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.QuerliegenSE,
      graphAnbindung: { lesen: false, schreiben: false },
    }))
    // QuerliegenSE always gets wide/full regardless
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })
})
