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

  it('defaults skipPermissions to true', async () => {
    // A user decision (2026-08-10): the app launches sessions itself, and the
    // launched agent runs with --dangerously-skip-permissions unless turned off.
    // If this ever flips silently, sessions change behaviour with no visible cause.
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { configStore } = await import('../../src/main/config/config-store')
    expect(configStore.getAll().agent.skipPermissions).toBe(true)
  })
})
