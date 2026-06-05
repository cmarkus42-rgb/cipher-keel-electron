/**
 * Preset-Schema + Niveau + Runtime tests
 * CK-ENT-001, CK-ENT-003, CK-ENT-004, CK-ENT-010, CK-ENT-023, CK-ENT-028
 */
import { describe, it, expect } from 'vitest'
import { CapabilityNiveau, getNiveauConfig } from '../src/main/preset/niveau'
import { RollenTyp, validatePresetRahmen } from '../src/main/preset/schema'
import type { PresetRahmen } from '../src/main/preset/schema'
import type { Entity, Preset, Session } from '../src/main/preset/types'
import { AdapterRegistry } from '../src/main/agent/registry'

// -----------------------------------------------------------------------
// CK-ENT-001 — Type shapes (compile-time check via type assertions)
// -----------------------------------------------------------------------
describe('Entity / Preset / Session types (CK-ENT-001)', () => {
  it('Entity has required fields', () => {
    const e: Entity = {
      id: 'e1',
      name: 'SE',
      rollenTyp: RollenTyp.QuerliegenSE,
      description: 'Systems Engineer',
    }
    expect(e.id).toBe('e1')
    expect(e.name).toBe('SE')
    expect(e.description).toBe('Systems Engineer')
  })

  it('multiple Sessions for same Entity are independent', () => {
    const s1: Session = {
      id: 's1',
      presetId: 'p1',
      adapterId: 'claude-code',
      status: 'running',
      createdAt: new Date(),
    }
    const s2: Session = {
      id: 's2',
      presetId: 'p1',
      adapterId: 'claude-code',
      status: 'running',
      createdAt: new Date(),
    }
    expect(s1.id).not.toBe(s2.id)
    expect(s1.presetId).toBe(s2.presetId)
  })

  it('Preset references Entity via entityId', () => {
    const p: Preset = {
      id: 'p1',
      name: 'SE-Preset',
      entityId: 'e1',
      rahmen: {
        id: 'r1',
        name: 'SE-Rahmen',
        rollenTyp: RollenTyp.QuerliegenSE,
        phasenBindung: [],
        capabilityAnbindung: [],
        graphAnbindung: { lesen: true, schreiben: true },
        personaVorgabe: '',
        runtime: '',
        model: '',
        capabilityNiveau: CapabilityNiveau.A,
        harnessBindung: '',
      },
      bodyPath: '/presets/se/body.md',
      personaPath: '/presets/se/persona.md',
    }
    expect(p.entityId).toBe('e1')
  })
})

// -----------------------------------------------------------------------
// CK-ENT-003 — CapabilityNiveau
// -----------------------------------------------------------------------
describe('CapabilityNiveau (CK-ENT-003)', () => {
  it('enum has values A, B, C', () => {
    expect(CapabilityNiveau.A).toBe('A')
    expect(CapabilityNiveau.B).toBe('B')
    expect(CapabilityNiveau.C).toBe('C')
  })

  it('getNiveauConfig A → CLAUDE.md + nativ', () => {
    const cfg = getNiveauConfig(CapabilityNiveau.A)
    expect(cfg.bodyForm).toBe('CLAUDE.md')
    expect(cfg.loaderStrategie).toBe('nativ')
  })

  it('getNiveauConfig B → harness-native + manuell', () => {
    const cfg = getNiveauConfig(CapabilityNiveau.B)
    expect(cfg.bodyForm).toBe('harness-native')
    expect(cfg.loaderStrategie).toBe('manuell')
  })

  it('getNiveauConfig C → Instruktionsdatei + inline', () => {
    const cfg = getNiveauConfig(CapabilityNiveau.C)
    expect(cfg.bodyForm).toBe('Instruktionsdatei')
    expect(cfg.loaderStrategie).toBe('inline')
  })
})

// -----------------------------------------------------------------------
// CK-ENT-004, CK-ENT-023 — PresetRahmen schema validation
// -----------------------------------------------------------------------

