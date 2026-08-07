/**
 * window-manager.ts — BrowserWindow lifecycle.
 *
 * Exports:
 *   AppServices  — mutable service container shared by main, ipc-handlers, service-lifecycle
 *   createMainWindow(services) — creates the grid BrowserWindow
 *   createProjectWindow(services) — creates the project BrowserWindow
 *
 * Security baseline (CK-NFR-004, CK-INF-022) is enforced in webPreferences.
 * Background service init no longer happens here — see service-lifecycle.ts, which
 * runs from app.whenReady() independent of any window.
 */

import { BrowserWindow } from 'electron'
import { join } from 'path'
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
// Shared service container — mutated by service-lifecycle.ts
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
 * Creates the main (grid/mux) BrowserWindow. Background services are no longer tied
 * to this window — they are initialized once from app.whenReady() via service-lifecycle.ts.
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

  const url = process.env.ELECTRON_RENDERER_URL
  if (url) {
    // electron-vite dev: try subdirectory path first, fallback to root-level
    win.loadURL(`${url}/windows/project-window.html`).catch(() => {
      console.warn('[window-manager] /windows/ path failed, trying root-level')
      win.loadURL(`${url}/project-window.html`).catch((err: Error) =>
        console.error('[window-manager] project-window load failed:', err.message)
      )
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/project-window.html'))
  }

  return win
}
