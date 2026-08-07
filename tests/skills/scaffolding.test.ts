import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffoldProject } from '../../src/main/skills/scaffolding'

describe('Scaffolding Skill (CK-P3A-010)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates src and test directories per subsystem', () => {
    const result = scaffoldProject({
      projectPath: tmpDir,
      subsystems: ['auth', 'api'],
      testFramework: 'vitest',
      language: 'typescript',
    })
    expect(fs.existsSync(path.join(tmpDir, 'src/auth'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'src/api'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'tests/auth'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'tests/api'))).toBe(true)
    expect(result.createdDirs.length).toBeGreaterThanOrEqual(4)
  })

  it('creates empty test stubs for typescript', () => {
    scaffoldProject({
      projectPath: tmpDir,
      subsystems: ['auth'],
      testFramework: 'vitest',
      language: 'typescript',
    })
    const testFile = path.join(tmpDir, 'tests/auth/auth.test.ts')
    expect(fs.existsSync(testFile)).toBe(true)
    const content = fs.readFileSync(testFile, 'utf-8')
    expect(content).toContain('describe')
  })

  it('creates index file per subsystem', () => {
    scaffoldProject({
      projectPath: tmpDir,
      subsystems: ['auth'],
      testFramework: 'vitest',
      language: 'typescript',
    })
    const indexFile = path.join(tmpDir, 'src/auth/index.ts')
    expect(fs.existsSync(indexFile)).toBe(true)
  })

  it('handles empty subsystems list', () => {
    const result = scaffoldProject({
      projectPath: tmpDir,
      subsystems: [],
      testFramework: 'none',
      language: 'typescript',
    })
    expect(result.createdDirs).toHaveLength(0)
    expect(result.createdFiles).toHaveLength(0)
  })
})
