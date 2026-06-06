// tests/preset/cyber-factory/cf-capabilities.test.ts
import { describe, it, expect } from 'vitest'
import { getCfCapabilities } from '../../../src/main/preset/cyber-factory/cf-capabilities'
import { validateCapabilityPackage, LoaderType } from '../../../src/main/preset/capability-schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'
import { lintCapabilities, warnOversizedPackages } from '../../../src/main/preset/capability-lint'

describe('CF Capabilities (CK-P3CF-010)', () => {
  it('returns 8 packages for Niveau A', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.A)
    expect(pkgs).toHaveLength(8)
  })

  it('returns 5 packages for Niveau B', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.B)
    expect(pkgs).toHaveLength(5)
    const names = pkgs.map(p => p.name)
    expect(names).not.toContain('model-routing-guide')
    expect(names).not.toContain('risk-review-guide')
    expect(names).not.toContain('graph-navigation')
  })

  it('returns 1 package for Niveau C', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.C)
    expect(pkgs).toHaveLength(1)
    expect(pkgs[0].name).toBe('cf-core-identity')
    expect(pkgs[0].loader).toBe(LoaderType.Inline)
  })

  it('all packages validate', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.A)
    for (const pkg of pkgs) {
      const result = validateCapabilityPackage(pkg)
      expect(result.valid).toBe(true)
    }
  })

  it('no lint errors at Niveau A', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.A)
    expect(lintCapabilities(pkgs)).toHaveLength(0)
  })

  it('Niveau C inline under 500 tokens', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.C)
    const contents = pkgs.map(p => ({ name: p.name, content: p.niveauCExtrakt ?? '' }))
    const warnings = warnOversizedPackages(contents, 'C')
    expect(warnings).toHaveLength(0)
  })

  it('welle-plan-granularisierer present on A and B (CK-P3CF-007)', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B]) {
      const names = getCfCapabilities(n).map(p => p.name)
      expect(names).toContain('welle-plan-granularisierer')
    }
  })
})
