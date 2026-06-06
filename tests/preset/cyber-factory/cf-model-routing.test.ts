// tests/preset/cyber-factory/cf-model-routing.test.ts
import { describe, it, expect } from 'vitest'
import { routeModel } from '../../../src/main/preset/cyber-factory/cf-model-routing'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('CF Model Routing (CK-P3CF-004)', () => {
  it('Niveau A: trivial → light', () => {
    expect(routeModel('trivial', CapabilityNiveau.A)).toBe('light')
  })

  it('Niveau A: business_logic → standard', () => {
    expect(routeModel('business_logic', CapabilityNiveau.A)).toBe('standard')
  })

  it('Niveau A: architecture → heavy', () => {
    expect(routeModel('architecture', CapabilityNiveau.A)).toBe('heavy')
  })

  it('Niveau A: unknown defaults to standard', () => {
    expect(routeModel('unknown', CapabilityNiveau.A)).toBe('standard')
  })

  it('Niveau B: always standard regardless of complexity', () => {
    expect(routeModel('trivial', CapabilityNiveau.B)).toBe('standard')
    expect(routeModel('business_logic', CapabilityNiveau.B)).toBe('standard')
    expect(routeModel('architecture', CapabilityNiveau.B)).toBe('standard')
  })

  it('Niveau C: always standard', () => {
    expect(routeModel('trivial', CapabilityNiveau.C)).toBe('standard')
  })
})
