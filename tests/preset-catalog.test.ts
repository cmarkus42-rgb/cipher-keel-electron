/**
 * tests/preset-catalog.test.ts — die 0.1-Presets plus Testing Assistant und keel-Arbeiter als
 * UI-Metadaten.
 *
 * M6 Abschnitt 3.1 (BG-1) legt fuer Release 0.1 genau vier Rollen fest.
 * M5 kennt elf — die uebrigen sechs sind post-0.1 und hier bewusst nicht enthalten.
 * Der Testing Assistant wurde danach nachgezogen und ist jetzt Teil des Katalogs.
 * keel-arbeiter kam mit dem keel-harness-Adapter (M8) dazu — kein M5-Phasenrolle, sondern die
 * BeauftragteInstanz fuer keels eigene Schleife (Niveau B), siehe preset-catalog.ts Modulkopf.
 */
import { describe, it, expect } from 'vitest'
import { PRESET_CATALOG, isKnownPresetId, defaultPresetId } from '../src/shared/preset-catalog'
import { listEntityIds } from '../src/main/preset/registry'

describe('PRESET_CATALOG', () => {
  it('offers the four ratified 0.1 roles plus the Testing Assistant and keel-arbeiter', () => {
    expect(PRESET_CATALOG.map(p => p.id)).toEqual([
      'systems-engineer', 'architect', 'cyber-factory', 'testing-assistant',
      'keel-arbeiter', 'workshop',
    ])
  })

  it('gives every preset a non-empty label and description', () => {
    for (const preset of PRESET_CATALOG) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    expect(new Set(PRESET_CATALOG.map(p => p.id)).size).toBe(PRESET_CATALOG.length)
  })

  it('marks exactly one preset as the default', () => {
    expect(PRESET_CATALOG.filter(p => p.isDefault)).toHaveLength(1)
  })

  it('defaults to workshop', () => {
    expect(PRESET_CATALOG.find(p => p.isDefault)!.id).toBe('workshop')
  })

  it('does not offer any post-0.1 role', () => {
    const postRelease = ['ideation', 'refinement', 'audit', 'release-manager', 'companion', 'debugger']
    for (const id of postRelease) {
      expect(PRESET_CATALOG.some(p => p.id === id)).toBe(false)
    }
  })
})

describe('preset catalog after the Testing Assistant', () => {
  // 6, not 5: keel-arbeiter (Task 5, keel-harness adapter) landed after the Testing Assistant
  // and moved this count by one. Adjusted here rather than left at 5 with the catalog
  // shortened to match — the catalog is the thing under test, not this number.
  it('offers six presets', () => {
    expect(PRESET_CATALOG).toHaveLength(6)
  })

  it('knows the testing assistant', () => {
    expect(isKnownPresetId('testing-assistant')).toBe(true)
  })

  it('knows keel-arbeiter', () => {
    expect(isKnownPresetId('keel-arbeiter')).toBe(true)
  })

  it('keeps workshop as the default', () => {
    expect(defaultPresetId()).toBe('workshop')
  })

  // The catalog already asserts a single default at :28 — this one asserts the
  // registry can actually build everything the launcher offers, which nothing did before.
  it('offers nothing the registry cannot build', () => {
    const buildable = listEntityIds()
    for (const choice of PRESET_CATALOG) {
      expect(buildable, choice.id).toContain(choice.id)
    }
  })
})

describe('defaultPresetId (M-4 — single source of truth for the renderer default)', () => {
  it('returns the catalog entry marked isDefault', () => {
    expect(defaultPresetId()).toBe('workshop')
  })

  it('is a known preset id', () => {
    expect(isKnownPresetId(defaultPresetId())).toBe(true)
  })
})

describe('isKnownPresetId', () => {
  it('accepts a catalog id', () => {
    expect(isKnownPresetId('architect')).toBe(true)
  })

  it('rejects an unknown id', () => {
    expect(isKnownPresetId('nope')).toBe(false)
  })

  it('rejects a post-0.1 role', () => {
    expect(isKnownPresetId('debugger')).toBe(false)
  })
})
