// tests/preset/registry.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getEntityDefinition, listEntityIds } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { getBuiltinPersona } from '../../src/main/preset/shared/persona-loader'
import { PRESET_CATALOG } from '../../src/shared/preset-catalog'

describe('entity registry', () => {
  it('knows every id in the shipped catalog', () => {
    for (const choice of PRESET_CATALOG) {
      expect(getEntityDefinition(choice.id), choice.id).not.toBeNull()
    }
  })

  it('listEntityIds covers the catalog', () => {
    const ids = listEntityIds()
    for (const choice of PRESET_CATALOG) {
      expect(ids).toContain(choice.id)
    }
  })

  it('returns null for an unknown id', () => {
    expect(getEntityDefinition('nope')).toBeNull()
  })

  it('gives every entity a non-empty body', () => {
    for (const choice of PRESET_CATALOG) {
      const def = getEntityDefinition(choice.id)!
      expect(def.body.length, choice.id).toBeGreaterThan(100)
    }
  })

  it('gives every entity a non-empty capability list', () => {
    for (const choice of PRESET_CATALOG) {
      const def = getEntityDefinition(choice.id)!
      expect(def.rahmen.capabilityAnbindung.length, choice.id).toBeGreaterThan(0)
    }
  })

  // These two assert WHICH persona was resolved, not merely that one was. A
  // not.toBeNull() here would pass even if every entity got the same wrong persona.
  it('resolves the persona declared by the rahmen', () => {
    const architect = getEntityDefinition('architect')!
    expect(architect.rahmen.personaVorgabe).toBe('theaitetos')
    expect(architect.persona).toBe(getBuiltinPersona('theaitetos'))
    expect(architect.persona).not.toBe(getBuiltinPersona('cipher'))
  })

  it('falls back to the catalog default persona when the rahmen declares none', () => {
    // workshop-preset.ts sets personaVorgabe: '' — persona-defaults.json says 'cipher'.
    const workshop = getEntityDefinition('workshop')!
    expect(workshop.rahmen.personaVorgabe).toBe('')
    expect(workshop.persona).toBe(getBuiltinPersona('cipher'))
  })

  it('honours the requested niveau for every entity, factory or not', () => {
    for (const choice of PRESET_CATALOG) {
      const c = getEntityDefinition(choice.id, CapabilityNiveau.C)!
      expect(c.rahmen.capabilityNiveau, choice.id).toBe(CapabilityNiveau.C)
    }
  })

  // toBeLessThan, not toBeLessThanOrEqual: all four narrow strictly (architect 7→1,
  // cyber-factory 8→1, systems-engineer 7→1, workshop 7→5, counted in the sources on
  // 2026-08-10). ToBeLessThanOrEqual would pass even if the niveau were ignored entirely.
  it('narrows the capability set at Niveau C relative to Niveau A', () => {
    for (const choice of PRESET_CATALOG) {
      const a = getEntityDefinition(choice.id, CapabilityNiveau.A)!
      const c = getEntityDefinition(choice.id, CapabilityNiveau.C)!
      expect(
        c.rahmen.capabilityAnbindung.length,
        choice.id,
      ).toBeLessThan(a.rahmen.capabilityAnbindung.length)
    }
  })

  it('produces a rahmen that passes its own validator', async () => {
    const { validatePresetRahmen } = await import('../../src/main/preset/schema')
    for (const choice of PRESET_CATALOG) {
      const def = getEntityDefinition(choice.id)!
      const result = validatePresetRahmen(def.rahmen)
      expect(result.errors, choice.id).toEqual([])
    }
  })
})

// A personasDir that merely exists but has no matching file does NOT construct a miss for
// any of the four shipped ids: resolvePersona() falls through to the builtin persona map,
// and both 'cipher' and 'theaitetos' are builtins. Verified directly: getEntityDefinition
// with a nonexistent personasDir still returns getBuiltinPersona('theaitetos') for
// 'architect'. So the miss below is constructed the other way the review suggested — an
// id whose personaVorgabe names something that exists nowhere (not builtin, not on disk) —
// by mocking the architect factory to report such a value, the same shape a future
// misconfigured preset would actually produce.
describe('entity registry — persona miss', () => {
  afterEach(() => {
    vi.doUnmock('../../src/main/preset/architect/architect-preset')
    vi.resetModules()
  })

  it('warns and returns persona: null when personaVorgabe resolves to nothing', async () => {
    vi.resetModules()
    vi.doMock('../../src/main/preset/architect/architect-preset', async () => {
      const actual = await vi.importActual<
        typeof import('../../src/main/preset/architect/architect-preset')
      >('../../src/main/preset/architect/architect-preset')
      return {
        ...actual,
        createArchitectRahmen: (niveau: CapabilityNiveau) => ({
          ...actual.createArchitectRahmen(niveau),
          personaVorgabe: 'does-not-exist-anywhere',
        }),
      }
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getEntityDefinition: getEntityDefinitionMocked } = await import(
      '../../src/main/preset/registry'
    )

    const def = getEntityDefinitionMocked('architect')

    expect(def).not.toBeNull()
    expect(def!.persona).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('does-not-exist-anywhere')
    expect(warnSpy.mock.calls[0][0]).toContain('architect')

    warnSpy.mockRestore()
  })
})
