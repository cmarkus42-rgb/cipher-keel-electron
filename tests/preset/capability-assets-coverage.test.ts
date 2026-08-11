import { describe, it, expect } from 'vitest'
import { CAPABILITY_SKILLS } from '../../src/main/preset/capability-assets'
import { getCapabilityPackages } from '../../src/main/preset/capabilities'
import { listEntityIds } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

function declaredCapabilityIds(): Set<string> {
  const ids = new Set<string>()
  for (const entityId of listEntityIds()) {
    for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      for (const pkg of getCapabilityPackages(entityId, niveau)) ids.add(pkg.name)
    }
  }
  return ids
}

// A mismatch between declared packages and bundled SKILL.md assets used to surface only
// as a console.warn at session start — invisible in a packaged app, where the entity
// would just quietly lose a capability. Binding both directions makes it a build failure.
describe('capability assets cover exactly the declared packages', () => {
  it('every declared package has a SKILL.md asset', () => {
    const missing = [...declaredCapabilityIds()].filter(id => !(id in CAPABILITY_SKILLS))
    expect(missing, `declared but no asset: ${missing.join(', ')}`).toEqual([])
  })

  it('every asset belongs to a declared package', () => {
    const declared = declaredCapabilityIds()
    const orphans = Object.keys(CAPABILITY_SKILLS).filter(id => !declared.has(id))
    expect(orphans, `asset but never declared: ${orphans.join(', ')}`).toEqual([])
  })

  it('no asset is empty', () => {
    for (const [id, content] of Object.entries(CAPABILITY_SKILLS)) {
      expect(content.trim().length, `${id} is empty`).toBeGreaterThan(0)
    }
  })
})
