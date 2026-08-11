/**
 * session-create-adapter-selection.test.ts
 *
 * Two production facts that unit tests on AdapterRegistry alone cannot establish,
 * because both are about the caller rather than the registry:
 *
 *   1. registerIpcHandlers registers the NanoClaw adapter. main.ts used to construct
 *      NanoClawChannelAdapter into `const _nanoClawAdapter` and drop it, so the second
 *      Schenkel was built and unreachable.
 *   2. session:create picks the adapter by the Rahmen's `runtime` (M2 section 11.4)
 *      rather than by getDefault(), which ignored the field entirely.
 *
 * Uses the vi.doMock('electron') pattern from session-create-claude-gate.test.ts to
 * reach the real SESSION_CREATE handler body.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null }>

describe('session:create — adapter selection', () => {
  let userDataDir: string
  let projectDir: string
  let registeredAdapterIds: string[]
  let requestedRuntimes: (string | undefined)[]

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
    registeredAdapterIds = []
    requestedRuntimes = []
  })

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('../../src/main/agent/registry')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  async function loadHandler(
    adapterOpts: { niveau?: string; available?: boolean } = {},
  ): Promise<SessionCreateHandler> {
    const niveau = adapterOpts.niveau ?? 'A'
    const available = adapterOpts.available ?? false
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

    // Records what the production code registers and asks for. isAvailable() is pinned
    // to false so the handler short-circuits before touching tmux or the filesystem —
    // this test is about adapter selection, not about launching.
    vi.doMock('../../src/main/agent/registry', () => ({
      AdapterRegistry: class {
        register(adapter: { id: string }) {
          registeredAdapterIds.push(adapter.id)
        }
        getForRuntime(runtime: string | undefined) {
          requestedRuntimes.push(runtime)
          return {
            id: 'claude-code',
            displayName: 'Claude Code',
            niveau,
            isAvailable: () => available,
            buildLaunchCommand: () => {
              if (!available) {
                throw new Error('buildLaunchCommand must not run for an unavailable adapter')
              }
              return { cmd: 'claude', args: [] }
            },
          }
        }
        getDefault() {
          throw new Error('getDefault() must not be used — the Rahmen declares the runtime')
        }
      },
    }))

    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')
    registerIpcHandlers({
      tmux: {
        listSessions: vi.fn(),
        isConnected: vi.fn(() => true),
        connect: vi.fn(),
        createSession: vi.fn(),
        watchSession: vi.fn(),
      },
      nanoClawBridge: { isConnected: () => false },
    } as never)

    expect(registeredHandler).toBeDefined()
    return registeredHandler!
  }

  it('registers the NanoClaw adapter so the second Schenkel is reachable', async () => {
    await loadHandler()
    expect(registeredAdapterIds).toContain('nanoclaw-channel')
  })

  it('builds the definition at the niveau the resolved adapter declares', async () => {
    // A Niveau-B adapter must not get a prompt full of @-references: a harness without
    // native lazy-loading does not resolve them, so the entity would lose its whole
    // capability layer silently. Observing the written prompt is the only way to see
    // which niveau the definition was actually built at.
    const handler = await loadHandler({ niveau: 'B', available: true })
    const result = await handler({}, {
      entityId: 'architect', name: 'niveau-b-session', cwd: projectDir,
    })

    expect(result.error).toBeNull()
    const promptFile = path.join(userDataDir, 'entity-prompts', 'niveau-b-session.md')
    const prompt = fs.readFileSync(promptFile, 'utf8')
    expect(prompt).not.toMatch(/^@/m)
  })

  it('keeps emitting @-references for a Niveau-A adapter', async () => {
    const handler = await loadHandler({ niveau: 'A', available: true })
    await handler({}, { entityId: 'architect', name: 'niveau-a-session', cwd: projectDir })

    const prompt = fs.readFileSync(
      path.join(userDataDir, 'entity-prompts', 'niveau-a-session.md'), 'utf8',
    )
    expect(prompt).toMatch(/^@\.claude\/capabilities\//m)
  })

  it('selects the adapter by the Rahmen runtime, not by getDefault()', async () => {
    const handler = await loadHandler()
    // A name is required when no project is active — without it the handler returns
    // before it ever reaches adapter selection.
    await handler({}, { entityId: 'architect', name: 'adapter-selection-test', cwd: projectDir })
    expect(requestedRuntimes).toEqual(['claude-cli-tmux'])
  })
})
