/**
 * tests/preset-catalog.test.ts — die vier 0.1-Presets als UI-Metadaten.
 *
 * M6 Abschnitt 3.1 (BG-1) legt fuer Release 0.1 genau vier Rollen fest.
 * M5 kennt elf — die uebrigen sieben sind post-0.1 und hier bewusst nicht enthalten.
 */
import { describe, it, expect } from 'vitest'
import { PRESET_CATALOG, isKnownPresetId } from '../src/shared/preset-catalog'

describe('PRESET_CATALOG', () => {
  it('offers exactly the four ratified 0.1 roles', () => {
    expect(PRESET_CATALOG.map(p => p.id)).toEqual([
      'systems-engineer', 'architect', 'cyber-factory', 'workshop',
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
    const postRelease = ['ideation', 'refinement', 'testing', 'audit', 'release-manager', 'companion', 'debugger']
    for (const id of postRelease) {
      expect(PRESET_CATALOG.some(p => p.id === id)).toBe(false)
    }
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
