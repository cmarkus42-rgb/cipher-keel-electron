/**
 * ipc-handlers.ts — all IPC handler registrations for the main process.
 *
 * registerIpcHandlers(services) must be called once in app.whenReady().
 *
 * CK-INF-009
 */

import { ipcMain } from 'electron'
import {
  SESSION_LIST,
  SESSION_CREATE,
  SESSION_DESTROY,
  TERMINAL_DATA_OUTBOUND,
  TERMINAL_RESIZE,
  NANOCLAW_MESSAGE_OUTBOUND,
  NANOCLAW_CONNECT,
  NANOCLAW_DISCONNECT,
  GRAPH_SEARCH,
  GRAPH_READ,
  GRAPH_WRITE,
  GRAPH_QUERY,
  GRAPH_LINK,
  GRAPH_DELETE,
  GRAPH_EXPAND,
  GRAPH_MAINTAIN,
  CONFIG_GET,
  CONFIG_SET,
  VOICE_AVAILABLE,
  VOICE_START_SESSION,
  VOICE_STOP_SESSION,
  VOICE_SET_SESSION_TARGET,
  VOICE_SET_ROUTING_MODE,
  VOICE_VAD_SPEECH_START,
  VOICE_VAD_SPEECH_END,
  VOICE_VAD_MISFIRE,
  VOICE_BARGE_IN,
  VOICE_PIN_SESSION,
  NOTES_LIST,
  NOTES_CREATE,
  NOTES_READ,
  NOTES_SAVE,
  NOTES_DELETE,
  NOTES_TRASH,
  NOTES_TRASH_MANY,
  NOTES_RESTORE_MANY,
  NOTES_SEARCH,
  NOTES_TAGS,
  NOTES_AUTO_TAG,
  NOTES_TAG_INDEX,
  PROJECT_LIST,
  PROJECT_CREATE,
  PROJECT_SWITCH,
  PROJECT_GET_CURRENT,
} from '../shared/ipc-channels'
import { configStore } from './config/config-store'
import type { CipherKeelConfig } from './config/config-store'
import { graphSearch, graphGetNode, graphExpand } from './graph/search'
import { graphQuery } from './graph/query'
import { graphMaintain } from './graph/maintain'
import type { GraphWriter } from './graph/writer'
import { ProjectManager } from './project/project-manager'
import type { AppServices } from './window-manager'

