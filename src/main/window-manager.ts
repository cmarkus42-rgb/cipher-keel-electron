/**
 * window-manager.ts — BrowserWindow lifecycle and deferred background service init.
 *
 * Exports:
 *   AppServices  — mutable service container shared by main, ipc-handlers
 *   createMainWindow(services) — creates BrowserWindow + defers background init
 *
 * Security baseline (CK-NFR-004, CK-INF-022) is enforced in webPreferences.
 * Heavy init runs AFTER window is shown (CK-INF-025).
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
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
import { configStore } from './config/config-store'
import { openGraphDb } from './graph/db'
import { GraphMcpServer } from './graph/mcp-server'
import { GraphWriter } from './graph/writer'
import { VoiceManager } from './voice/voice-manager'
import { NoteManager } from './notes/note-manager'
import { NoteTagging } from './notes/note-tagging'
import { TagClassRepo } from './notes/tag-repository'
import { TagIndex } from './notes/tag-index'
import { NoteWatcher } from './notes/note-watcher'
import { KanbanStore } from './kanban/kanban-store'
import type { TmuxManager } from './tmux/tmux-manager'
import type { StatusLineMonitor } from './monitoring/statusline-monitor'
import type { NanoClawBridge } from './nanoclaw'
import type Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Shared service container — mutated by initializeBackgroundServices
// ---------------------------------------------------------------------------

export interface AppServices {
  tmux: TmuxManager
  statusMonitor: StatusLineMonitor
  nanoClawBridge: NanoClawBridge
  voiceManager: VoiceManager | null
  graphDb: Database.Database | null
  graphWriter: GraphWriter | null
  graphMcpServer: GraphMcpServer | null
  noteManager: NoteManager | null
  noteTagging: NoteTagging | null
  tagClassRepo: TagClassRepo | null
  tagIndex: TagIndex | null
  noteWatcher: NoteWatcher | null
  kanbanStore: KanbanStore | null
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

/**
 * Creates the main BrowserWindow.
 * Background services are initialized after the window becomes visible.
 */
export function createMainWindow(services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d0d0d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // Security baseline — NON-NEGOTIABLE (CK-NFR-004, CK-INF-022)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    setImmediate(() => void initializeBackgroundServices(win, services))
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * Creates the Project Window — primary entry point (CK-UI-001, CK-UI-002).
 * Opens on app start. Grid/Mux window opens on demand via window:open-grid IPC.
 * No background service init — project IPC handlers need no heavy setup.
 */
export function createProjectWindow(_services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      // Security baseline — NON-NEGOTIABLE (CK-NFR-004, CK-INF-022)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/windows/project-window.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/project-window.html'))
  }

  return win
}

// ---------------------------------------------------------------------------
// Background service initialization (deferred post-window-show)
// ---------------------------------------------------------------------------

async function initializeBackgroundServices(
  win: BrowserWindow,
  services: AppServices,
): Promise<void> {
  // tmux control mode
  try {
    await services.tmux.connect()
    console.log('[window-manager] tmux control mode connected')
  } catch (err) {
    console.warn('[window-manager] tmux connect failed (will retry on first session create):', err)
  }

  services.tmux.on('output', (sessionId: string, data: string) => {
    win.webContents.send(SESSION_OUTPUT, sessionId, data)
  })

  // StatusLine monitor (CK-INF-007)
  services.statusMonitor.start()
  services.statusMonitor.on('usage-updated', (sessionId: string, usage: unknown) => {
    win.webContents.send(STATUSLINE_CTX_UPDATE, sessionId, usage)
  })

  // NanoClaw bridge (CK-S2-015: connect as client only)
  services.nanoClawBridge.on('message-inbound', (threadId: string | null, text: string) => {
    win.webContents.send(NANOCLAW_MESSAGE_INBOUND, { threadId, text })
  })
  services.nanoClawBridge.on('status-changed', (status: string) => {
    win.webContents.send(NANOCLAW_STATUS_CHANGED, { status })
  })

  try {
    await services.nanoClawBridge.connect()
    console.log('[window-manager] NanoClaw bridge connected')
  } catch {
    console.warn('[window-manager] NanoClaw not reachable — Schenkel 2 unavailable (will retry on manual connect)')
  }

  // Voice pipeline (CK-VOICE-009, CK-VOICE-010)
  const voiceEnabled = configStore.get('voice').enabled !== false
  if (voiceEnabled) {
    try {
      services.voiceManager = new VoiceManager({
        sendKeys: async (sessionId, data) => {
          await services.tmux.sendKeys(sessionId, data)
        },
      })
      services.voiceManager.on('stateChanged', (state: string) => {
        win.webContents.send(VOICE_STATE, state)
      })
      services.voiceManager.on('transcription', (text: string) => {
        win.webContents.send(VOICE_TRANSCRIPTION, text)
      })
      services.voiceManager.on('dispatched', (data: unknown) => {
        win.webContents.send(VOICE_DISPATCHED, data)
      })
      services.voiceManager.on('error', (data: unknown) => {
        win.webContents.send(VOICE_ERROR, data)
      })
      services.voiceManager.on('pinChanged', (data: unknown) => {
        win.webContents.send(VOICE_PIN_STATUS, data)
      })
      services.voiceManager.on('activeSessionChanged', (id: string | null) => {
        win.webContents.send(VOICE_ACTIVE_SESSION, { sessionId: id })
      })
      const result = await services.voiceManager.init()
      console.log('[window-manager] Voice pipeline initialized — STT:', result.stt, 'TTS:', result.tts)
    } catch (err) {
      console.warn('[window-manager] Voice pipeline init failed (graceful degradation):', err)
      services.voiceManager = null
    }
  } else {
    console.log('[window-manager] Voice pipeline disabled by config')
  }

  // Knowledge Graph (CK-GRAPH-037)
  try {
    const graphDbPath = join(app.getPath('userData'), 'graph.db')
    services.graphDb = openGraphDb({ path: graphDbPath })
    services.graphWriter = new GraphWriter(services.graphDb)
    services.graphMcpServer = new GraphMcpServer(services.graphDb)
    services.kanbanStore = new KanbanStore(services.graphDb)
    console.log('[window-manager] Knowledge Graph initialized:', graphDbPath)
  } catch (err) {
    console.warn('[window-manager] Knowledge Graph init failed (graceful degradation):', err)
    services.graphDb = null
    services.graphWriter = null
    services.graphMcpServer = null
    services.kanbanStore = null
  }

  // Notes system (CK-NOTES-001..003)
  try {
    const notesDir = join(app.getPath('userData'), 'notes')
    services.noteManager = new NoteManager(notesDir)
    services.noteTagging = new NoteTagging(notesDir)
    services.tagClassRepo = new TagClassRepo(notesDir)
    services.tagIndex = new TagIndex(notesDir, services.tagClassRepo)
    services.noteTagging.setTagClassRepo(services.tagClassRepo)
    services.tagIndex.rebuild()
    services.noteTagging.recountTags()
    services.noteWatcher = new NoteWatcher(notesDir, (_noteId) => {
      services.tagIndex?.rebuild()
      services.noteTagging?.recountTags()
      win.webContents.send(NOTES_CHANGED)
    })
    services.noteWatcher.start()
    console.log('[window-manager] Notes system initialized')
  } catch (err) {
    console.warn('[window-manager] Notes system init failed (graceful degradation):', err)
  }

  win.webContents.send(APP_READY, { timestamp: Date.now() })
}
