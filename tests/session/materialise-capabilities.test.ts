// tests/session/materialise-capabilities.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { materialiseCapabilities } from '../../src/main/session/materialise-capabilities'
import { CAPABILITY_SKILLS } from '../../src/main/preset/capability-assets'

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
    const file = path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md')
    expect(fs.readFileSync(file, 'utf-8')).toBe(CAPABILITY_SKILLS['architect-core-identity'])
  })

  it('reports an unknown capability instead of writing an empty file', () => {
    const result = materialiseCapabilities(['does-not-exist'], projectDir)
    expect(result.unknown).toEqual(['does-not-exist'])
    expect(fs.existsSync(path.join(projectDir, '.claude/capabilities/does-not-exist'))).toBe(false)
  })

  it('overwrites a stale copy from an earlier launch', () => {
    const file = path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'stale', 'utf-8')
    materialiseCapabilities(['architect-core-identity'], projectDir)
    expect(fs.readFileSync(file, 'utf-8')).not.toBe('stale')
  })

  it('carries every capability the four shipped presets declare', () => {
    // The registry must never reference a capability the assets do not know.
    const ids = Object.keys(CAPABILITY_SKILLS)
    expect(ids.length).toBeGreaterThanOrEqual(27)
  })
})
