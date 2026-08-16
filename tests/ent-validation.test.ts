/**
 * ENT-025: validatePresetRahmen — alle 4 Anbindungen
 * ENT-021: generatePermissions — settings.json Fragment
 *
 * Phase 3c / Task 11
 */

import { describe, it, expect } from 'vitest'
import {
  RollenTyp,
  validatePresetRahmen,
  generatePermissions,
} from '../src/main/preset/schema'
import type { PresetRahmen } from '../src/main/preset/schema'
import { CapabilityNiveau } from '../src/main/preset/niveau'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validRahmen(): PresetRahmen {
  return {
    id: 'r1',
    name: 'Test-Rahmen',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['ideation'],
    capabilityAnbindung: ['cap-a'],
    graphAnbindung: { lesen: true, schreiben: false },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: 'claude-sonnet-4-6',
    capabilityNiveau: CapabilityNiveau.B,
    harnessBindung: '',
  }
}

function seRahmen(niveau: CapabilityNiveau = CapabilityNiveau.A): PresetRahmen {
  return {
    id: 'systems-engineer',
    name: 'Systems Engineer',
    rollenTyp: RollenTyp.QuerliegenSE,
    phasenBindung: [],
    capabilityAnbindung: [
      'se-core-identity', 'gate-urteil-guide', 'trigger-zeiger-format',
      'steuer-ueberblick-tool', 'handoff-logik-guide',
      'rolling-summary', 'graph-navigation-advanced',
    ],
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: 'heavy',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}

// ---------------------------------------------------------------------------
// ENT-025: graphAnbindung
// ---------------------------------------------------------------------------

describe('ENT-025: graphAnbindung check', () => {
  it('missing graphAnbindung produces error on field graphAnbindung', () => {
    const { graphAnbindung: _ga, ...withoutGraph } = validRahmen()
    const result = validatePresetRahmen(withoutGraph)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'graphAnbindung')).toBe(true)
  })

  it('null graphAnbindung produces error on field graphAnbindung', () => {
    const rahmen = { ...validRahmen(), graphAnbindung: null }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'graphAnbindung')).toBe(true)
  })

  it('valid graphAnbindung object does not produce error', () => {
    const result = validatePresetRahmen(validRahmen())
    expect(result.errors.some(e => e.field === 'graphAnbindung')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ENT-025: capabilityAnbindung
// ---------------------------------------------------------------------------

describe('ENT-025: capabilityAnbindung check', () => {
  it('empty capabilityAnbindung produces error on field capabilityAnbindung', () => {
    const rahmen = { ...validRahmen(), capabilityAnbindung: [] }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'capabilityAnbindung')).toBe(true)
  })

  it('non-empty capabilityAnbindung does not produce error', () => {
    const result = validatePresetRahmen(validRahmen())
    expect(result.errors.some(e => e.field === 'capabilityAnbindung')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ENT-025: personaVorgabe
// ---------------------------------------------------------------------------

describe('ENT-025: personaVorgabe check', () => {
  it('empty personaVorgabe is valid (leer ist gueltig)', () => {
    const rahmen = { ...validRahmen(), personaVorgabe: '' }
    const result = validatePresetRahmen(rahmen)
    expect(result.errors.some(e => e.field === 'personaVorgabe')).toBe(false)
  })

  it('non-empty personaVorgabe string is valid', () => {
    const rahmen = { ...validRahmen(), personaVorgabe: 'cipher' }
    const result = validatePresetRahmen(rahmen)
    expect(result.errors.some(e => e.field === 'personaVorgabe')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ENT-025: runtime
// ---------------------------------------------------------------------------

describe('ENT-025: runtime check', () => {
  it('empty runtime is valid (maps to default adapter)', () => {
    const rahmen = { ...validRahmen(), runtime: '' }
    const result = validatePresetRahmen(rahmen)
    expect(result.errors.some(e => e.field === 'runtime')).toBe(false)
  })

  it('claude-cli-tmux is a valid runtime', () => {
    const rahmen = { ...validRahmen(), runtime: 'claude-cli-tmux' }
    const result = validatePresetRahmen(rahmen)
    expect(result.errors.some(e => e.field === 'runtime')).toBe(false)
  })

  it('keel-harness is a valid runtime', () => {
    const rahmen = { ...validRahmen(), runtime: 'keel-harness' }
    const result = validatePresetRahmen(rahmen)
    expect(result.errors.some(e => e.field === 'runtime')).toBe(false)
  })

  it('unknown runtime produces error on field runtime', () => {
    const rahmen = { ...validRahmen(), runtime: 'unknown-xyz' }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'runtime')).toBe(true)
  })

  it('unknown runtime error message contains the invalid value', () => {
    const rahmen = { ...validRahmen(), runtime: 'my-bad-runtime' }
    const result = validatePresetRahmen(rahmen)
    const err = result.errors.find(e => e.field === 'runtime')
    expect(err?.message).toContain('my-bad-runtime')
  })
})

// ---------------------------------------------------------------------------
// ENT-025: SE rahmen passes all 4 Anbindungen checks
// ---------------------------------------------------------------------------

describe('ENT-025: full SE rahmen is valid', () => {
  it('SE rahmen passes all 4 Anbindungen checks', () => {
    const result = validatePresetRahmen(seRahmen())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ENT-021: generatePermissions
// ---------------------------------------------------------------------------

describe('ENT-021: generatePermissions — structure', () => {
  it('returns an object with permissions key', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(frag).toHaveProperty('permissions')
  })

  it('permissions has allow array', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(Array.isArray(frag.permissions.allow)).toBe(true)
  })

  it('permissions has deny array', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(Array.isArray(frag.permissions.deny)).toBe(true)
  })
})

describe('ENT-021: generatePermissions — Niveau A (SE)', () => {
  it('Niveau A allow list is non-empty', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(frag.permissions.allow.length).toBeGreaterThan(0)
  })

  it('Niveau A includes Read pattern', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(frag.permissions.allow.some(p => p.startsWith('Read'))).toBe(true)
  })

  it('Niveau A includes Bash pattern', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(frag.permissions.allow.some(p => p.startsWith('Bash'))).toBe(true)
  })

  it('Niveau A includes Write pattern', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.A))
    expect(frag.permissions.allow.some(p => p.startsWith('Write'))).toBe(true)
  })
})

describe('ENT-021: generatePermissions — Niveau C (minimal)', () => {
  it('Niveau C allow list has fewer entries than Niveau A', () => {
    const fragA = generatePermissions(seRahmen(CapabilityNiveau.A))
    const fragC = generatePermissions(seRahmen(CapabilityNiveau.C))
    expect(fragC.permissions.allow.length).toBeLessThan(fragA.permissions.allow.length)
  })

  it('Niveau C does not include Bash', () => {
    const frag = generatePermissions(seRahmen(CapabilityNiveau.C))
    expect(frag.permissions.allow.some(p => p.startsWith('Bash'))).toBe(false)
  })
})
