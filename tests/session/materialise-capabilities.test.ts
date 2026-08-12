// tests/session/materialise-capabilities.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { materialiseCapabilities } from '../../src/main/session/materialise-capabilities'
import { CAPABILITY_SKILLS } from '../../src/main/preset/capability-assets'
import { ARCHITECT_CAPABILITIES } from '../../src/main/preset/architect/architect-preset'
import { CF_CAPABILITIES } from '../../src/main/preset/cyber-factory/cf-preset'
// SE_CAPABILITIES (se-preset.ts) is NOT what the registry reads: getEntityDefinition
// always calls createSERahmen(niveau), which overrides capabilityAnbindung with
// getSECapabilities(niveau) — SE_CAPABILITIES_A at the default (and only reachable,
// see se-capabilities.ts) niveau A. SE_CAPABILITIES only feeds the unused-at-runtime
// SE_RAHMEN/createSEPreset. Importing SE_CAPABILITIES_A here is what makes this guard
// catch a real drift: if SE_CAPABILITIES_A gains an id that SE_CAPABILITIES lacks (or
// CAPABILITY_SKILLS lacks), materialisation would silently drop it at launch time while
// a guard keyed on the wrong constant stayed green.
import { getSECapabilityPackages } from '../../src/main/preset/systems-engineer/se-capabilities'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const SE_CAPABILITIES_A = getSECapabilityPackages(CapabilityNiveau.A).map(p => p.name)
import { TA_CAPABILITIES } from '../../src/main/preset/testing-assistant/ta-preset'
import { WORKSHOP_CAPABILITY_PAKETE } from '../../src/main/preset/workshop/workshop-preset'

let projectDir: string

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-mat-'))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

describe('materialiseCapabilities', () => {
  it('writes a known capability to .claude/capabilities/<id>/SKILL.md', () => {
    const result = materialiseCapabilities(['architect-core-identity'], projectDir)
    expect(result.unknown).toEqual([])
    expect(result.written).toEqual(['architect-core-identity'])
    const file = path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md')
    expect(fs.readFileSync(file, 'utf-8')).toBe(CAPABILITY_SKILLS['architect-core-identity'])
  })

  it('reports an unknown capability instead of writing an empty file', () => {
    const result = materialiseCapabilities(['does-not-exist'], projectDir)
    expect(result.unknown).toEqual(['does-not-exist'])
    expect(result.written).toEqual([])
    expect(fs.existsSync(path.join(projectDir, '.claude/capabilities/does-not-exist'))).toBe(false)
  })

  it('overwrites a stale copy from an earlier launch', () => {
    const file = path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'stale', 'utf-8')
    materialiseCapabilities(['architect-core-identity'], projectDir)
    expect(fs.readFileSync(file, 'utf-8')).not.toBe('stale')
  })

  it('carries exactly the capabilities the five presets declare — no more, no fewer', () => {
    // A count check alone would miss a typo that swaps one id for another while
    // keeping the total the same — the map would then silently orphan a real
    // capability under a wrong key. Set equality catches that; a count does not.
    const declared = new Set<string>([
      ...ARCHITECT_CAPABILITIES,
      ...CF_CAPABILITIES,
      ...SE_CAPABILITIES_A,
      ...TA_CAPABILITIES,
      ...WORKSHOP_CAPABILITY_PAKETE,
    ])
    expect(Object.keys(CAPABILITY_SKILLS).sort()).toEqual([...declared].sort())
  })

  it('writes a README.md explaining the directory is app-managed, without touching the capability count or content', () => {
    materialiseCapabilities(['architect-core-identity'], projectDir)
    const readme = fs.readFileSync(
      path.join(projectDir, '.claude/capabilities/README.md'),
      'utf-8',
    )
    expect(readme).toContain('cipher keel')
    expect(readme.length).toBeGreaterThan(0)

    // The README lives beside the capability directories, not inside one — it
    // must not appear as an extra "capability" and must not perturb SKILL.md content.
    const entries = fs.readdirSync(path.join(projectDir, '.claude/capabilities'))
    expect(entries.sort()).toEqual(['README.md', 'architect-core-identity'])
    const skill = fs.readFileSync(
      path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md'),
      'utf-8',
    )
    expect(skill).toBe(CAPABILITY_SKILLS['architect-core-identity'])
  })
})
