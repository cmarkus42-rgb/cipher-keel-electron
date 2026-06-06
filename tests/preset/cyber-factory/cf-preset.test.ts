// tests/preset/cyber-factory/cf-preset.test.ts
import { describe, it, expect } from 'vitest'
import {
  CF_CAPABILITIES,
  CF_RAHMEN,
  createCfRahmen,
  getCfMaxWorkers,
} from '../../../src/main/preset/cyber-factory/cf-preset'
import { validatePresetRahmen, RollenTyp } from '../../../src/main/preset/schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('CF Preset Registration (CK-P3CF-001)', () => {
  it('CF_RAHMEN validates against schema', () => {
    const result = validatePresetRahmen(CF_RAHMEN)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('has correct id and name', () => {
    expect(CF_RAHMEN.id).toBe('cyber-factory')
    expect(CF_RAHMEN.name).toBe('Cyber Factory')
  })

  it('is PhasenEntitaet bound to development', () => {
    expect(CF_RAHMEN.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
    expect(CF_RAHMEN.phasenBindung).toEqual(['development'])
  })

  it('has graphAnbindung lesen+schreiben both true', () => {
    expect(CF_RAHMEN.graphAnbindung).toEqual({ lesen: true, schreiben: true })
  })

  it('uses cipher persona', () => {
    expect(CF_RAHMEN.personaVorgabe).toBe('cipher')
  })

  it('defaults to standard model (Sonnet)', () => {
    expect(CF_RAHMEN.model).toBe('')  // empty = harness default = Sonnet
  })

  it('has 8 capability packages', () => {
    expect(CF_CAPABILITIES).toHaveLength(8)
  })
})

describe('CF Niveau differentiation (CK-P3CF-008, CK-P3CF-010)', () => {
  it('Niveau A gets all 8 capabilities', () => {
    const rahmen = createCfRahmen(CapabilityNiveau.A)
    expect(rahmen.capabilityAnbindung).toHaveLength(8)
  })

  it('Niveau B gets 5 capabilities', () => {
    const rahmen = createCfRahmen(CapabilityNiveau.B)
    expect(rahmen.capabilityAnbindung).toHaveLength(5)
    const names = rahmen.capabilityAnbindung
    expect(names).not.toContain('model-routing-guide')
    expect(names).not.toContain('risk-review-guide')
    expect(names).not.toContain('graph-navigation')
  })

  it('Niveau C gets 1 capability (cf-core-identity)', () => {
    const rahmen = createCfRahmen(CapabilityNiveau.C)
    expect(rahmen.capabilityAnbindung).toHaveLength(1)
    expect(rahmen.capabilityAnbindung[0]).toBe('cf-core-identity')
    expect(rahmen.name).toBe('Development-Worker-Modus')
  })

  it('Niveau A max 5 workers', () => {
    expect(getCfMaxWorkers(CapabilityNiveau.A)).toBe(5)
  })

  it('Niveau B max 2 workers', () => {
    expect(getCfMaxWorkers(CapabilityNiveau.B)).toBe(2)
  })

  it('Niveau C max 1 worker (self)', () => {
    expect(getCfMaxWorkers(CapabilityNiveau.C)).toBe(1)
  })

  it('all niveau configs validate', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      const result = validatePresetRahmen(createCfRahmen(n))
      expect(result.valid).toBe(true)
    }
  })
})
