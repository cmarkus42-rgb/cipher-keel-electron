/**
 * session-create-claude-gate.test.ts — F1 fix-review finding.
 *
 * Before this fix, session:create built the launch command and handed it to tmux
 * without ever checking whether `claude` is reachable. On a machine without the
 * binary, tmux would happily create a session whose pane prints
 * "command not found", and the handler would still return { error: null } — a
 * success report for a session that cannot do anything.
 *
 * ipc-handlers.ts is otherwise untested directly (it is thin ipcMain wiring over
 * services that are themselves unit-tested), so this test mocks 'electron' and
 * './agent/registry' the same way tests/config/config-defaults.test.ts mocks
 * 'electron' — enough to invoke the real SESSION_CREATE handler body and observe
 * that an unavailable adapter now short-circuits before any file is written.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { describeMissingTool } from '../../src/main/util/missing-tool'

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null }>

describe('session:create — claude availability gate (F1)', () => {
  let userDataDir: string
  let projectDir: string

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('../../src/main/agent/registry')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('returns a real error and writes nothing when the adapter reports claude unavailable', async () => {
    let registeredHandler: SessionCreateHandler | undefined

    vi.doMock('electron', () => ({
      app: { getPath: () => userDataDir },
      ipcMain: {
        handle: (channel: string, fn: SessionCreateHandler) => {
          if (channel === 'session:create') registeredHandler = fn
        },
        on: () => {},
      },
      BrowserWindow: class {},
      dialog: {},
    }))

    // Same shape as the real AdapterRegistry's public surface, but isAvailable()
    // is pinned to false and buildLaunchCommand() throws if ever reached — proof
    // the gate runs before the launch command is built, not just before tmux.
    vi.doMock('../../src/main/agent/registry', () => ({
      AdapterRegistry: class {
        register() {}
        // The adapter is now selected by the Rahmen's runtime (M2 section 11.4), not by
        // getDefault(). The gate reads nichtVerfuegbarGrund() straight from the adapter
        // now (I-1 fix round) — this mock answers the same way ClaudeCodeAdapter does,
        // via the real describeMissingTool, so the assertion below checks production
        // text rather than a string invented for the test.
        getForRuntime() {
          return {
            id: 'claude-code',
            displayName: 'Claude Code',
            niveau: 'A',
            isAvailable: () => false,
            nichtVerfuegbarGrund: () => describeMissingTool('claude'),
            buildLaunchCommand: () => {
              throw new Error('buildLaunchCommand must not run when claude is unavailable')
            },
          }
        }
      },
    }))

    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')

    const fakeTmux = {
      listSessions: vi.fn(),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      createSession: vi.fn(),
      watchSession: vi.fn(),
    }
    registerIpcHandlers({ tmux: fakeTmux } as never)

    expect(registeredHandler).toBeDefined()
    const result = await registeredHandler!({}, { name: 'gate-test-session', cwd: projectDir })

    expect(result.id).toBeNull()
    expect(result.name).toBeNull()
    expect(result.error).toMatch(/claude code cli nicht gefunden/i)

    // The launch never reached tmux...
    expect(fakeTmux.createSession).not.toHaveBeenCalled()
    // ...and left no orphaned prompt file...
    expect(fs.existsSync(path.join(userDataDir, 'entity-prompts'))).toBe(false)
    // ...nor a rewritten .claude/capabilities/ tree in the target project.
    expect(fs.existsSync(path.join(projectDir, '.claude'))).toBe(false)
  })
})
