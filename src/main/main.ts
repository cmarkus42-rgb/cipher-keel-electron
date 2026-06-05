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
  CONFIG_GET,
  CONFIG_SET
} from '../shared/ipc-channels'

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

function initializeBackgroundServices(win: BrowserWindow): void {
  // Notify renderer that the app is ready
  // Heavy services (graph-db, NanoClaw, voice-pipeline) will be initialized
  // here in subsequent BT milestones — kept async to meet CK-INF-025 <5s target.
  win.webContents.send(APP_READY, { timestamp: Date.now() })
}

// ---------------------------------------------------------------------------
// IPC handler stubs (filled in by BT-3b and later milestones)
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // Session handlers (tmux backend — CK-INF-002)
  ipcMain.handle(SESSION_LIST, async () => {
    // TODO BT-3b: TmuxManager.listSessions()
    return []
  })

  ipcMain.handle(SESSION_CREATE, async (_event, _opts: unknown) => {
    // TODO BT-3b: TmuxManager.createSession()
    return { id: null, error: 'TmuxManager not yet initialized' }
  })

  ipcMain.handle(SESSION_DESTROY, async (_event, _id: unknown) => {
    // TODO BT-3b: TmuxManager.destroySession()
    return { ok: false, error: 'TmuxManager not yet initialized' }
  })

  // Config handlers (ConfigStore — CK-INF-008)
  ipcMain.handle(CONFIG_GET, async (_event, _key: unknown) => {
    // TODO BT-3c: ConfigStore.get()
    return null
  })

  ipcMain.handle(CONFIG_SET, async (_event, _key: unknown, _value: unknown) => {
    // TODO BT-3c: ConfigStore.set()
    return { ok: false, error: 'ConfigStore not yet initialized' }
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
