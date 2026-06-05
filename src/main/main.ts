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
} from '../shared/ipc-channels'
import { TmuxManager } from './tmux/tmux-manager'
import { StatusLineMonitor } from './monitoring/statusline-monitor'
import { NanoClawBridge, NanoClawChannelAdapter } from './nanoclaw'
import { configStore } from './config/config-store'
import type { CipherKeelConfig } from './config/config-store'
import { patchEnvPath } from './util/exec-util'

// ---------------------------------------------------------------------------
// Patch PATH early — macOS GUI apps have minimal PATH
// ---------------------------------------------------------------------------
patchEnvPath()

// ---------------------------------------------------------------------------
// Singleton tmux manager
// ---------------------------------------------------------------------------
const tmux = new TmuxManager()
const statusMonitor = new StatusLineMonitor()
// CK-S2-015: NanoClaw daemon runs independently — cipher-keel does NOT start/stop it.
// The bridge only connects as a client to an already-running NanoClaw socket.
const nanoClawBridge = new NanoClawBridge()
const _nanoClawAdapter = new NanoClawChannelAdapter(nanoClawBridge)

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
