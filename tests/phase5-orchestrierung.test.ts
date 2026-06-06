import { describe, it, expect } from 'vitest'
import { validatePresetRahmen } from '../src/main/preset/schema'
import { createWorkshopRahmen } from '../src/main/preset/workshop/workshop-preset'
import { CF_RAHMEN } from '../src/main/preset/cyber-factory/cf-preset'
import { ARCHITECT_RAHMEN } from '../src/main/preset/architect/architect-preset'
import { SE_RAHMEN } from '../src/main/preset/systems-engineer/se-preset'
import { CapabilityNiveau } from '../src/main/preset/niveau'

describe('orchestrierung field (DE-5)', () => {
  it('PresetRahmen accepts orchestrierung: true', () => {
    const rahmen = { ...CF_RAHMEN, orchestrierung: true }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
  })

  it('PresetRahmen accepts orchestrierung: false', () => {
    const rahmen = { ...SE_RAHMEN, orchestrierung: false }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
  })

  it('PresetRahmen accepts missing orchestrierung (undefined = false)', () => {
    const result = validatePresetRahmen(SE_RAHMEN)
    expect(result.valid).toBe(true)
  })

  it('PresetRahmen rejects orchestrierung: "yes" (must be boolean)', () => {
    const rahmen = { ...CF_RAHMEN, orchestrierung: 'yes' }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'orchestrierung')).toBe(true)
  })

  it('Workshop Rahmen has orchestrierung: true', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    expect((rahmen as any).orchestrierung).toBe(true)
  })

  it('CF Rahmen has orchestrierung: true', () => {
    expect((CF_RAHMEN as any).orchestrierung).toBe(true)
  })

  it('Architect Rahmen has no orchestrierung (undefined)', () => {
    expect((ARCHITECT_RAHMEN as any).orchestrierung).toBeUndefined()
  })
})