export function registerIpcHandlers(services: AppServices): void {
  // Project manager — wired to configStore for persistence (CK-INF-020)
  const projectManager = new ProjectManager(
    (data) => configStore.set('projects', data),
    () => configStore.get('projects'),
  )

  // ---------------------------------------------------------------------------
  // Session handlers (tmux backend — CK-INF-002)
  // ---------------------------------------------------------------------------

  ipcMain.handle(SESSION_LIST, async () => {
    return services.tmux.listSessions()
  })

  ipcMain.handle(SESSION_CREATE, async (_event, opts: {
    name: string
    cwd?: string
    command?: string
    env?: Record<string, string>
    width?: number
    height?: number
  }) => {
    try {
      if (!services.tmux.isConnected()) {
        await services.tmux.connect()
      }
      const sessionId = await services.tmux.createSession(opts.name, opts)
      services.tmux.watchSession(opts.name, opts.name)
      return { id: sessionId, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { id: null, error: msg }
    }
  })

  ipcMain.handle(SESSION_DESTROY, async (_event, name: string) => {
    try {
      services.tmux.unwatchSession(name)
      await services.tmux.killSession(name)
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.on(TERMINAL_DATA_OUTBOUND, (_event, sessionName: string, data: string) => {
    services.tmux.sendKeys(sessionName, data).catch((err) => {
      console.error('[ipc-handlers] sendKeys failed:', err)
    })
  })

  ipcMain.on(TERMINAL_RESIZE, (_event, sessionName: string, cols: number, rows: number) => {
    services.tmux.resizePane(sessionName, cols, rows).catch((err) => {
      console.error('[ipc-handlers] resizePane failed:', err)
    })
  })

  // ---------------------------------------------------------------------------
  // NanoClaw handlers (CK-S2-012)
  // ---------------------------------------------------------------------------

  ipcMain.on(NANOCLAW_MESSAGE_OUTBOUND, (_event, payload: { threadId: string | null; text: string }) => {
    services.nanoClawBridge.sendMessage(payload.text, payload.threadId)
  })

  ipcMain.handle(NANOCLAW_CONNECT, async () => {
    try {
      await services.nanoClawBridge.reconnect()
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(NANOCLAW_DISCONNECT, async () => {
    services.nanoClawBridge.disconnect()
    return { ok: true, error: null }
  })

  // ---------------------------------------------------------------------------
  // Knowledge Graph handlers (CK-GRAPH-037)
  // ---------------------------------------------------------------------------

  ipcMain.handle(GRAPH_SEARCH, async (_event, params: { query: string; limit?: number; kind?: string }) => {
    if (!services.graphDb) return { hits: [], error: 'Graph not initialized' }
    try {
      return graphSearch(services.graphDb, params)
    } catch (err) {
      return { hits: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_READ, async (_event, uid: string) => {
    if (!services.graphDb) return null
    try {
      return graphGetNode(services.graphDb, uid)
    } catch {
      return null
    }
  })

  ipcMain.handle(GRAPH_EXPAND, async (_event, params: { uid: string; depth?: number; edge_type?: string; direction?: string }) => {
    if (!services.graphDb) return { center: null, neighbors: [], edges: [] }
    try {
      return graphExpand(services.graphDb, params)
    } catch (err) {
      return { center: null, neighbors: [], edges: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_QUERY, async (_event, params: { template: string; params?: Record<string, unknown> }) => {
    if (!services.graphDb) return { rows: [], error: 'Graph not initialized' }
    try {
      return graphQuery(services.graphDb, params)
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_WRITE, async (_event, input: { kind: string; title: string; [key: string]: unknown }) => {
    if (!services.graphWriter) return { uid: null, error: 'Graph not initialized' }
    try {
      return services.graphWriter.upsertNode(input as Parameters<GraphWriter['upsertNode']>[0])
    } catch (err) {
      return { uid: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_LINK, async (_event, input: { src: string; dst: string; type?: string; source?: string; props?: Record<string, unknown> }) => {
    if (!services.graphWriter) return { ok: false, error: 'Graph not initialized' }
    try {
      return services.graphWriter.linkEdge(input as Parameters<GraphWriter['linkEdge']>[0])
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_MAINTAIN, async (_event, params: { operation: string }) => {
    if (!services.graphDb) return { error: 'Graph not initialized' }
    try {
      return graphMaintain(services.graphDb, params as Parameters<typeof graphMaintain>[1])
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_DELETE, async (_event, uid: string) => {
    if (!services.graphWriter) return { ok: false, error: 'Graph not initialized' }
    try {
      return services.graphWriter.deleteNode(uid)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---------------------------------------------------------------------------
  // Config handlers (CK-INF-008)
  // ---------------------------------------------------------------------------

  ipcMain.handle(CONFIG_GET, async (_event, key: string) => {
    try {
      return configStore.get(key as keyof CipherKeelConfig)
    } catch {
      return null
    }
  })

  ipcMain.handle(CONFIG_SET, async (_event, key: string, value: unknown) => {
    try {
      configStore.set(key as keyof CipherKeelConfig, value as CipherKeelConfig[keyof CipherKeelConfig])
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  // ---------------------------------------------------------------------------
  // Voice handlers (CK-VOICE-001..010)
  // ---------------------------------------------------------------------------

  ipcMain.handle(VOICE_AVAILABLE, async () => {
    if (!services.voiceManager) {
      const voiceEnabled = configStore.get('voice').enabled !== false
      return { available: false, reason: voiceEnabled ? 'Voice pipeline not initialized' : 'Voice disabled in config' }
    }
    return { available: services.voiceManager.isAvailable(), reason: services.voiceManager.isAvailable() ? null : 'STT model missing' }
  })

  ipcMain.handle(VOICE_START_SESSION, async () => {
    if (!services.voiceManager) return { ok: false, error: 'Voice not available' }
    return services.voiceManager.startSession()
  })

  ipcMain.handle(VOICE_STOP_SESSION, async () => {
    services.voiceManager?.stopSession()
    return { ok: true }
  })

  ipcMain.on(VOICE_SET_SESSION_TARGET, (_event, sessionId: string | null) => {
    services.voiceManager?.setFocusedSession(sessionId)
  })

  ipcMain.on(VOICE_SET_ROUTING_MODE, (_event, _mode: string) => {
    // mode is 'session' or 'off' — handled via start/stop session
  })

  ipcMain.on(VOICE_VAD_SPEECH_START, () => {
    services.voiceManager?.onVadSpeechStart()
  })

  ipcMain.on(VOICE_VAD_SPEECH_END, (_event, audio: number[]) => {
    services.voiceManager?.onVadSpeechEnd(audio)
  })

  ipcMain.on(VOICE_VAD_MISFIRE, () => {
    // VAD misfire — no action needed in main process
  })

  ipcMain.on(VOICE_BARGE_IN, () => {
    services.voiceManager?.stopTTS()
  })

  ipcMain.on(VOICE_PIN_SESSION, (_event, sessionId: string) => {
    services.voiceManager?.togglePin(sessionId)
  })

  // ---------------------------------------------------------------------------
  // Notes handlers (CK-NOTES-001..003)
  // ---------------------------------------------------------------------------

  ipcMain.handle(NOTES_LIST, async (_event, filterTags?: string[]) => {
    if (!services.noteManager) return []
    return services.noteManager.list(filterTags)
  })

  ipcMain.handle(NOTES_CREATE, async (_event, title: string, body: string, tags?: string[]) => {
    if (!services.noteManager) return { id: null, error: 'Notes not initialized' }
    const info = await services.noteManager.create(title, body, tags)
    if (tags?.length) {
      services.noteTagging?.updateRepository(tags)
      services.tagIndex?.rebuild()
    }
    return info
  })

  ipcMain.handle(NOTES_READ, async (_event, id: string) => {
    if (!services.noteManager) return null
    return services.noteManager.read(id)
  })

  ipcMain.handle(NOTES_SAVE, async (_event, id: string, body: string, tags?: string[]) => {
    if (!services.noteManager) return { id: null, error: 'Notes not initialized' }
    const info = await services.noteManager.save(id, body, tags)
    if (tags?.length) {
      services.noteTagging?.updateRepository(tags)
      services.tagIndex?.updateNote(id, tags)
    }
    return info
  })

  ipcMain.handle(NOTES_DELETE, async (_event, id: string) => {
    if (!services.noteManager) return { ok: false }
    const ok = await services.noteManager.delete(id)
    if (ok) services.tagIndex?.removeNote(id)
    return { ok }
  })

  ipcMain.handle(NOTES_TRASH, async (_event, id: string) => {
    if (!services.noteManager) return { ok: false }
    const ok = await services.noteManager.trash(id)
    if (ok) services.tagIndex?.removeNote(id)
    return { ok }
  })

  ipcMain.handle(NOTES_TRASH_MANY, async (_event, ids: string[]) => {
    if (!services.noteManager) return { trashed: [] }
    const trashed = await services.noteManager.trashMany(ids)
    for (const id of trashed) services.tagIndex?.removeNote(id)
    return { trashed }
  })

  ipcMain.handle(NOTES_RESTORE_MANY, async (_event, ids: string[]) => {
    if (!services.noteManager) return { restored: [] }
    const restored = await services.noteManager.restoreMany(ids)
    services.tagIndex?.rebuild()
    return { restored }
  })

  ipcMain.handle(NOTES_SEARCH, async (_event, query: string, tags?: string[]) => {
    if (!services.noteManager) return []
    return services.noteManager.search(query, { tags })
  })

  ipcMain.handle(NOTES_TAGS, async () => {
    if (!services.noteTagging) return { tags: {} }
    return services.noteTagging.getTagRepository()
  })

  ipcMain.handle(NOTES_AUTO_TAG, async (_event, content: string) => {
    if (!services.noteTagging) return null
    return services.noteTagging.autoTag(content)
  })

  ipcMain.handle(NOTES_TAG_INDEX, async () => {
    if (!services.tagIndex) return { tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' }
    return services.tagIndex.getIndex()
  })

  // ---------------------------------------------------------------------------
  // Project handlers (CK-INF-020)
  // ---------------------------------------------------------------------------

  ipcMain.handle(PROJECT_LIST, async () => {
    return projectManager.listProjects()
  })

  ipcMain.handle(PROJECT_CREATE, async (_event, name: string, rootPath: string) => {
    try {
      return { project: projectManager.createProject(name, rootPath), error: null }
    } catch (err) {
      return { project: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(PROJECT_SWITCH, async (_event, projectId: string) => {
    try {
      projectManager.switchProject(projectId)
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(PROJECT_GET_CURRENT, async () => {
    return projectManager.getCurrentProject()
  })
}
