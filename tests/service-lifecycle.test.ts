/**
 * tests/service-lifecycle.test.ts — fenster-unabhaengige, idempotente Service-Init.
 *
 * Befund 1 (verifiziert 2026-08-06): Beim App-Start wurde nie initialisiert; graphDb,
 * kanbanStore und noteManager blieben null, bis der Nutzer das Grid-Fenster oeffnete.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeServices,
  getServiceStatus,
  resetServiceLifecycle,
  type ServiceInitContext,
} from '../src/main/service-lifecycle'
import { resetEventBus } from '../src/main/event-bus'
import type { AppServices } from '../src/main/window-manager'

let userDataPath: string

/** Minimal fakes — only the members service-lifecycle actually touches. */
function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    tmux: {
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      sendKeys: vi.fn().mockResolvedValue(undefined),
    },
    statusMonitor: { start: vi.fn(), on: vi.fn() },
    nanoClawBridge: { connect: vi.fn().mockResolvedValue(undefined), on: vi.fn() },
    voiceManager: null,
    graphDb: null,
    graphWriter: null,
    graphMcpServer: null,
    noteManager: null,
    noteTagging: null,
    tagClassRepo: null,
    tagIndex: null,
    noteWatcher: null,
    kanbanStore: null,
    ...overrides,
  } as unknown as AppServices
}

function makeContext(): ServiceInitContext {
  return { userDataPath, appPath: process.cwd(), voiceEnabled: false }
}

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'keel-lifecycle-'))
  resetServiceLifecycle()
  resetEventBus()
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('initializeServices — graph (Befund 1)', () => {
  it('populates graphDb, graphWriter and kanbanStore', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())

    expect(services.graphDb).not.toBeNull()
    expect(services.graphWriter).not.toBeNull()
    expect(services.kanbanStore).not.toBeNull()
  })

  it('reports graph and kanban as ready', async () => {
    const status = await initializeServices(makeServices(), makeContext())

    expect(status.graph.state).toBe('ready')
    expect(status.kanban.state).toBe('ready')
  })

  it('creates graph.db under the given userDataPath', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())

    expect(services.graphDb!.name).toBe(join(userDataPath, 'graph.db'))
  })
})

describe('initializeServices — notes', () => {
  it('populates the notes services and reports ready', async () => {
    const services = makeServices()

    const status = await initializeServices(services, makeContext())

    expect(services.noteManager).not.toBeNull()
    expect(services.tagIndex).not.toBeNull()
    expect(status.notes.state).toBe('ready')
  })
})

describe('initializeServices — idempotence', () => {
  it('is a no-op on the second call', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())
    const firstDb = services.graphDb
    await initializeServices(services, makeContext())

    expect(services.graphDb).toBe(firstDb)
    expect(services.tmux.connect).toHaveBeenCalledTimes(1)
  })

  it('shares one run between concurrent callers', async () => {
    const services = makeServices()

    await Promise.all([
      initializeServices(services, makeContext()),
      initializeServices(services, makeContext()),
    ])

    expect(services.tmux.connect).toHaveBeenCalledTimes(1)
  })
})

describe('initializeServices — degradation is reported, never thrown', () => {
  it('marks tmux degraded when connect rejects, without failing the run', async () => {
    const services = makeServices({
      tmux: {
        connect: vi.fn().mockRejectedValue(new Error('tmux missing')),
        on: vi.fn(),
        sendKeys: vi.fn(),
      },
    } as unknown as Partial<AppServices>)

    const status = await initializeServices(services, makeContext())

    expect(status.tmux.state).toBe('degraded')
    expect(status.tmux.reason).toContain('tmux missing')
    expect(status.graph.state).toBe('ready')
  })

  it('marks nanoclaw degraded when the socket is unreachable', async () => {
    const services = makeServices({
      nanoClawBridge: {
        connect: vi.fn().mockRejectedValue(new Error('ENOENT')),
        on: vi.fn(),
      },
    } as unknown as Partial<AppServices>)

    const status = await initializeServices(services, makeContext())

    expect(status.nanoclaw.state).toBe('degraded')
  })

  it('marks voice disabled — not degraded — when config switches it off', async () => {
    const status = await initializeServices(makeServices(), {
      userDataPath,
      appPath: process.cwd(),
      voiceEnabled: false,
    })

    expect(status.voice.state).toBe('disabled')
    expect(status.voice.reason).toContain('config')
  })

  it('does not block graph/notes init when statusMonitor.start() throws', async () => {
    const services = makeServices({
      statusMonitor: {
        start: vi.fn(() => {
          throw new Error('EACCES: permission denied')
        }),
        on: vi.fn(),
      },
    } as unknown as Partial<AppServices>)

    const status = await initializeServices(services, makeContext())

    expect(status.graph.state).toBe('ready')
    expect(status.notes.state).toBe('ready')
    expect(services.graphDb).not.toBeNull()
    expect(services.noteManager).not.toBeNull()
  })
})

describe('initializeServices — retry after a rejected run', () => {
  it('lets a later call succeed after a run that threw', async () => {
    const services = makeServices({
      tmux: {
        connect: vi.fn().mockResolvedValue(undefined),
        on: vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('boom')
          })
          .mockImplementation(() => {}),
        sendKeys: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Partial<AppServices>)

    await expect(initializeServices(services, makeContext())).rejects.toThrow('boom')

    const status = await initializeServices(services, makeContext())

    expect(status.graph.state).toBe('ready')
    expect(services.graphDb).not.toBeNull()
  })
})

describe('getServiceStatus', () => {
  it('reports every subsystem as degraded before initialization', () => {
    const status = getServiceStatus()

    expect(status.graph.state).toBe('degraded')
    expect(status.graph.reason).toContain('not initialized')
  })

  it('returns the post-init status after a run', async () => {
    await initializeServices(makeServices(), makeContext())

    expect(getServiceStatus().graph.state).toBe('ready')
  })
})
