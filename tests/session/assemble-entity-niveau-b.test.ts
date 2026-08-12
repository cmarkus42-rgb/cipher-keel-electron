import { describe, it, expect } from 'vitest'
import { assembleEntityClaudeMd } from '../../src/main/session/assemble-entity'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { LoaderType } from '../../src/main/preset/capability-schema'

const PACKAGES = [
  { name: 'se-core-identity', beschreibung: 'Kern-Identität des SE', loader: LoaderType.SkillMd },
  { name: 'gate-urteil-guide', beschreibung: 'Gate-Urteil an den Gates', loader: LoaderType.SkillMd },
]

describe('assembleEntityClaudeMd at Niveau B', () => {
  it('emits an inventory with description and path for every package', () => {
    const out = assembleEntityClaudeMd({
      body: '# SE', niveau: CapabilityNiveau.B, capabilityPackages: PACKAGES,
    })
    expect(out).toContain('<!-- BEGIN:Capabilities -->')
    expect(out).toContain('Kern-Identität des SE')
    expect(out).toContain('.claude/capabilities/se-core-identity/SKILL.md')
    expect(out).toContain('Gate-Urteil an den Gates')
  })

  it('emits no @-lines at Niveau B — a non-Claude harness will not resolve them', () => {
    const out = assembleEntityClaudeMd({
      body: '# SE', niveau: CapabilityNiveau.B, capabilityPackages: PACKAGES,
    })
    expect(out).not.toMatch(/^@/m)
  })

  it('leaves Niveau A emission untouched', () => {
    const out = assembleEntityClaudeMd({
      body: '# SE', niveau: CapabilityNiveau.A, capabilities: ['se-core-identity'],
    })
    expect(out).toContain('@.claude/capabilities/se-core-identity/SKILL.md')
  })

  it('emits no capability section at Niveau B without packages', () => {
    const out = assembleEntityClaudeMd({ body: '# SE', niveau: CapabilityNiveau.B })
    expect(out).not.toContain('<!-- BEGIN:Capabilities -->')
  })
})
