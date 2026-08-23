/**
 * service-lifecycle.ts — window-independent background service initialization.
 *
 * Previously this lived in window-manager.ts and was only reachable via createMainWindow,
 * so the grid window had to be opened before any service existed. It now runs from
 * app.whenReady() and is idempotent.
 *
 * Everything electron-specific arrives through ServiceInitContext, so this module stays
 * testable without electron.
 *
 * CK-INF-025, CK-NFR-008 (startup budget), CK-NFR-010 (graceful degradation)
 */

import { join } from 'node:path'
import {
  SESSION_OUTPUT,
  STATUSLINE_CTX_UPDATE,
  NOTES_CHANGED,
  APP_READY,
  VOICE_STATE,
  VOICE_TRANSCRIPTION,
  VOICE_DISPATCHED,
  VOICE_ERROR,
  VOICE_PIN_STATUS,
  VOICE_ACTIVE_SESSION,
  SERVICES_STATUS_CHANGED,
  SESSION_STATUS_CHANGED,
} from '../shared/ipc-channels'
import {
  SUBSYSTEM_IDS,
  type ServiceStatusMap,
  type SubsystemId,
  type ServiceState,
  type SubsystemStatus,
} from '../shared/service-status'
import type { SessionStatusChanged } from '../shared/harness-types'
import { broadcast } from './event-bus'
import { isCommandOnPath } from './util/exec-util'
import { describeToolFailure, describeMissingTool } from './util/missing-tool'
import { openGraphDb } from './graph/db'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { GraphMcpServer } from './graph/mcp-server'
import { GraphWriter } from './graph/writer'
import { harnessDb } from './harness-sitzung'
import { lesen } from './harness'
import { VoiceManager } from './voice/voice-manager'
import { NoteManager } from './notes/note-manager'
import { NoteTagging } from './notes/note-tagging'
import { TagClassRepo } from './notes/tag-repository'
import { TagIndex } from './notes/tag-index'
import { NoteWatcher } from './notes/note-watcher'
import { KanbanStore } from './kanban/kanban-store'
import type { AppServices } from './window-manager'

export interface ServiceInitContext {
  /** Electron app.getPath('userData') — holds graph.db and notes/. */
  userDataPath: string
  /** Electron app.getAppPath() — used to locate the native better-sqlite3 addon. */
  appPath: string
  /** Whether the voice pipeline should be initialized at all. */
  voiceEnabled: boolean
}

// ---------------------------------------------------------------------------
// Status bookkeeping
// ---------------------------------------------------------------------------

function freshStatus(): ServiceStatusMap {
  const map = {} as ServiceStatusMap
  for (const id of SUBSYSTEM_IDS) {
    map[id] = { id, state: 'degraded', reason: 'not initialized' }
  }
  return map
}

let status: ServiceStatusMap = freshStatus()
let initPromise: Promise<ServiceStatusMap> | null = null

/**
 * Updates one subsystem's status and broadcasts the change to every live window
 * (Befund 3 — services:status-changed had no producer, so the StatusBar was a
 * startup snapshot). A no-op transition (same state + reason) is not broadcast,
 * so runInit's sequence of setStatus calls does not fire a storm of identical
 * messages during a normal startup.
 */
