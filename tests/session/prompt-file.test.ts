// tests/session/prompt-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  entityPromptPath,
  writeEntityPromptFile,
  removeEntityPromptFile,
} from '../../src/main/session/prompt-file'

let userData: string

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('entity prompt file', () => {
  it('places the file under userData, never in the project', () => {
    const p = entityPromptPath(userData, 'keel-demo-architect-ab12')
    expect(p.startsWith(userData)).toBe(true)
    expect(p).toContain('entity-prompts')
    expect(p.endsWith('.md')).toBe(true)
  })

  it('gives each session its own path so parallel sessions cannot collide', () => {
    const a = entityPromptPath(userData, 'keel-demo-architect-ab12')
    const b = entityPromptPath(userData, 'keel-demo-architect-cd34')
    expect(a).not.toBe(b)
  })

  it('writes the content and returns the path', () => {
    const written = writeEntityPromptFile(userData, 'keel-demo-workshop-ab12', '# Workshop\n')
    expect(fs.readFileSync(written, 'utf-8')).toBe('# Workshop\n')
  })

  it('creates the directory when it does not exist yet', () => {
    expect(fs.existsSync(path.join(userData, 'entity-prompts'))).toBe(false)
    writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'x')
    expect(fs.existsSync(path.join(userData, 'entity-prompts'))).toBe(true)
  })

  it('overwrites a stale file from a previous run with the same name', () => {
    writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'old')
    const written = writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'new')
    expect(fs.readFileSync(written, 'utf-8')).toBe('new')
  })

  it('writes the file readable only by its owner', () => {
    const written = writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'x')
    expect(fs.statSync(written).mode & 0o777).toBe(0o600)
  })

  it('rejects a session name that would escape the directory', () => {
    expect(() => entityPromptPath(userData, '../escape')).toThrow()
    expect(() => entityPromptPath(userData, 'a/b')).toThrow()
  })

  it('removes the file and stays silent when it is already gone', () => {
    writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'x')
    removeEntityPromptFile(userData, 'keel-demo-se-ab12')
    expect(fs.existsSync(entityPromptPath(userData, 'keel-demo-se-ab12'))).toBe(false)
    expect(() => removeEntityPromptFile(userData, 'keel-demo-se-ab12')).not.toThrow()
  })
})
