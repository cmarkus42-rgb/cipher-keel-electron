import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('agent config defaults', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    // Fresh, empty userData dir per test — no config file exists in it, so loadConfig()
    // falls back to defaults. A fixed shared path would let a stale file on the machine
    // decide the outcome instead of the code under test.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-config-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('defaults startArgs to empty (Task 4, 2026-08-17)', async () => {
    // Supersedes the 2026-08-10 decision this test used to guard: `skipPermissions` named
    // one vendor's flag in the schema itself, defaulting to true. That default is not
    // carried forward — a fresh install now starts with no launch parameters for any
    // adapter. An existing file with `skipPermissions: true` keeps behaving the same way,
    // but via config-store's migration (see tests/config/migration.test.ts), not via this
    // default. If this ever flips silently, sessions change behaviour with no visible cause.
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { configStore } = await import('../../src/main/config/config-store')
    expect(configStore.getAll().agent.startArgs).toEqual({})
  })
})