function validRahmen(): PresetRahmen {
  return {
    id: 'r1',
    name: 'Test-Rahmen',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['ideation'],
    capabilityAnbindung: [],
    graphAnbindung: { lesen: true, schreiben: false },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: 'claude-sonnet-4-6',
    capabilityNiveau: CapabilityNiveau.B,
    harnessBindung: '',
  }
}

describe('validatePresetRahmen (CK-ENT-004, CK-ENT-023)', () => {
  it('valid rahmen passes without errors', () => {
    const result = validatePresetRahmen(validRahmen())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('missing id produces structured error', () => {
    const { id: _id, ...withoutId } = validRahmen()
    const result = validatePresetRahmen(withoutId)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'id')).toBe(true)
  })

  it('missing name produces structured error', () => {
    const { name: _name, ...withoutName } = validRahmen()
    const result = validatePresetRahmen(withoutName)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'name')).toBe(true)
  })

  it('missing rollenTyp produces structured error', () => {
    const { rollenTyp: _rt, ...withoutRt } = validRahmen()
    const result = validatePresetRahmen(withoutRt)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'rollenTyp')).toBe(true)
  })

  it('missing capabilityNiveau produces structured error', () => {
    const { capabilityNiveau: _cn, ...withoutCn } = validRahmen()
    const result = validatePresetRahmen(withoutCn)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'capabilityNiveau')).toBe(true)
  })

  it('multiple missing required fields produce one error per missing field', () => {
    const result = validatePresetRahmen({})
    expect(result.valid).toBe(false)
    const fields = result.errors.map(e => e.field)
    expect(fields).toContain('id')
    expect(fields).toContain('name')
    expect(fields).toContain('rollenTyp')
    expect(fields).toContain('capabilityNiveau')
  })

  it('invalid rollenTyp enum value is rejected', () => {
    const rahmen = { ...validRahmen(), rollenTyp: 'ungueltig-typ' as RollenTyp }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'rollenTyp')).toBe(true)
  })

  it('invalid capabilityNiveau enum value is rejected', () => {
    const rahmen = { ...validRahmen(), capabilityNiveau: 'D' as CapabilityNiveau }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'capabilityNiveau')).toBe(true)
  })

  it('empty optional fields are accepted as defaults (no errors)', () => {
    const rahmen: PresetRahmen = {
      id: 'r2',
      name: 'Minimal-Rahmen',
      rollenTyp: RollenTyp.BeauftragteInstanz,
      phasenBindung: [],
      capabilityAnbindung: [],
      graphAnbindung: { lesen: true, schreiben: false },
      personaVorgabe: '',
      runtime: '',
      model: '',
      capabilityNiveau: CapabilityNiveau.C,
      harnessBindung: '',
    }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('unknown fields in input object are ignored', () => {
    const rahmen = {
      ...validRahmen(),
      unknownField: 'some-value',
      anotherUnknown: 42,
    }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------
// CK-ENT-010, CK-ENT-028 — AdapterRegistry.getForRuntime()
// -----------------------------------------------------------------------
describe('AdapterRegistry.getForRuntime (CK-ENT-010, CK-ENT-028)', () => {
  it('undefined runtime returns default ClaudeCodeAdapter', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getForRuntime(undefined)
    expect(adapter.id).toBe('claude-code')
  })

  it('empty string runtime returns default ClaudeCodeAdapter', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getForRuntime('')
    expect(adapter.id).toBe('claude-code')
  })

  it('claude-cli-tmux maps to ClaudeCodeAdapter', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getForRuntime('claude-cli-tmux')
    expect(adapter.id).toBe('claude-code')
  })

  it('unknown runtime throws Error containing the unknown value', () => {
    const registry = new AdapterRegistry()
    expect(() => registry.getForRuntime('unknown-xyz')).toThrow(/unknown-xyz/)
  })

  it('no silent fallback: unknown runtime does not silently return default', () => {
    const registry = new AdapterRegistry()
    let threw = false
    try {
      registry.getForRuntime('unbekannter-wert')
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
