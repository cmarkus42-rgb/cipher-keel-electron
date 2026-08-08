import { describe, it, expect } from 'vitest'
import { dispatchFixingItem, classifyItem } from '../../../src/main/preset/workshop/workshop-fixing-dispatch'

describe('Workshop Fixing Dispatch (CK-PROC-015)', () => {
  it('classifies BUG items', () => {
    expect(classifyItem({ id: 'BUG-001', titel: 'Login broken', typ: 'BUG' })).toBe('BUG')
  })

  it('classifies MFR items', () => {
    expect(classifyItem({ id: 'MFR-001', titel: 'Add dark mode', typ: 'MFR' })).toBe('MFR')
  })

  it('classifies NRF items', () => {
    expect(classifyItem({ id: 'NRF-001', titel: 'Improve startup', typ: 'NRF' })).toBe('NRF')
  })

  it('dispatches BUG to debugger preset', () => {
    const result = dispatchFixingItem({ id: 'BUG-001', titel: 'Login broken', typ: 'BUG' })
    expect(result.targetPreset).toBe('debugger')
    expect(result.reasoning).toContain('BUG')
  })

  it('dispatches MFR to development worker', () => {
    const result = dispatchFixingItem({ id: 'MFR-001', titel: 'Add feature', typ: 'MFR' })
    expect(result.targetPreset).toBe('development-worker')
  })

  it('dispatches NRF to development worker', () => {
    const result = dispatchFixingItem({ id: 'NRF-001', titel: 'Perf fix', typ: 'NRF' })
    expect(result.targetPreset).toBe('development-worker')
  })
})
