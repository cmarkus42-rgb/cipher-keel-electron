/**
 * SE Preset tests — Phase 3c Task 2
 * CK-3C-002
 */
import { describe, it, expect } from 'vitest'
import { SE_RAHMEN, createSEPreset } from '../src/main/preset/systems-engineer/se-preset'
import { RollenTyp, validatePresetRahmen } from '../src/main/preset/schema'
import { CapabilityNiveau } from '../src/main/preset/niveau'

describe('SE_RAHMEN (CK-3C-002)', () => {
  it('SE_RAHMEN validates against PresetRahmen schema', () => {
    const result = validatePresetRahmen(SE_RAHMEN)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rollenTyp is QuerliegenSE', () => {
    expect(SE_RAHMEN.rollenTyp).toBe(RollenTyp.QuerliegenSE)
  })

  it('phasenBindung is empty array', () => {
    expect(SE_RAHMEN.phasenBindung).toEqual([])
  })

  it('model is heavy', () => {
    expect(SE_RAHMEN.model).toBe('heavy')
  })

  it('personaVorgabe is cipher', () => {
    expect(SE_RAHMEN.personaVorgabe).toBe('cipher')
  })

  it('capabilityAnbindung has exactly 7 entries', () => {
    expect(SE_RAHMEN.capabilityAnbindung).toHaveLength(7)
  })

  it('capabilityAnbindung contains all expected packages', () => {
    const expected = [
      'se-core-identity',
      'gate-urteil-guide',
      'trigger-zeiger-format',
      'steuer-ueberblick-tool',
      'handoff-logik-guide',
      'rolling-summary',
      'graph-navigation-advanced',
    ]
    expect(SE_RAHMEN.capabilityAnbindung).toEqual(expected)
  })

  it('graphAnbindung has lesen and schreiben true', () => {
    expect(SE_RAHMEN.graphAnbindung.lesen).toBe(true)
    expect(SE_RAHMEN.graphAnbindung.schreiben).toBe(true)
  })

  it('capabilityNiveau is A', () => {
    expect(SE_RAHMEN.capabilityNiveau).toBe(CapabilityNiveau.A)
  })

  it('runtime is claude-cli-tmux', () => {
    expect(SE_RAHMEN.runtime).toBe('claude-cli-tmux')
  })

  it('harnessBindung is empty (leer)', () => {
    expect(SE_RAHMEN.harnessBindung).toBe('')
  })
})

describe('createSEPreset (CK-3C-002)', () => {
  it('returns a Preset with SE_RAHMEN', () => {
    const preset = createSEPreset()
    expect(preset.rahmen).toEqual(SE_RAHMEN)
  })

  it('preset id is systems-engineer', () => {
    const preset = createSEPreset()
    expect(preset.id).toBe('systems-engineer')
  })

  it('preset entityId is systems-engineer', () => {
    const preset = createSEPreset()
    expect(preset.entityId).toBe('systems-engineer')
  })

  it('preset name is Systems Engineer', () => {
    const preset = createSEPreset()
    expect(preset.name).toBe('Systems Engineer')
  })
})
