// tests/session/capability-refs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveCapabilityRefs } from '../../src/main/session/capability-refs'

let projectDir: string

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-caps-'))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

function materialise(id: string): void {
  const dir = path.join(projectDir, '.claude', 'capabilities', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n`, 'utf-8')
}

describe('resolveCapabilityRefs', () => {
  it('reports every capability as missing when nothing is materialised', () => {
    const result = resolveCapabilityRefs(['a', 'b'], projectDir)
    expect(result.present).toEqual([])
    expect(result.missing).toEqual(['a', 'b'])
  })

  it('reports a capability as present once its SKILL.md exists', () => {
    materialise('a')
    const result = resolveCapabilityRefs(['a', 'b'], projectDir)
    expect(result.present).toEqual(['a'])
    expect(result.missing).toEqual(['b'])
  })

  it('preserves the declared order', () => {
    materialise('b')
    materialise('a')
    const result = resolveCapabilityRefs(['a', 'b'], projectDir)
    expect(result.present).toEqual(['a', 'b'])
  })

  it('treats a directory without SKILL.md as missing', () => {
    fs.mkdirSync(path.join(projectDir, '.claude', 'capabilities', 'a'), { recursive: true })
    const result = resolveCapabilityRefs(['a'], projectDir)
    expect(result.missing).toEqual(['a'])
  })

  it('returns empty lists for an empty input', () => {
    expect(resolveCapabilityRefs([], projectDir)).toEqual({ present: [], missing: [] })
  })
})
