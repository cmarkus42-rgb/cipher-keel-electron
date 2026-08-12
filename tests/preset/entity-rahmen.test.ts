import { describe, it, expect } from 'vitest'
import { getEntityRahmen } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

// session:create needs `runtime` before it can pick an adapter, and it needs the adapter
// before it knows which niveau the full definition should be built at. This is the cheap
// first half of that two-step resolution — no persona resolution, no body.
describe('getEntityRahmen', () => {
  it('returns the runtime without resolving a persona', () => {
    expect(getEntityRahmen('architect')?.runtime).toBe('claude-cli-tmux')
  })

  it('defaults to Niveau A', () => {
    expect(getEntityRahmen('architect')?.capabilityNiveau).toBe(CapabilityNiveau.A)
  })

  it('honours the requested niveau', () => {
    expect(getEntityRahmen('architect', CapabilityNiveau.B)?.capabilityNiveau)
      .toBe(CapabilityNiveau.B)
  })

  it('returns null for an unknown entity', () => {
    expect(getEntityRahmen('nope')).toBeNull()
  })
})
