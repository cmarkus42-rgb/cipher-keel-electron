/**
 * session-create-adapter-selection.test.ts
 *
 * A production fact that unit tests on AdapterRegistry alone cannot establish, because
 * it is about the caller rather than the registry:
 *
 *   session:create picks the adapter by the Rahmen's `runtime` (M2 section 11.4) rather
 *   than by getDefault(), which ignored the field entirely.
 *
 * Uses the vi.doMock('electron') pattern from session-create-claude-gate.test.ts to
 * reach the real SESSION_CREATE handler body.
 *
 * This file used to establish a second fact too: registerIpcHandlers registered the
 * NanoClaw adapter as a second Schenkel (main.ts used to construct
 * NanoClawChannelAdapter into `const _nanoClawAdapter` and drop it, leaving that second
 * Schenkel built and unreachable). Removed with the NanoClaw subsystem (2026-08-17) —
 * see the note at the former test site (below) for the coverage that fell away.
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
  let launchOpts: { model?: string }[]

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
    registeredAdapterIds = []
    requestedRuntimes = []
    launchOpts = []
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

    // getForRuntime() records what production code asks for (requestedRuntimes).
    // register() still writes to registeredAdapterIds, but nothing reads it today —
    // production no longer calls register() at all. The spy stays as the hook the
    // coverage described in the note at lines 120-126 below will use once it returns.
    // isAvailable() is pinned to false so the handler short-circuits before touching
    // tmux or the filesystem — this test is about adapter selection, not about launching.
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
            // The real gate now reads this instead of building its own text (I-1 fix
            // round) — a mock without it would throw TypeError the moment isAvailable()
            // is false, before ever reaching the assertions this test cares about.
            nichtVerfuegbarGrund: () => (available ? null : 'CLI-Adapter nicht verfuegbar (Testattrappe)'),
            buildLaunchCommand: (opts: { model?: string }) => {
              if (!available) {
                throw new Error('buildLaunchCommand must not run for an unavailable adapter')
              }
              launchOpts.push(opts)
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
    } as never)

    expect(registeredHandler).toBeDefined()
    return registeredHandler!
  }

  // 'registers the NanoClaw adapter so the second Schenkel is reachable' removed with
  // the NanoClaw subsystem (2026-08-17): registerIpcHandlers no longer registers a
  // second Schenkel at all, since NanoClawChannelAdapter is gone. This coverage — that
  // registerIpcHandlers actually reaches AdapterRegistry.register() for a non-default
  // adapter, not just the constructor-provided claude-code one — returns once keel's own
  // harness (see model-resolver.ts, c-worker.ts) ships an adapter that registers itself
  // the same way.

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

  it('passes the resolved model handle to the launch command', async () => {
    // The Architect's Rahmen says `model: 'heavy'`, which used to be dropped because it
    // maps to no model id. With the tier table it resolves — this is the one behaviour
    // change of this work, and it is what makes the strength gradient real.
    const handler = await loadHandler({ available: true })
    await handler({}, { entityId: 'architect', name: 'model-tier-session', cwd: projectDir })

    expect(launchOpts).toHaveLength(1)
    expect(launchOpts[0].model).toBe('opus')
  })

  it('selects the adapter by the Rahmen runtime, not by getDefault()', async () => {
    const handler = await loadHandler()
    // A name is required when no project is active — without it the handler returns
    // before it ever reaches adapter selection.
    await handler({}, { entityId: 'architect', name: 'adapter-selection-test', cwd: projectDir })
    expect(requestedRuntimes).toEqual(['claude-cli-tmux'])
  })
})
