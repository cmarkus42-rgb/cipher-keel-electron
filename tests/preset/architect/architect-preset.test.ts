// tests/preset/architect/architect-preset.test.ts
import { describe, it, expect } from 'vitest'
import {
  ARCHITECT_CAPABILITIES,
  ARCHITECT_RAHMEN,
  createArchitectRahmen,
  getArchitectMaxSubsystems,
} from '../../../src/main/preset/architect/architect-preset'
import { validatePresetRahmen, RollenTyp } from '../../../src/main/preset/schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('Architect Preset Registration (CK-P3A-001)', () => {
  it('ARCHITECT_RAHMEN validates against schema', () => {
    const result = validatePresetRahmen(ARCHITECT_RAHMEN)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('has correct id and name', () => {
    expect(ARCHITECT_RAHMEN.id).toBe('architect')
    expect(ARCHITECT_RAHMEN.name).toBe('Architect')
  })

  it('is PhasenEntitaet bound to architecture', () => {
    expect(ARCHITECT_RAHMEN.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
    expect(ARCHITECT_RAHMEN.phasenBindung).toEqual(['architecture'])
  })

  it('has graphAnbindung lesen+schreiben both true', () => {
    expect(ARCHITECT_RAHMEN.graphAnbindung).toEqual({ lesen: true, schreiben: true })
  })

  it('uses theaitetos persona', () => {
    expect(ARCHITECT_RAHMEN.personaVorgabe).toBe('theaitetos')
  })

  it('defaults to heavy model (Opus)', () => {
    expect(ARCHITECT_RAHMEN.model).toBe('heavy')
  })

  it('defaults to Niveau A', () => {
    expect(ARCHITECT_RAHMEN.capabilityNiveau).toBe(CapabilityNiveau.A)
  })

  it('has 7 capability packages', () => {
    expect(ARCHITECT_CAPABILITIES).toHaveLength(7)
    expect(ARCHITECT_CAPABILITIES).toContain('architect-core-identity')
    expect(ARCHITECT_CAPABILITIES).toContain('subsystem-zerlegung-guide')
    expect(ARCHITECT_CAPABILITIES).toContain('adr-format-guide')
    expect(ARCHITECT_CAPABILITIES).toContain('anforderungspaket-formulierer')
    expect(ARCHITECT_CAPABILITIES).toContain('niveau-c-formulierer')
    expect(ARCHITECT_CAPABILITIES).toContain('coaching-loop-guide')
    expect(ARCHITECT_CAPABILITIES).toContain('rolling-summary')
  })
})

describe('Architect Niveau differentiation (CK-P3A-012, CK-P3A-014)', () => {
  it('Niveau A gets all 7 capabilities', () => {
    const rahmen = createArchitectRahmen(CapabilityNiveau.A)
    expect(rahmen.capabilityAnbindung).toHaveLength(7)
    expect(rahmen.model).toBe('heavy')
  })

  it('Niveau B gets 5 capabilities (no coaching-loop-guide, no rolling-summary)', () => {
    const rahmen = createArchitectRahmen(CapabilityNiveau.B)
    expect(rahmen.capabilityAnbindung).toHaveLength(5)
    expect(rahmen.capabilityAnbindung).not.toContain('coaching-loop-guide')
    expect(rahmen.capabilityAnbindung).not.toContain('rolling-summary')
    expect(rahmen.model).toBe('')  // standard = empty
  })

  it('Niveau C gets 1 capability (architect-core-identity only)', () => {
    const rahmen = createArchitectRahmen(CapabilityNiveau.C)
    expect(rahmen.capabilityAnbindung).toHaveLength(1)
    expect(rahmen.capabilityAnbindung).toContain('architect-core-identity')
  })

  it('Niveau A has unlimited subsystems', () => {
    expect(getArchitectMaxSubsystems(CapabilityNiveau.A)).toBeNull()
  })

  it('Niveau B has max 3 subsystems', () => {
    expect(getArchitectMaxSubsystems(CapabilityNiveau.B)).toBe(3)
  })

  it('Niveau C has max 1 subsystem', () => {
    expect(getArchitectMaxSubsystems(CapabilityNiveau.C)).toBe(1)
  })

  it('all niveau configs validate against schema', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      const result = validatePresetRahmen(createArchitectRahmen(n))
      expect(result.valid).toBe(true)
    }
  })
})