function setStatus(id: SubsystemId, state: ServiceState, reason: string | null): void {
  const prev = status[id]
  if (prev && prev.state === state && prev.reason === reason) return
  const next: SubsystemStatus = { id, state, reason }
  status[id] = next
  broadcast(SERVICES_STATUS_CHANGED, next)
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Current status of every subsystem. Safe to call before initialization. */
export function getServiceStatus(): ServiceStatusMap {
  return status
}

/** Test seam — clears status and the idempotence latch. */
export function resetServiceLifecycle(): void {
  status = freshStatus()
  initPromise = null
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Tears down every background service started by initializeServices. Mirrors
 * runInit: each disposer runs in its own try/catch so one failure (e.g. a socket
 * that is already gone) cannot prevent the rest from running. Called from
 * before-quit in main.ts.
 *
 * Resets the status map and the initPromise latch, so a later initializeServices
 * call (there is none today outside app lifecycle, but tests rely on this) starts
 * a clean run rather than replaying stale state.
 */
export function shutdownServices(services: AppServices): void {
  try {
    services.noteWatcher?.stop()
  } catch (err) {
    console.warn('[service-lifecycle] noteWatcher.stop() failed:', err)
  }
  services.noteWatcher = null

  try {
    services.statusMonitor.stop()
  } catch (err) {
    console.warn('[service-lifecycle] statusMonitor.stop() failed:', err)
  }

  try {
    services.tmux.disconnect()
  } catch (err) {
    console.warn('[service-lifecycle] tmux.disconnect() failed:', err)
  }

  try {
    services.voiceManager?.stopSession()
  } catch (err) {
    console.warn('[service-lifecycle] voiceManager.stopSession() failed:', err)
  }
  services.voiceManager = null

  // Graph DB close flushes WAL (CK-GRAPH-028). kanbanStore wraps the same
  // connection, so it must be nulled alongside it — otherwise it would keep
  // pointing at a closed database.
  try {
    services.graphDb?.close()
  } catch (err) {
    console.warn('[service-lifecycle] graphDb.close() failed:', err)
  }
  services.graphDb = null
  services.graphWriter = null
  services.graphMcpServer = null
  services.kanbanStore = null

  status = freshStatus()
  initPromise = null
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes all background services. Idempotent: repeated (and concurrent) calls
 * share the first run and never re-initialize.
 *
 * Voice is started but NOT awaited (Befund 4): initVoice awaits a Whisper model
 * load from disk and voice.enabled defaults to true, so awaiting it here would
 * gate the two UI-critical subsystems (graph, notes) behind the least UI-critical
 * one. Voice reports its own status via setStatus once it settles, which reaches
 * every window through services:status-changed (Befund 3). The promise this
 * function returns still resolves only once tmux, graph and notes have
 * settled — the ordering guarantee it promises for those subsystems holds.
 */
export function initializeServices(
  services: AppServices,
  ctx: ServiceInitContext,
): Promise<ServiceStatusMap> {
  if (!initPromise) {
    // A rejected run must not permanently poison the latch — clear it so a later
    // call can retry. The successful path is unaffected: initPromise stays set.
    initPromise = runInit(services, ctx).catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

async function runInit(
  services: AppServices,
  ctx: ServiceInitContext,
): Promise<ServiceStatusMap> {
  await initTmux(services)
  initClaudeCli()
  initStatusMonitor(services)

  // Fire-and-forget — see the doc comment on initializeServices. Errors are
  // handled inside initVoice itself (setStatus + console.warn), so a rejection
  // here can't escape as an unhandled rejection.
  void initVoice(services, ctx)

  initGraph(services, ctx)
  initNotes(services, ctx)

  broadcast(APP_READY, { timestamp: Date.now() })
  return status
}

/**
 * Reports whether the Claude Code CLI is reachable, as a subsystem status the
 * user can see at startup rather than only at launch time. `session:create`
 * (ipc-handlers.ts) runs the same `isCommandOnPath('claude')` check — via
 * `ClaudeCodeAdapter.isAvailable()` — as a hard gate before it writes anything,
 * and returns a real error if it fails. This status is the earlier, passive
 * half of that: it puts the answer where a user looks, next to tmux, before
 * they ever try to start a session.
 */
function initClaudeCli(): void {
  if (isCommandOnPath('claude')) {
    setStatus('claudeCli', 'ready', null)
  } else {
    setStatus('claudeCli', 'degraded', describeMissingTool('claude'))
  }
}

async function initTmux(services: AppServices): Promise<void> {
  services.tmux.on('output', (sessionId: string, data: string) => {
    broadcast(SESSION_OUTPUT, sessionId, data)
  })
  try {
    await services.tmux.connect()
    setStatus('tmux', 'ready', null)
    console.log('[service-lifecycle] tmux control mode connected')
  } catch (err) {
    setStatus('tmux', 'degraded', describeToolFailure('tmux', err))
    console.warn('[service-lifecycle] tmux connect failed (retry on first session create):', err)
  }
}

function initStatusMonitor(services: AppServices): void {
  services.statusMonitor.on('usage-updated', (sessionId: string, usage: unknown) => {
    broadcast(STATUSLINE_CTX_UPDATE, sessionId, usage)
  })
  try {
    services.statusMonitor.start()
  } catch (err) {
    // No tracked SubsystemId for the status-line monitor (not in SUBSYSTEM_IDS) — just
    // log and continue so a filesystem error here can't block the rest of runInit.
    console.warn('[service-lifecycle] StatusLine monitor start failed:', err)
  }
}

async function initVoice(services: AppServices, ctx: ServiceInitContext): Promise<void> {
  if (!ctx.voiceEnabled) {
    setStatus('voice', 'disabled', 'disabled in config')
    console.log('[service-lifecycle] Voice pipeline disabled by config')
    return
  }
  try {
    const vm = new VoiceManager({
      sendKeys: async (sessionId: string, data: string) => {
        await services.tmux.sendKeys(sessionId, data)
      },
    })
    vm.on('stateChanged', (state: string) => broadcast(VOICE_STATE, state))
    vm.on('transcription', (text: string) => broadcast(VOICE_TRANSCRIPTION, text))
    vm.on('dispatched', (data: unknown) => broadcast(VOICE_DISPATCHED, data))
    vm.on('error', (data: unknown) => broadcast(VOICE_ERROR, data))
    vm.on('pinChanged', (data: unknown) => broadcast(VOICE_PIN_STATUS, data))
    vm.on('activeSessionChanged', (id: string | null) =>
      broadcast(VOICE_ACTIVE_SESSION, { sessionId: id }))
    services.voiceManager = vm

    const result = await vm.init()
    if (result.stt) {
      setStatus('voice', 'ready', null)
    } else {
      setStatus('voice', 'degraded', 'STT model missing')
    }
    console.log('[service-lifecycle] Voice pipeline — STT:', result.stt, 'TTS:', result.tts)
  } catch (err) {
    services.voiceManager = null
    setStatus('voice', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] Voice pipeline init failed:', err)
  }
}

function initGraph(services: AppServices, ctx: ServiceInitContext): void {
  try {
    const graphDbPath = join(ctx.userDataPath, 'graph.db')
    const nativeBinding = resolveBetterSqliteBinding(
      join(ctx.appPath, 'node_modules', 'better-sqlite3'),
    )
    services.graphDb = openGraphDb({ path: graphDbPath, nativeBinding })
    services.graphWriter = new GraphWriter(services.graphDb)
    // schleifenZellen/praefixJeZelle/adapterRegistry come from `services` — registerIpcHandlers
    // (ipc-handlers.ts) publishes them there, and it always runs before initializeServices
    // (main.ts), so they are already set by the time this line runs. See the doc comment on
    // AppServices for the ordering argument, and the header comment on GraphMcpServer for why
    // none of this makes the keel_zellen tools reachable yet.
    //
    // harnessDb/lesen/sendeStatus are passed explicitly here, same as ipc-handlers.ts's
    // SESSION_AUFTRAG handler does for beauftrageZelle (see there) — not left to GraphMcpServer's
    // own defaults, so this call site names the real dependencies exactly as ipc-handlers.ts
    // does rather than relying on the class to supply them silently. sendeStatus is not
    // optional dressing: SESSION_STATUS_CHANGED is a broadcast() to every window, and the grid
    // window's cell (renderer/index.tsx) has no other way to learn its state changed
    // (schleifen-sitzungen.ts: "der Renderer leitet nichts ab") — an MCP-triggered order that
    // skipped this would leave that cell showing leerlaufend forever while the main process
    // tracks laeuft.
    services.graphMcpServer = new GraphMcpServer(
      services.graphDb, services.schleifenZellen, services.praefixJeZelle, services.adapterRegistry,
      harnessDb, lesen,
      (status: SessionStatusChanged) => broadcast(SESSION_STATUS_CHANGED, status),
    )
    services.kanbanStore = new KanbanStore(services.graphDb)
    setStatus('graph', 'ready', null)
    setStatus('kanban', 'ready', null)
    console.log('[service-lifecycle] Knowledge Graph initialized:', graphDbPath)
  } catch (err) {
    services.graphDb = null
    services.graphWriter = null
    services.graphMcpServer = null
    services.kanbanStore = null
    setStatus('graph', 'degraded', reasonOf(err))
    setStatus('kanban', 'degraded', 'graph unavailable: ' + reasonOf(err))
    console.warn('[service-lifecycle] Knowledge Graph init failed:', err)
  }
}

function initNotes(services: AppServices, ctx: ServiceInitContext): void {
  try {
    const notesDir = join(ctx.userDataPath, 'notes')
    services.noteManager = new NoteManager(notesDir)
    services.noteTagging = new NoteTagging(notesDir)
    services.tagClassRepo = new TagClassRepo(notesDir)
    services.tagIndex = new TagIndex(notesDir, services.tagClassRepo)
    services.noteTagging.setTagClassRepo(services.tagClassRepo)
    services.tagIndex.rebuild()
    services.noteTagging.recountTags()
    services.noteWatcher = new NoteWatcher(notesDir, () => {
      services.tagIndex?.rebuild()
      services.noteTagging?.recountTags()
      broadcast(NOTES_CHANGED)
    })
    services.noteWatcher.start()
    setStatus('notes', 'ready', null)
    console.log('[service-lifecycle] Notes system initialized')
  } catch (err) {
    setStatus('notes', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] Notes system init failed:', err)
  }
}
