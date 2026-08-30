/**
 * session-create-injection-rollback.test.ts — I-1 follow-up (security review, 2026-08-30).
 *
 * The finding: moving postLaunchInjection ahead of tmux.createSession (the original I-1 fix,
 * see ipc-handlers.ts's comment at the SESSION_CREATE handler) closed the race against the
 * CLI's own one-time config read, but opened a narrower gap — if createSession now fails
 * AFTER injection already wrote a live bearer key into the project's settings.local.json,
 * that key is orphaned: a valid credential for a session that never came to exist, and the
 * outer catch only reported the tmux failure without cleaning anything up.
 *
 * The security review noted explicitly that no existing session-create-*.test.ts file makes
 * createSession fail after a successful injection — this file is that missing case. Same
 * pattern as session-create-adapter-selection.test.ts: mock 'electron' and
 * './agent/registry' enough to reach the real SESSION_CREATE handler body.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SITZUNG_FREMDES_CLI } from '../../src/main/agent/agent-adapter'

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null }>

describe('session:create — rolling back a successful injection when createSession fails (I-1 follow-up)', () => {
  let userDataDir: string
  let projectDir: string
  let undoSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
    undoSpy = vi.fn()
  })

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('../../src/main/agent/registry')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  async function loadHandler(): Promise<SessionCreateHandler> {
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

    vi.doMock('../../src/main/agent/registry', () => ({
      AdapterRegistry: class {
        register() {}
        getForRuntime() {
          return {
            id: 'claude-code',
            displayName: 'Claude Code',
            niveau: 'A',
            sitzungsart: SITZUNG_FREMDES_CLI,
            isAvailable: () => true,
            nichtVerfuegbarGrund: () => null,
            buildLaunchCommand: () => ({ cmd: 'claude', args: [] }),
            // The one call this whole file is about: succeeds, and hands back an undo
            // closure the handler must call when createSession subsequently fails.
            postLaunchInjection: vi.fn().mockResolvedValue(undoSpy),
          }
        }
      },
    }))

    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')
    registerIpcHandlers({
      tmux: {
        listSessions: vi.fn(),
        isConnected: vi.fn(() => true),
        connect: vi.fn(),
        // The failure this whole test is about: tmux itself rejects, AFTER injection
        // already ran (injection runs first per the I-1 fix — see the call site).
        createSession: vi.fn().mockRejectedValue(new Error('tmux: no server running')),
        watchSession: vi.fn(),
      },
      mcpHttpServer: {
        url: 'http://127.0.0.1:54321/mcp',
        apiKey: 'test-boot-key',
      },
    } as never)

    expect(registeredHandler).toBeDefined()
    return registeredHandler!
  }

  it('calls the undo closure when createSession fails after a successful injection', async () => {
    const handler = await loadHandler()

    await handler({}, { entityId: 'architect', name: 'rollback-test-session', cwd: projectDir })

    expect(undoSpy).toHaveBeenCalledTimes(1)
  })

  it('surfaces both the tmux failure and the residual-CLI-entry note in the returned error', async () => {
    const handler = await loadHandler()

    const result = await handler({}, { entityId: 'architect', name: 'rollback-test-session-2', cwd: projectDir })

    expect(result.id).toBeNull()
    expect(result.error).toContain('tmux: no server running')
    // The part path 1's rollback cannot cover — named to the caller instead of silently
    // dropped, per the review's "benenn die Tatsache" instruction.
    expect(result.error).toMatch(/claude-CLI registrierter Eintrag/)
  })

  it('does NOT call the undo closure when createSession succeeds', async () => {
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
    vi.doMock('../../src/main/agent/registry', () => ({
      AdapterRegistry: class {
        register() {}
        getForRuntime() {
          return {
            id: 'claude-code',
            displayName: 'Claude Code',
            niveau: 'A',
            sitzungsart: SITZUNG_FREMDES_CLI,
            isAvailable: () => true,
            nichtVerfuegbarGrund: () => null,
            buildLaunchCommand: () => ({ cmd: 'claude', args: [] }),
            postLaunchInjection: vi.fn().mockResolvedValue(undoSpy),
          }
        }
      },
    }))
    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')
    registerIpcHandlers({
      tmux: {
        listSessions: vi.fn(),
        isConnected: vi.fn(() => true),
        connect: vi.fn(),
        createSession: vi.fn().mockResolvedValue('$1'),
        watchSession: vi.fn(),
      },
      mcpHttpServer: { url: 'http://127.0.0.1:54321/mcp', apiKey: 'test-boot-key' },
    } as never)

    const result = await registeredHandler!({}, { entityId: 'architect', name: 'happy-path-session', cwd: projectDir })

    expect(result.error).toBeNull()
    expect(undoSpy).not.toHaveBeenCalled()
  })
})
