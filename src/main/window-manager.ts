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
import type { McpHttpServerHandle } from './graph/mcp-http-server'
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
import type Database from 'better-sqlite3'
import type { Zellenregister } from './session/schleifen-sitzungen'
import type { EntitaetsTeile } from './agent/agent-adapter'
import type { AdapterRegistry } from './agent/registry'

// ---------------------------------------------------------------------------
// Shared service container — mutated by service-lifecycle.ts
// ---------------------------------------------------------------------------

export interface AppServices {
  tmux: TmuxManager
  statusMonitor: StatusLineMonitor
  voiceManager: VoiceManager | null
  graphDb: Database.Database | null
  graphWriter: GraphWriter | null
  graphMcpServer: GraphMcpServer | null
  /**
   * The MCP transport (Paket B) that makes `graphMcpServer` reachable at all — set once by
   * `initMcp` (service-lifecycle.ts), right after `initGraph` builds `graphMcpServer` itself.
   * `SESSION_CREATE` (ipc-handlers.ts) reads `.url`/`.apiKey` off this to fill
   * `AdapterContext` for `postLaunchInjection`. Null until init runs, and null again after
   * `shutdownServices` — same lifecycle as `graphDb`/`graphMcpServer` above.
   */
  mcpHttpServer: McpHttpServerHandle | null
  noteManager: NoteManager | null
  noteTagging: NoteTagging | null
  tagClassRepo: TagClassRepo | null
  tagIndex: TagIndex | null
  noteWatcher: NoteWatcher | null
  kanbanStore: KanbanStore | null
  /**
   * The grid cells of keel's own loop and their prompt-prefix parts — built once inside
   * `registerIpcHandlers` (ipc-handlers.ts), the one and only place today, and published here
   * so `initGraph` (service-lifecycle.ts) can hand the SAME instances to `GraphMcpServer` for
   * the `keel_zellen`/`keel_zelle_beauftragen`/`keel_zelle_ergebnis` tools. Null until
   * `registerIpcHandlers` runs — which main.ts calls before `initializeServices`, so by the
   * time `initGraph` reads these, they are already set.
   */
  schleifenZellen: Zellenregister | null
  praefixJeZelle: Map<string, EntitaetsTeile> | null
  /**
   * Same story as `schleifenZellen` above: built once inside `registerIpcHandlers`
   * (it needs `configStore`, which is not reliable before `app.whenReady()` — see
   * config-store.ts — so it cannot move into the static `services` literal in main.ts) and
   * published here for the same reason.
   */
  adapterRegistry: AdapterRegistry | null
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

/**
 * Creates the main (grid/mux) BrowserWindow. Background services are no longer tied
 * to this window — they are initialized once from app.whenReady() via service-lifecycle.ts.
 */
export function createMainWindow(_services: AppServices): BrowserWindow {
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

/**
 * Creates the Settings Window — the third window.
 *
 * Opens only on explicit user action via window:open-settings. The project window opens on
 * start and carries the button, so the path is reachable from a cold start — which is the
 * point: a surface nobody can get to is a surface that does not exist.
 */
export function createSettingsWindow(_services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 520,
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
    // electron-vite dev: same subdirectory-then-root fallback as the project window
    win.loadURL(`${url}/windows/settings-window.html`).catch(() => {
      console.warn('[window-manager] /windows/ path failed, trying root-level')
      win.loadURL(`${url}/settings-window.html`).catch((err: Error) =>
        console.error('[window-manager] settings-window load failed:', err.message)
      )
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/settings-window.html'))
  }

  return win
}

/**
 * Creates the harness window. Mirrors the settings window on purpose — that pattern was built
 * and proved in the running app.
 */
export function createHarnessWindow(_services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 760,
    minHeight: 560,
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
    win.loadURL(`${url}/windows/harness-window.html`).catch(() => {
      console.warn('[window-manager] /windows/ path failed, trying root-level')
      win.loadURL(`${url}/harness-window.html`).catch((err: Error) =>
        console.error('[window-manager] harness-window load failed:', err.message)
      )
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/harness-window.html'))
  }

  return win
}
