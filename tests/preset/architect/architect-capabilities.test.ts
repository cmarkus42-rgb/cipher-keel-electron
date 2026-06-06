// tests/preset/architect/architect-capabilities.test.ts
import { describe, it, expect } from 'vitest'
import { getArchitectCapabilities } from '../../../src/main/preset/architect/architect-capabilities'
import { validateCapabilityPackage } from '../../../src/main/preset/capability-schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'
import { lintCapabilities, warnOversizedPackages } from '../../../src/main/preset/capability-lint'
import { LoaderType } from '../../../src/main/preset/capability-schema'

describe('Architect Capabilities (CK-P3A-012)', () => {
  it('returns 7 packages for Niveau A', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.A)
    expect(pkgs).toHaveLength(7)
  })

  it('returns 5 packages for Niveau B', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.B)
    expect(pkgs).toHaveLength(5)
    const names = pkgs.map(p => p.name)
    expect(names).not.toContain('coaching-loop-guide')
    expect(names).not.toContain('rolling-summary')
  })

  it('returns 1 package for Niveau C', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.C)
    expect(pkgs).toHaveLength(1)
    expect(pkgs[0].name).toBe('architect-core-identity')
    expect(pkgs[0].loader).toBe(LoaderType.Inline)
  })

  it('all packages validate', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.A)
    for (const pkg of pkgs) {
      const result = validateCapabilityPackage(pkg)
      expect(result.valid).toBe(true)
    }
  })

  it('no dependency lint errors at Niveau A', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.A)
    const errors = lintCapabilities(pkgs)
    expect(errors).toHaveLength(0)
  })

  it('Niveau C inline package under 800 tokens', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.C)
    const contents = pkgs.map(p => ({ name: p.name, content: p.niveauCExtrakt ?? '' }))
    const warnings = warnOversizedPackages(contents, 'C')
    expect(warnings).toHaveLength(0)
  })

  it('architect-core-identity has Niveau C extrakt including schnittstellen-stempel', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.C)
    const core = pkgs.find(p => p.name === 'architect-core-identity')!
    expect(core.niveauCExtrakt).toBeDefined()
    expect(core.niveauCExtrakt).toContain('Schnittstellen')
  })

  it('niveau-c-formulierer is default-activated on A and B (CK-P3A-011)', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B]) {
      const pkgs = getArchitectCapabilities(n)
      const names = pkgs.map(p => p.name)
      expect(names).toContain('niveau-c-formulierer')
    }
  })
})
