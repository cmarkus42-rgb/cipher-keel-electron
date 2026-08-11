import { describe, it, expect } from 'vitest'
import { capabilityPath } from '../../src/main/preset/capabilities'
import { LoaderType, validateCapabilityPackage } from '../../src/main/preset/capability-schema'

// The path a capability occupies inside a project follows one convention that
// capabilityRefPath already owns. Packages used to repeat it by hand, which made it the
// third of three encodings of the same string — and nothing kept them in step.
describe('capabilityPath', () => {
  it('derives the path from the name when the package declares none', () => {
    expect(capabilityPath({
      name: 'gate-urteil-guide',
      beschreibung: 'x',
      loader: LoaderType.SkillMd,
    })).toBe('.claude/capabilities/gate-urteil-guide/SKILL.md')
  })

  it('honours an explicit pfad — nanoclaw-skill routes are not derivable', () => {
    expect(capabilityPath({
      name: 'some-skill',
      beschreibung: 'x',
      loader: LoaderType.NanoClawSkill,
      pfad: 'channel://skills/some-skill',
    })).toBe('channel://skills/some-skill')
  })
})

describe('validateCapabilityPackage with optional pfad', () => {
  it('accepts a skill-md package without pfad', () => {
    expect(validateCapabilityPackage({
      name: 'a', beschreibung: 'b', loader: 'skill-md',
    }).valid).toBe(true)
  })

  it('still rejects a nanoclaw-skill package without pfad', () => {
    const result = validateCapabilityPackage({
      name: 'a', beschreibung: 'b', loader: 'nanoclaw-skill',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/pfad/)
  })

  it('still rejects a reference-material package without pfad', () => {
    expect(validateCapabilityPackage({
      name: 'a', beschreibung: 'b', loader: 'reference-material',
    }).valid).toBe(false)
  })
})
