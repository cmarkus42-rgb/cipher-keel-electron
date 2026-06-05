/**
 * cipher-keel-electron — Electron Main Process entry point.
 *
 * Security baseline (CK-NFR-004, CK-INF-022) — NON-NEGOTIABLE:
 *   contextIsolation: true
 *   nodeIntegration: false
 *   sandbox: true
 *
 * Startup performance (CK-INF-025, CK-NFR-008):
 *   Heavy initializations (graph-db, NanoClaw, voice) start AFTER window is shown.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

import {
  APP_READY,
  SESSION_LIST,
  SESSION_CREATE,
  SESSION_DESTROY,
  SESSION_OUTPUT,
  TERMINAL_DATA_OUTBOUND,
  TERMINAL_RESIZE,
  CONFIG_GET,
  CONFIG_SET,
  STATUSLINE_CTX_UPDATE,
  NANOCLAW_MESSAGE_INBOUND,
  NANOCLAW_MESSAGE_OUTBOUND,
  NANOCLAW_STATUS_CHANGED,
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
  VOICE_STATE,
  VOICE_TRANSCRIPTION,
  VOICE_DISPATCHED,
  VOICE_ERROR,
  VOICE_PIN_STATUS,
  VOICE_ACTIVE_SESSION,
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
  NOTES_CHANGED,
} from '../shared/ipc-channels'
import { TmuxManager } from './tmux/tmux-manager'
import { StatusLineMonitor } from './monitoring/statusline-monitor'
import { NanoClawBridge, NanoClawChannelAdapter } from './nanoclaw'
import { configStore } from './config/config-store'
import type { CipherKeelConfig } from './config/config-store'
import { VoiceManager } from './voice/voice-manager'
import { NoteManager } from './notes/note-manager'
import { NoteTagging } from './notes/note-tagging'
import { TagClassRepo } from './notes/tag-repository'
import { TagIndex } from './notes/tag-index'
import { NoteWatcher } from './notes/note-watcher'
import { patchEnvPath } from './util/exec-util'
import { openGraphDb } from './graph/db'
import { GraphMcpServer } from './graph/mcp-server'
import { graphSearch, graphGetNode, graphExpand } from './graph/search'
import { graphQuery } from './graph/query'
import { graphMaintain } from './graph/maintain'
import { GraphWriter } from './graph/writer'
import type Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Patch PATH early — macOS GUI apps have minimal PATH
// ---------------------------------------------------------------------------
patchEnvPath()

// ---------------------------------------------------------------------------
// Singleton tmux manager
// ---------------------------------------------------------------------------
const tmux = new TmuxManager()
const statusMonitor = new StatusLineMonitor()
// Voice pipeline — initialized lazily in background services (CK-VOICE-001..010)
let voiceManager: VoiceManager | null = null
// CK-S2-015: NanoClaw daemon runs independently — cipher-keel does NOT start/stop it.
// The bridge only connects as a client to an already-running NanoClaw socket.
const nanoClawBridge = new NanoClawBridge()
const _nanoClawAdapter = new NanoClawChannelAdapter(nanoClawBridge)

// Knowledge Graph (CK-GRAPH-037) — initialized lazily in background services
let graphDb: Database.Database | null = null
let graphMcpServer: GraphMcpServer | null = null
let graphWriter: GraphWriter | null = null

// Notes system (CK-NOTES-001..003) — initialized lazily in background services
let noteManager: NoteManager | null = null
let noteTagging: NoteTagging | null = null
let tagClassRepo: TagClassRepo | null = null
let tagIndex: TagIndex | null = null
let noteWatcher: NoteWatcher | null = null

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false, // shown via 'ready-to-show' to avoid white flash
    backgroundColor: '#0d0d0d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // Security baseline — NON-NEGOTIABLE (CK-NFR-004, CK-INF-022)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      // Additional hardening
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  // Show window only when renderer is fully painted (avoids white flash)
  win.once('ready-to-show', () => {
    win.show()
    // Defer heavy initialization until after window is visible
    setImmediate(() => initializeBackgroundServices(win))
  })

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    // Dev mode: electron-vite serves the renderer via Vite dev server
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Production: load bundled renderer
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ---------------------------------------------------------------------------
// Background service initialization (deferred post-window-show)
// ---------------------------------------------------------------------------

async function initializeBackgroundServices(win: BrowserWindow): Promise<void> {
  // Connect tmux control mode (CK-INF-002)
  try {
    await tmux.connect()
    console.log('[main] tmux control mode connected')
  } catch (err) {
    console.warn('[main] tmux connect failed (will retry on first session create):', err)
  }

  // Forward tmux output to renderer
  tmux.on('output', (sessionId: string, data: string) => {
    win.webContents.send(SESSION_OUTPUT, sessionId, data)
  })

  // Start StatusLine monitor (CK-INF-007) — watches for CTX% JSON files
  statusMonitor.start()
  statusMonitor.on('usage-updated', (sessionId: string, usage: unknown) => {
    win.webContents.send(STATUSLINE_CTX_UPDATE, sessionId, usage)
  })

  // NanoClaw bridge — connect as client to the cipher-keel channel socket.
  // CK-S2-015: Does NOT start NanoClaw — only connects to existing daemon.
  nanoClawBridge.on('message-inbound', (threadId: string | null, text: string) => {
    win.webContents.send(NANOCLAW_MESSAGE_INBOUND, { threadId, text })
  })
  nanoClawBridge.on('status-changed', (status: string) => {
    win.webContents.send(NANOCLAW_STATUS_CHANGED, { status })
  })

  try {
    await nanoClawBridge.connect()
    console.log('[main] NanoClaw bridge connected')
  } catch {
    console.warn('[main] NanoClaw not reachable — Schenkel 2 unavailable (will retry on manual connect)')
  }

  // Voice pipeline — init with graceful degradation (CK-VOICE-009, CK-VOICE-010)
  const voiceEnabled = configStore.get('voice').enabled !== false
  if (voiceEnabled) {
    try {
      voiceManager = new VoiceManager({
        sendKeys: async (sessionId, data) => {
          await tmux.sendKeys(sessionId, data)
        },
      })

      // Forward voice events to renderer
      voiceManager.on('stateChanged', (state: string) => {
        win.webContents.send(VOICE_STATE, state)
      })
      voiceManager.on('transcription', (text: string) => {
        win.webContents.send(VOICE_TRANSCRIPTION, text)
      })
      voiceManager.on('dispatched', (data: unknown) => {
        win.webContents.send(VOICE_DISPATCHED, data)
      })
      voiceManager.on('error', (data: unknown) => {
        win.webContents.send(VOICE_ERROR, data)
      })
      voiceManager.on('pinChanged', (data: unknown) => {
        win.webContents.send(VOICE_PIN_STATUS, data)
      })
      voiceManager.on('activeSessionChanged', (id: string | null) => {
        win.webContents.send(VOICE_ACTIVE_SESSION, { sessionId: id })
      })

      const result = await voiceManager.init()
      console.log('[main] Voice pipeline initialized — STT:', result.stt, 'TTS:', result.tts)
    } catch (err) {
      console.warn('[main] Voice pipeline init failed (graceful degradation):', err)
      voiceManager = null
    }
  } else {
    console.log('[main] Voice pipeline disabled by config')
  }

  // Knowledge Graph — init with graceful degradation (CK-GRAPH-037, CK-NFR-010)
  try {
    const graphDbPath = join(app.getPath('userData'), 'graph.db')
    graphDb = openGraphDb({ path: graphDbPath })
    graphWriter = new GraphWriter(graphDb)
    graphMcpServer = new GraphMcpServer(graphDb)
    console.log('[main] Knowledge Graph initialized:', graphDbPath)
  } catch (err) {
    console.warn('[main] Knowledge Graph init failed (graceful degradation):', err)
    graphDb = null
    graphWriter = null
    graphMcpServer = null
  }

  // Notes system — init with graceful degradation (CK-NOTES-001..003)
  try {
    const notesDir = join(app.getPath('userData'), 'notes')
    noteManager = new NoteManager(notesDir)
    noteTagging = new NoteTagging(notesDir)
    tagClassRepo = new TagClassRepo(notesDir)
    tagIndex = new TagIndex(notesDir, tagClassRepo)
    noteTagging.setTagClassRepo(tagClassRepo)
    tagIndex.rebuild()
    noteTagging.recountTags()

    // File watcher for external changes
    noteWatcher = new NoteWatcher(notesDir, (_noteId) => {
      tagIndex?.rebuild()
      noteTagging?.recountTags()
      win.webContents.send(NOTES_CHANGED)
    })
    noteWatcher.start()
    console.log('[main] Notes system initialized')
  } catch (err) {
    console.warn('[main] Notes system init failed (graceful degradation):', err)
  }

  // Notify renderer that the app is ready
  win.webContents.send(APP_READY, { timestamp: Date.now() })
}

// ---------------------------------------------------------------------------
// IPC handler stubs (filled in by BT-3b and later milestones)
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // Session handlers (tmux backend — CK-INF-002)
  ipcMain.handle(SESSION_LIST, async () => {
    return tmux.listSessions()
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
      // Ensure tmux is connected before creating sessions
      if (!tmux.isConnected()) {
        await tmux.connect()
      }
      const sessionId = await tmux.createSession(opts.name, opts)
      // Start watching for output
      tmux.watchSession(opts.name, opts.name)
      return { id: sessionId, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { id: null, error: msg }
    }
  })

  ipcMain.handle(SESSION_DESTROY, async (_event, name: string) => {
    try {
      tmux.unwatchSession(name)
      await tmux.killSession(name)
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  // Terminal input from renderer → tmux pane (CK-INF-002)
  ipcMain.on(TERMINAL_DATA_OUTBOUND, (_event, sessionName: string, data: string) => {
    tmux.sendKeys(sessionName, data).catch((err) => {
      console.error('[main] sendKeys failed:', err)
    })
  })

  // Terminal resize from renderer → tmux pane
  ipcMain.on(TERMINAL_RESIZE, (_event, sessionName: string, cols: number, rows: number) => {
    tmux.resizePane(sessionName, cols, rows).catch((err) => {
      console.error('[main] resizePane failed:', err)
    })
  })

  // NanoClaw handlers (CK-S2-012)
  ipcMain.on(NANOCLAW_MESSAGE_OUTBOUND, (_event, payload: { threadId: string | null; text: string }) => {
    nanoClawBridge.sendMessage(payload.text, payload.threadId)
  })

  ipcMain.handle(NANOCLAW_CONNECT, async () => {
    try {
      await nanoClawBridge.reconnect()
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(NANOCLAW_DISCONNECT, async () => {
    nanoClawBridge.disconnect()
    return { ok: true, error: null }
  })

  // Knowledge Graph handlers (CK-GRAPH-037)
  ipcMain.handle(GRAPH_SEARCH, async (_event, params: { query: string; limit?: number; kind?: string }) => {
    if (!graphDb) return { hits: [], error: 'Graph not initialized' }
    try {
      return graphSearch(graphDb, params)
    } catch (err) {
      return { hits: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_READ, async (_event, uid: string) => {
    if (!graphDb) return null
    try {
      return graphGetNode(graphDb, uid)
    } catch {
      return null
    }
  })

  ipcMain.handle(GRAPH_EXPAND, async (_event, params: { uid: string; depth?: number; edge_type?: string; direction?: string }) => {
    if (!graphDb) return { center: null, neighbors: [], edges: [] }
    try {
      return graphExpand(graphDb, params)
    } catch (err) {
      return { center: null, neighbors: [], edges: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_QUERY, async (_event, params: { template: string; params?: Record<string, unknown> }) => {
    if (!graphDb) return { rows: [], error: 'Graph not initialized' }
    try {
      return graphQuery(graphDb, params)
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_WRITE, async (_event, input: { kind: string; title: string; [key: string]: unknown }) => {
    if (!graphWriter) return { uid: null, error: 'Graph not initialized' }
    try {
      return graphWriter.upsertNode(input as Parameters<GraphWriter['upsertNode']>[0])
    } catch (err) {
      return { uid: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_LINK, async (_event, input: { src: string; dst: string; type?: string; source?: string; props?: Record<string, unknown> }) => {
    if (!graphWriter) return { ok: false, error: 'Graph not initialized' }
    try {
      return graphWriter.linkEdge(input as Parameters<GraphWriter['linkEdge']>[0])
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_MAINTAIN, async (_event, params: { operation: string }) => {
    if (!graphDb) return { error: 'Graph not initialized' }
    try {
      return graphMaintain(graphDb, params as Parameters<typeof graphMaintain>[1])
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_DELETE, async (_event, uid: string) => {
    if (!graphDb) return { ok: false, error: 'Graph not initialized' }
    try {
      graphDb.prepare('DELETE FROM node WHERE uid = ?').run(uid)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Config handlers (ConfigStore — CK-INF-008)
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

  // Voice handlers (CK-VOICE-001..010)
  ipcMain.handle(VOICE_AVAILABLE, async () => {
    if (!voiceManager) {
      const voiceEnabled = configStore.get('voice').enabled !== false
      return { available: false, reason: voiceEnabled ? 'Voice pipeline not initialized' : 'Voice disabled in config' }
    }
    return { available: voiceManager.isAvailable(), reason: voiceManager.isAvailable() ? null : 'STT model missing' }
  })

  ipcMain.handle(VOICE_START_SESSION, async () => {
    if (!voiceManager) return { ok: false, error: 'Voice not available' }
    return voiceManager.startSession()
  })

  ipcMain.handle(VOICE_STOP_SESSION, async () => {
    voiceManager?.stopSession()
    return { ok: true }
  })

  ipcMain.on(VOICE_SET_SESSION_TARGET, (_event, sessionId: string | null) => {
    voiceManager?.setFocusedSession(sessionId)
  })

  ipcMain.on(VOICE_SET_ROUTING_MODE, (_event, mode: string) => {
    // mode is 'session' or 'off' — handled via start/stop session
  })

  ipcMain.on(VOICE_VAD_SPEECH_START, () => {
    voiceManager?.onVadSpeechStart()
  })

  ipcMain.on(VOICE_VAD_SPEECH_END, (_event, audio: number[]) => {
    voiceManager?.onVadSpeechEnd(audio)
  })

  ipcMain.on(VOICE_VAD_MISFIRE, () => {
    // VAD misfire — no action needed in main process
  })

  ipcMain.on(VOICE_BARGE_IN, () => {
    voiceManager?.stopTTS()
  })

  ipcMain.on(VOICE_PIN_SESSION, (_event, sessionId: string) => {
    voiceManager?.togglePin(sessionId)
  })

  // Notes handlers (CK-NOTES-001..003)
  ipcMain.handle(NOTES_LIST, async (_event, filterTags?: string[]) => {
    if (!noteManager) return []
    return noteManager.list(filterTags)
  })

  ipcMain.handle(NOTES_CREATE, async (_event, title: string, body: string, tags?: string[]) => {
    if (!noteManager) return { id: null, error: 'Notes not initialized' }
    const info = await noteManager.create(title, body, tags)
    if (tags?.length) {
      noteTagging?.updateRepository(tags)
      tagIndex?.rebuild()
    }
    return info
  })

  ipcMain.handle(NOTES_READ, async (_event, id: string) => {
    if (!noteManager) return null
    return noteManager.read(id)
  })

  ipcMain.handle(NOTES_SAVE, async (_event, id: string, body: string, tags?: string[]) => {
    if (!noteManager) return { id: null, error: 'Notes not initialized' }
    const info = await noteManager.save(id, body, tags)
    if (tags?.length) {
      noteTagging?.updateRepository(tags)
      tagIndex?.updateNote(id, tags)
    }
    return info
  })

  ipcMain.handle(NOTES_DELETE, async (_event, id: string) => {
    if (!noteManager) return { ok: false }
    const ok = await noteManager.delete(id)
    if (ok) tagIndex?.removeNote(id)
    return { ok }
  })

  ipcMain.handle(NOTES_TRASH, async (_event, id: string) => {
    if (!noteManager) return { ok: false }
    const ok = await noteManager.trash(id)
    if (ok) tagIndex?.removeNote(id)
    return { ok }
  })

  ipcMain.handle(NOTES_TRASH_MANY, async (_event, ids: string[]) => {
    if (!noteManager) return { trashed: [] }
    const trashed = await noteManager.trashMany(ids)
    for (const id of trashed) tagIndex?.removeNote(id)
    return { trashed }
  })

  ipcMain.handle(NOTES_RESTORE_MANY, async (_event, ids: string[]) => {
    if (!noteManager) return { restored: [] }
    const restored = await noteManager.restoreMany(ids)
    tagIndex?.rebuild()
    return { restored }
  })

  ipcMain.handle(NOTES_SEARCH, async (_event, query: string, tags?: string[]) => {
    if (!noteManager) return []
    return noteManager.search(query, { tags })
  })

  ipcMain.handle(NOTES_TAGS, async () => {
    if (!noteTagging) return { tags: {} }
    return noteTagging.getTagRepository()
  })

  ipcMain.handle(NOTES_AUTO_TAG, async (_event, content: string) => {
    if (!noteTagging) return null
    return noteTagging.autoTag(content)
  })

  ipcMain.handle(NOTES_TAG_INDEX, async () => {
    if (!tagIndex) return { tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' }
    return tagIndex.getIndex()
  })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// Quit on all windows closed (Windows/Linux behavior; macOS handles via 'activate')
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Graceful shutdown — close graph DB to flush WAL (CK-GRAPH-028)
app.on('before-quit', () => {
  try {
    graphDb?.close()
    graphDb = null
    graphWriter = null
    graphMcpServer = null
  } catch (err) {
    console.warn('[main] Graph DB close error:', err)
  }
})
