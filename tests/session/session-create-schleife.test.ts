/**
 * session-create-schleife.test.ts — I-1 fix (Task 6 review).
 *
 * Task 6 built the SESSION_CREATE fork over Sitzungsart and the SESSION_DESTROY split between
 * a loop cell and a tmux pane, but no test drove either through the real handler body:
 * session-create-adapter-selection.test.ts and session-create-claude-gate.test.ts both exercise
 * the fremdes-cli branch only, and nothing called SESSION_DESTROY at all. This repo has shipped
 * something built, tested and unreachable from the app before (the review named it explicitly)
 * — this file is the wiring proof: real handler bodies, `electron` and `./agent/registry`
 * mocked the same way the two sibling files do, observation over `fs` and the tmux attrappe.
 *
 * One seam needs a partial mock rather than a full one: SESSION_CREATE never sets a cell to
 * `laeuft` today (SESSION_AUFTRAG, the channel that will, is a later task per progress.md) —
 * there is no way to reach that state through the public IPC surface yet. The abort test below
 * captures the *real* Zellenregister instance ipc-handlers.ts builds (via
 * `vi.importActual` + a wrapped `neuesRegister`) and calls its real `setzeLauf` directly, which
 * exercises the identical registry code path a real run would use — not a stand-in for it.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SITZUNG_EIGENE_SCHLEIFE } from '../../src/main/agent/agent-adapter'
import type { Zellenregister } from '../../src/main/session/schleifen-sitzungen'

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null; sitzungsart?: string }>

type SessionDestroyHandler = (
  event: unknown,
  name: string,
) => Promise<{ ok: boolean; error: string | null }>

describe('session:create / session:destroy — die Schleifen-Sitzungsart (I-1)', () => {
  let userDataDir: string
  let projectDir: string
  let brichAbCalls: string[]
  let capturedRegister: Zellenregister | undefined

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
    brichAbCalls = []
    capturedRegister = undefined
  })

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('../../src/main/agent/registry')
    vi.doUnmock('../../src/main/session/schleifen-sitzungen')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  async function loadHandlers(opts: { platzBelegt: boolean }): Promise<{
    create: SessionCreateHandler
    destroy: SessionDestroyHandler
    fakeTmux: {
      createSession: ReturnType<typeof vi.fn>
      killSession: ReturnType<typeof vi.fn>
      unwatchSession: ReturnType<typeof vi.fn>
    }
  }> {
    let registeredCreate: SessionCreateHandler | undefined
    let registeredDestroy: SessionDestroyHandler | undefined

    vi.doMock('electron', () => ({
      app: { getPath: () => userDataDir },
      ipcMain: {
        handle: (channel: string, fn: SessionCreateHandler | SessionDestroyHandler) => {
          if (channel === 'session:create') registeredCreate = fn as SessionCreateHandler
          if (channel === 'session:destroy') registeredDestroy = fn as SessionDestroyHandler
        },
        on: () => {},
      },
      BrowserWindow: class {},
      dialog: {},
    }))

    // Same mock shape as the two sibling files (getForRuntime), plus `get(id)` — SESSION_DESTROY
    // reaches the registry a second way, via adapterRegistry.get('keel-harness'), to find the
    // adapter that can abort a running cell.
    vi.doMock('../../src/main/agent/registry', () => ({
      AdapterRegistry: class {
        register() {}
        getForRuntime() {
          return {
            id: 'keel-harness',
            displayName: 'keel-Harness',
            niveau: 'B',
            sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
            isAvailable: () => true,
            nichtVerfuegbarGrund: () => null,
            buildLaunchCommand: () => {
              throw new Error('buildLaunchCommand must not run on the loop path')
            },
          }
        }
        get(id: string) {
          if (id !== 'keel-harness') return undefined
          return {
            id: 'keel-harness',
            sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
            brichAb: (laufId: string) => { brichAbCalls.push(laufId) },
          }
        }
      },
    }))

    // Captures the *real* Zellenregister instance session:create builds at module load, so
    // the abort test can drive it with the real setzeLauf rather than a stand-in for it.
    vi.doMock('../../src/main/session/schleifen-sitzungen', async () => {
      const actual = await vi.importActual<
        typeof import('../../src/main/session/schleifen-sitzungen')
      >('../../src/main/session/schleifen-sitzungen')
      return {
        ...actual,
        neuesRegister: () => {
          const reg = actual.neuesRegister()
          capturedRegister = reg
          return reg
        },
      }
    })

    const { configStore } = await import('../../src/main/config/config-store')
    // A real bundled entry (model/defaults.ts), not a hand-built one: eintragFuerSitzung
    // ('niveau-b') must resolve to something baueSchleifenSitzung accepts, or every test
    // here would fail on "Platz nicht belegt" before reaching what it actually checks.
    configStore.set('modelle', {
      eintraege: [],
      zuordnung: {
        tiers: { light: '', standard: '', heavy: '' },
        rollen: { tagging: '', worker: '', rechercheur: '' },
        sitzungen: { 'niveau-b': opts.platzBelegt ? 'spark-qwen38-27b' : '' },
      },
    })

    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')
    const fakeTmux = {
      listSessions: vi.fn(),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      createSession: vi.fn(),
      watchSession: vi.fn(),
      unwatchSession: vi.fn(),
      killSession: vi.fn(),
    }
    registerIpcHandlers({ tmux: fakeTmux } as never)

    expect(registeredCreate).toBeDefined()
    expect(registeredDestroy).toBeDefined()
    return { create: registeredCreate!, destroy: registeredDestroy!, fakeTmux }
  }

  it('materialises capabilities, writes no prompt file, and never touches tmux', async () => {
    const { create, fakeTmux } = await loadHandlers({ platzBelegt: true })
    const result = await create({}, {
      entityId: 'keel-arbeiter', name: 'schleife-session', cwd: projectDir,
    })

    expect(result.error).toBeNull()
    expect(result.id).toBe('schleife-session')
    expect(result.sitzungsart).toBe(SITZUNG_EIGENE_SCHLEIFE)

    // .claude/capabilities/ IS written — Task 6's own correction (Punkt 2 of the brief): this
    // is how the loop's capabilities reach the model, via faehigkeit_lesen, not a cached prompt.
    expect(fs.existsSync(path.join(projectDir, '.claude', 'capabilities'))).toBe(true)

    // ...but no entity-prompts/<name>.md — that file only exists for a pane-driven session.
    expect(fs.existsSync(
      path.join(userDataDir, 'entity-prompts', 'schleife-session.md')
    )).toBe(false)

    // ...and no pane: createSession is the tmux-only path, never reached here.
    expect(fakeTmux.createSession).not.toHaveBeenCalled()
  })

  it('writes no capabilities when the sitzung:niveau-b slot is empty (M-2 ordering)', async () => {
    const { create } = await loadHandlers({ platzBelegt: false })
    const result = await create({}, {
      entityId: 'keel-arbeiter', name: 'schleife-leer', cwd: projectDir,
    })

    expect(result.error).toContain('Einstellungen')
    expect(result.id).toBeNull()
    // baueSchleifenSitzung's own gate (schleifen-start.ts) must run BEFORE
    // materialiseCapabilities, not after — an empty slot leaves no rewritten
    // .claude/capabilities/ tree behind, same "gate before any write" rule as isAvailable().
    expect(fs.existsSync(path.join(projectDir, '.claude', 'capabilities'))).toBe(false)
  })

  it('destroy: removes an idle cell without aborting and without touching tmux', async () => {
    const { create, destroy, fakeTmux } = await loadHandlers({ platzBelegt: true })
    await create({}, { entityId: 'keel-arbeiter', name: 'schleife-idle', cwd: projectDir })
    expect(capturedRegister?.hole('schleife-idle')?.zustand).toBe('leerlaufend')

    const result = await destroy({}, 'schleife-idle')

    expect(result.ok).toBe(true)
    expect(fakeTmux.killSession).not.toHaveBeenCalled()
    // Idle means no run to abort — brichAb must not fire for a cell that never had one.
    expect(brichAbCalls).toEqual([])
    // The cell is really gone, not just reported gone.
    expect(capturedRegister?.hole('schleife-idle')).toBeUndefined()
  })

  it('destroy: aborts a running cell via brichAb, removes it, and never calls killSession', async () => {
    const { create, destroy, fakeTmux } = await loadHandlers({ platzBelegt: true })
    await create({}, { entityId: 'keel-arbeiter', name: 'schleife-laeuft', cwd: projectDir })

    // Flips the cell to `laeuft` through the real Zellenregister.setzeLauf — the same call
    // SESSION_AUFTRAG (not yet built) will make in production once a run actually starts.
    capturedRegister!.setzeLauf('schleife-laeuft', 'lauf-1')
    expect(capturedRegister!.hole('schleife-laeuft')!.zustand).toBe('laeuft')

    const result = await destroy({}, 'schleife-laeuft')

    expect(result.ok).toBe(true)
    expect(brichAbCalls).toEqual(['lauf-1'])
    expect(fakeTmux.killSession).not.toHaveBeenCalled()
    expect(capturedRegister?.hole('schleife-laeuft')).toBeUndefined()
  })

  it('destroy: a name with no cell still goes through the unchanged tmux path', async () => {
    const { destroy, fakeTmux } = await loadHandlers({ platzBelegt: true })

    const result = await destroy({}, 'never-registered-as-a-cell')

    expect(result.ok).toBe(true)
    expect(fakeTmux.unwatchSession).toHaveBeenCalledWith('never-registered-as-a-cell')
    expect(fakeTmux.killSession).toHaveBeenCalledWith('never-registered-as-a-cell')
    expect(brichAbCalls).toEqual([])
  })
})
