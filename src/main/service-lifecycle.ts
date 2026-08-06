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
  NANOCLAW_MESSAGE_INBOUND,
  NANOCLAW_STATUS_CHANGED,
  NOTES_CHANGED,
  APP_READY,
  VOICE_STATE,
  VOICE_TRANSCRIPTION,
  VOICE_DISPATCHED,
  VOICE_ERROR,
  VOICE_PIN_STATUS,
  VOICE_ACTIVE_SESSION,
} from '../shared/ipc-channels'
import {
  SUBSYSTEM_IDS,
  type ServiceStatusMap,
  type SubsystemId,
  type ServiceState,
} from '../shared/service-status'
import { broadcast } from './event-bus'
import { openGraphDb } from './graph/db'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { GraphMcpServer } from './graph/mcp-server'
import { GraphWriter } from './graph/writer'
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

function setStatus(id: SubsystemId, state: ServiceState, reason: string | null): void {
  status[id] = { id, state, reason }
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
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes all background services. Idempotent: repeated (and concurrent) calls
 * share the first run and never re-initialize.
 */
export function initializeServices(
  services: AppServices,
  ctx: ServiceInitContext,
): Promise<ServiceStatusMap> {
  if (!initPromise) {
    initPromise = runInit(services, ctx)
  }
  return initPromise
}

async function runInit(
  services: AppServices,
  ctx: ServiceInitContext,
): Promise<ServiceStatusMap> {
  await initTmux(services)
  initStatusMonitor(services)
  await initNanoClaw(services)
  await initVoice(services, ctx)
  initGraph(services, ctx)
  initNotes(services, ctx)

  broadcast(APP_READY, { timestamp: Date.now() })
  return status
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
    setStatus('tmux', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] tmux connect failed (retry on first session create):', err)
  }
}

function initStatusMonitor(services: AppServices): void {
  services.statusMonitor.on('usage-updated', (sessionId: string, usage: unknown) => {
    broadcast(STATUSLINE_CTX_UPDATE, sessionId, usage)
  })
  services.statusMonitor.start()
}

async function initNanoClaw(services: AppServices): Promise<void> {
  services.nanoClawBridge.on('message-inbound', (threadId: string | null, text: string) => {
    broadcast(NANOCLAW_MESSAGE_INBOUND, { threadId, text })
  })
  services.nanoClawBridge.on('status-changed', (s: string) => {
    broadcast(NANOCLAW_STATUS_CHANGED, { status: s })
  })
  try {
    await services.nanoClawBridge.connect()
    setStatus('nanoclaw', 'ready', null)
    console.log('[service-lifecycle] NanoClaw bridge connected')
  } catch (err) {
    setStatus('nanoclaw', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] NanoClaw not reachable — Schenkel 2 unavailable')
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
    services.graphMcpServer = new GraphMcpServer(services.graphDb)
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
