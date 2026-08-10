// tests/preset/testing-assistant/ta-preset.test.ts
import { describe, it, expect } from 'vitest'
import { TA_RAHMEN, createTaRahmen, TA_CAPABILITIES } from '../../../src/main/preset/testing-assistant/ta-preset'
import { validatePresetRahmen, RollenTyp } from '../../../src/main/preset/schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('Testing Assistant preset', () => {
  it('passes the rahmen validator', () => {
    expect(validatePresetRahmen(TA_RAHMEN).errors).toEqual([])
  })

  it('is a phase entity, not a cross-cutting role', () => {
    expect(TA_RAHMEN.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
  })

  it('binds to the testing phase', () => {
    expect(TA_RAHMEN.phasenBindung).toContain('testing')
  })

  it('reads the graph and writes findings back', () => {
    expect(TA_RAHMEN.graphAnbindung).toEqual({ lesen: true, schreiben: true })
  })

  it('defaults to the cipher persona, matching persona-defaults.json', () => {
    expect(TA_RAHMEN.personaVorgabe).toBe('cipher')
  })

  it('does not orchestrate — it has no workers', () => {
    expect(TA_RAHMEN.orchestrierung).toBeFalsy()
  })

  it('narrows its capability set from A to C', () => {
    const a = createTaRahmen(CapabilityNiveau.A).capabilityAnbindung
    const c = createTaRahmen(CapabilityNiveau.C).capabilityAnbindung
    expect(a).toEqual([...TA_CAPABILITIES])
    expect(c.length).toBeLessThan(a.length)
  })
})
