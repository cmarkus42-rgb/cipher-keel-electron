/**
 * tests/service-lifecycle.test.ts — fenster-unabhaengige, idempotente Service-Init.
 *
 * Befund 1 (verifiziert 2026-08-06): Beim App-Start wurde nie initialisiert; graphDb,
 * kanbanStore und noteManager blieben null, bis der Nutzer das Grid-Fenster oeffnete.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import * as fsSync from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Only isCommandOnPath is overridden per-test (claudeCli status); every other
// export stays real so tmux/graph/notes init in this file is unaffected.
vi.mock('../src/main/util/exec-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/main/util/exec-util')>()
  return { ...actual, isCommandOnPath: vi.fn(actual.isCommandOnPath) }
})

import {
  initializeServices,
  getServiceStatus,
  resetServiceLifecycle,
  shutdownServices,
  type ServiceInitContext,
} from '../src/main/service-lifecycle'
import { registerWindow, resetEventBus, type BroadcastTarget } from '../src/main/event-bus'
import { VoiceManager } from '../src/main/voice/voice-manager'
import type { AppServices } from '../src/main/window-manager'
import { isCommandOnPath } from '../src/main/util/exec-util'
import { describeMissingTool } from '../src/main/util/missing-tool'

let userDataPath: string

/** Minimal fakes — only the members service-lifecycle actually touches. */
function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    tmux: {
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    },
    statusMonitor: { start: vi.fn(), stop: vi.fn(), on: vi.fn() },
    voiceManager: null,
    graphDb: null,
    graphWriter: null,
    graphMcpServer: null,
    mcpHttpServer: null,
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

function makeWindow(): BroadcastTarget & { sent: Array<{ channel: string; args: unknown[] }> } {
  const win = {
    sent: [] as Array<{ channel: string; args: unknown[] }>,
    webContents: {
      send(channel: string, ...args: unknown[]) {
        win.sent.push({ channel, args })
      },
    },
    isDestroyed: () => false,
    once: (_event: 'closed', _cb: () => void) => { /* not exercised here */ },
  }
  return win
}

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'keel-lifecycle-'))
  resetServiceLifecycle()
  resetEventBus()
})

afterEach(async () => {
  // NoteManager's constructor fires an un-awaited fs.mkdir(notesDir), and
  // NoteWatcher holds an fs.watch() on it (both pre-existing, out of scope here —
  // see the module doc comment on the same flake class with NoteWatcher). With
  // this file now calling initializeServices many more times per run, those can
  // still be in flight when userDataPath is removed below, racing rmSync into an
  // ENOTEMPTY/ENOENT under load. A tick plus a few retries absorbs that without
  // masking a real failure — this is test-harness hygiene, not a production fix.
  await new Promise((resolve) => setImmediate(resolve))
  for (let attempt = 1; ; attempt++) {
    try {
      rmSync(userDataPath, { recursive: true, force: true })
      return
    } catch (err) {
      if (attempt >= 5) throw err
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt))
    }
  }
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

// ---------------------------------------------------------------------------
// Paket B — der MCP-Transport, seit Paket D auf einem Unix-Socket
// ---------------------------------------------------------------------------

