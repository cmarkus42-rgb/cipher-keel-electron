import { describe, it, expect } from 'vitest'
import { getCapabilityPackages } from '../../src/main/preset/capabilities'
import { getEntityRahmen, listEntityIds } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

// Five entities used to declare their capabilities in three incompatible shapes, and the
// production path read hand-maintained per-niveau string lists that sat next to
// schema-validated package arrays nothing consumed. The packages are the declaration now;
// the lists are derived from them.
describe('getCapabilityPackages', () => {
  it('returns the SE set at Niveau A — seven packages, declared order', () => {
    const names = getCapabilityPackages('systems-engineer', CapabilityNiveau.A).map(p => p.name)
    expect(names).toEqual([
      'se-core-identity', 'gate-urteil-guide', 'trigger-zeiger-format',
      'steuer-ueberblick-tool', 'handoff-logik-guide', 'rolling-summary',
      'graph-navigation-advanced',
    ])
  })

  it('drops niveauMinimum-A packages at Niveau B', () => {
    const names = getCapabilityPackages('systems-engineer', CapabilityNiveau.B).map(p => p.name)
    expect(names).not.toContain('steuer-ueberblick-tool')
    expect(names).not.toContain('graph-navigation-advanced')
    expect(names).toHaveLength(5)
  })

  it('returns an empty array for an unknown entity', () => {
    expect(getCapabilityPackages('nope', CapabilityNiveau.A)).toEqual([])
  })

  it('gives every known entity at least one package at Niveau A', () => {
    for (const id of listEntityIds()) {
      expect(getCapabilityPackages(id, CapabilityNiveau.A).length, id).toBeGreaterThan(0)
    }
  })
})

describe('capabilityAnbindung is derived from the packages', () => {
  for (const id of listEntityIds()) {
    it(`${id}: the Rahmen lists exactly the package names at every niveau`, () => {
      for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
        const rahmen = getEntityRahmen(id, niveau)!
        const expected = getCapabilityPackages(id, niveau).map(p => p.name)
        expect(rahmen.capabilityAnbindung, `${id} at ${niveau}`).toEqual(expected)
      }
    })
  }
})