describe('initializeServices — mcp transport (Paket B/D)', () => {
  it('startet einen Server auf einem Socket unter userData, nicht auf einem TCP-Port', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())

    expect(services.mcpHttpServer).not.toBeNull()
    expect(services.mcpHttpServer!.sockelPfad.endsWith('.sock')).toBe(true)
    expect(fsSync.statSync(services.mcpHttpServer!.sockelPfad).isSocket()).toBe(true)
    // Ein TCP-Listener gaebe hier ein AddressInfo-Objekt zurueck. Diese Zeile sieht einen
    // Rueckfall auf 127.0.0.1 — und der waere kein Schoenheitsfehler, sondern machte den
    // Sandkasten durchlaessig (siehe den Modulkopf von graph/mcp-http-server.ts).
    expect(services.mcpHttpServer!.server.address()).toBe(services.mcpHttpServer!.sockelPfad)
  })

  it('reports mcp as ready once graph is ready', async () => {
    const status = await initializeServices(makeServices(), makeContext())

    expect(status.mcp.state).toBe('ready')
  })

  it('serves the real graphMcpServer instance — ein echter Aufruf ueber den Socket erreicht ein Werkzeug', async () => {
    const services = makeServices()
    await initializeServices(services, makeContext())

    const rumpf = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const text = await new Promise<string>((aufl, ab) => {
      const anfrage = httpRequest(
        {
          socketPath: services.mcpHttpServer!.sockelPfad,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(rumpf),
          },
        },
        (antwort) => {
          let t = ''
          antwort.on('data', (c) => { t += c })
          antwort.on('end', () => aufl(t))
        },
      )
      anfrage.on('error', ab)
      anfrage.end(rumpf)
    })
    const json = JSON.parse(text) as { result: { tools: Array<{ name: string }> } }
    expect(json.result.tools.map((t) => t.name)).toContain('graph_search')
  })

  it('entfernt die Socketdatei beim Herunterfahren — close() tut das nicht', async () => {
    const services = makeServices()
    await initializeServices(services, makeContext())
    const pfad = services.mcpHttpServer!.sockelPfad
    expect(fsSync.existsSync(pfad)).toBe(true)

    await shutdownServices(services)

    expect(fsSync.existsSync(pfad)).toBe(false)
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

  // 'marks nanoclaw degraded when the socket is unreachable' removed with the NanoClaw
  // subsystem (2026-08-17): initNanoClaw(), the 'nanoclaw' SubsystemId and
  // services.nanoClawBridge are gone. This coverage — a Schenkel-2 harness reporting
  // degraded when its transport is unreachable — returns only if a future harness
  // reintroduces a connect()-then-degrade path with its own SubsystemId.

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

describe('initializeServices — claudeCli status (Task 6 fix)', () => {
  it('reports claudeCli ready when the CLI is present', async () => {
    vi.mocked(isCommandOnPath).mockReturnValueOnce(true)

    const status = await initializeServices(makeServices(), makeContext())

    expect(status.claudeCli).toEqual({ id: 'claudeCli', state: 'ready', reason: null })
  })

  it('reports claudeCli degraded with an install instruction when absent, without blocking anything else', async () => {
    vi.mocked(isCommandOnPath).mockReturnValueOnce(false)

    const status = await initializeServices(makeServices(), makeContext())

    expect(status.claudeCli.state).toBe('degraded')
    expect(status.claudeCli.reason).toBe(describeMissingTool('claude'))
    // A missing CLI is a status, not a gate — the rest of the app stays usable.
    expect(status.graph.state).toBe('ready')
    expect(status.notes.state).toBe('ready')
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

// ---------------------------------------------------------------------------
// Befund 4 — voice must not block graph/notes
// ---------------------------------------------------------------------------

describe('initializeServices — voice does not block graph/notes (Befund 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves without waiting for voice.init() to settle', async () => {
    let releaseVoice: ((v: { stt: boolean; tts: boolean }) => void) | null = null
    const voiceGate = new Promise<{ stt: boolean; tts: boolean }>((resolve) => {
      releaseVoice = resolve
    })
    const initSpy = vi.spyOn(VoiceManager.prototype, 'init').mockReturnValue(voiceGate)

    const services = makeServices()
    // If runInit still awaited initVoice ahead of graph/notes, this would hang
    // forever — voiceGate is deliberately never resolved before this await.
    const status = await initializeServices(services, {
      userDataPath, appPath: process.cwd(), voiceEnabled: true,
    })

    expect(status.graph.state).toBe('ready')
    expect(status.notes.state).toBe('ready')
    expect(initSpy).toHaveBeenCalled()

    // Cleanup: let the pending voice init settle so it doesn't leak between tests.
    releaseVoice!({ stt: false, tts: false })
    await voiceGate
  })

  it('still reports voice status once it settles, via a later status-changed broadcast', async () => {
    let releaseVoice: ((v: { stt: boolean; tts: boolean }) => void) | null = null
    const voiceGate = new Promise<{ stt: boolean; tts: boolean }>((resolve) => {
      releaseVoice = resolve
    })
    vi.spyOn(VoiceManager.prototype, 'init').mockReturnValue(voiceGate)

    const win = makeWindow()
    registerWindow(win)

    const services = makeServices()
    await initializeServices(services, {
      userDataPath, appPath: process.cwd(), voiceEnabled: true,
    })

    // Voice hasn't settled yet — no voice transition broadcast so far.
    expect(win.sent.some(m => (m.args[0] as { id: string }).id === 'voice')).toBe(false)

    releaseVoice!({ stt: true, tts: false })
    await voiceGate
    // Allow the .then chain inside initVoice to run.
    await new Promise((r) => setImmediate(r))

    const voiceMsg = win.sent.find(m => (m.args[0] as { id: string }).id === 'voice')
    expect(voiceMsg?.args[0]).toEqual({ id: 'voice', state: 'ready', reason: null })
  })
})

// ---------------------------------------------------------------------------
// Befund 3 — services:status-changed has a producer
// ---------------------------------------------------------------------------

describe('setStatus broadcasts services:status-changed (Befund 3)', () => {
  it('broadcasts one message per subsystem that actually transitions', async () => {
    const win = makeWindow()
    registerWindow(win)

    await initializeServices(makeServices(), makeContext())

    const statusMessages = win.sent.filter(m => m.channel === 'services:status-changed')
    // Default happy path: tmux, claudeCli, voice (disabled), graph, kanban, notes, mcp —
    // each transitions exactly once away from its "not initialized" baseline.
    expect(statusMessages).toHaveLength(7)
    const ids = statusMessages.map(m => (m.args[0] as { id: string }).id).sort()
    expect(ids).toEqual(['claudeCli', 'graph', 'kanban', 'mcp', 'notes', 'tmux', 'voice'].sort())
  })

  it('carries the subsystem id, state and reason as the payload', async () => {
    const win = makeWindow()
    registerWindow(win)

    const services = makeServices({
      tmux: {
        connect: vi.fn().mockRejectedValue(new Error('tmux missing')),
        on: vi.fn(),
        sendKeys: vi.fn(),
        disconnect: vi.fn(),
      },
    } as unknown as Partial<AppServices>)

    await initializeServices(services, makeContext())

    const tmuxMsg = win.sent.find(
      m => m.channel === 'services:status-changed' && (m.args[0] as { id: string }).id === 'tmux',
    )
    expect(tmuxMsg?.args[0]).toEqual({ id: 'tmux', state: 'degraded', reason: 'tmux missing' })
  })

  it('reaches every registered window, not just one', async () => {
    const a = makeWindow()
    const b = makeWindow()
    registerWindow(a)
    registerWindow(b)

    await initializeServices(makeServices(), makeContext())

    expect(a.sent.filter(m => m.channel === 'services:status-changed').length).toBeGreaterThan(0)
    expect(b.sent.filter(m => m.channel === 'services:status-changed').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Befund 2 — shutdownServices: the missing disposer counterpart
// ---------------------------------------------------------------------------

describe('shutdownServices', () => {
  it('calls the disposer of every service that has one', () => {
    const services = makeServices({
      noteWatcher: { stop: vi.fn() },
      voiceManager: { stopSession: vi.fn() },
    } as unknown as Partial<AppServices>)

    shutdownServices(services)

    expect((services.tmux as unknown as { disconnect: () => void }).disconnect).toHaveBeenCalled()
    expect((services.statusMonitor as unknown as { stop: () => void }).stop).toHaveBeenCalled()
  })

  it('nulls the refs it tears down, including kanbanStore', () => {
    const fakeDb = { close: vi.fn() }
    const fakeMcpServer = { close: vi.fn() }
    const services = makeServices({
      noteWatcher: { stop: vi.fn() },
      voiceManager: { stopSession: vi.fn() },
      graphDb: fakeDb,
      graphWriter: {},
      graphMcpServer: {},
      mcpHttpServer: { server: fakeMcpServer, port: 12345, apiKey: 'x', url: 'http://127.0.0.1:12345/mcp' },
      kanbanStore: {},
    } as unknown as Partial<AppServices>)

    shutdownServices(services)

    expect(services.noteWatcher).toBeNull()
    expect(services.voiceManager).toBeNull()
    expect(services.graphDb).toBeNull()
    expect(services.graphWriter).toBeNull()
    expect(services.graphMcpServer).toBeNull()
    expect(services.mcpHttpServer).toBeNull()
    expect(services.kanbanStore).toBeNull()
    expect(fakeDb.close).toHaveBeenCalled()
    expect(fakeMcpServer.close).toHaveBeenCalled()
  })

  it('one disposer throwing does not prevent the rest from running', () => {
    const services = makeServices({
      noteWatcher: { stop: vi.fn(() => { throw new Error('watcher gone') }) },
      voiceManager: { stopSession: vi.fn() },
      graphDb: { close: vi.fn() },
    } as unknown as Partial<AppServices>)
    ;(services.tmux as unknown as { disconnect: () => void }).disconnect = vi.fn(() => {
      throw new Error('tmux gone')
    })

    expect(() => shutdownServices(services)).not.toThrow()

    expect((services.voiceManager as unknown as { stopSession: () => void } | null)).toBeNull()
    expect((services.graphDb as unknown as { close: () => void } | null)).toBeNull()
  })

  it('resets getServiceStatus() to the pre-init baseline — graph is no longer "ready"', async () => {
    const services = makeServices()
    await initializeServices(services, makeContext())
    expect(getServiceStatus().graph.state).toBe('ready')

    shutdownServices(services)

    expect(getServiceStatus().graph.state).toBe('degraded')
    expect(getServiceStatus().graph.reason).toContain('not initialized')
  })

  it('resets the initPromise latch — a later initializeServices call actually re-runs', async () => {
    const services = makeServices()
    await initializeServices(services, makeContext())
    expect(services.tmux.connect).toHaveBeenCalledTimes(1)

    shutdownServices(services)
    resetEventBus()

    await initializeServices(services, makeContext())
    expect(services.tmux.connect).toHaveBeenCalledTimes(2)
  })

  it('does not broadcast on shutdown', () => {
    const win = makeWindow()
    registerWindow(win)

    const services = makeServices({
      noteWatcher: { stop: vi.fn() },
      voiceManager: { stopSession: vi.fn() },
      graphDb: { close: vi.fn() },
    } as unknown as Partial<AppServices>)

    shutdownServices(services)

    expect(win.sent.filter(m => m.channel === 'services:status-changed')).toHaveLength(0)
  })

  it('is safe to call when no service was ever initialized', () => {
    const services = makeServices()
    expect(() => shutdownServices(services)).not.toThrow()
  })
})
