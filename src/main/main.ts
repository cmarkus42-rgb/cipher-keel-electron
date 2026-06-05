/**
 * cipher-keel-electron — Electron Main Process entry point.
 *
 * Startup, service instantiation, and app-lifecycle events only.
 * Window creation and IPC registration are delegated to:
 *   window-manager.ts  — BrowserWindow lifecycle + background init
 *   ipc-handlers.ts    — all IPC handler registrations
 *
 * Security baseline (CK-NFR-004, CK-INF-022) — NON-NEGOTIABLE:
 *   contextIsolation: true, nodeIntegration: false, sandbox: true
 *   (enforced in window-manager.ts BrowserWindow webPreferences)
 *
 * Startup performance (CK-INF-025, CK-NFR-008):
 *   Heavy initializations run AFTER window is shown.
 */

import { app, BrowserWindow } from 'electron'
import { TmuxManager } from './tmux/tmux-manager'
import { StatusLineMonitor } from './monitoring/statusline-monitor'
import { NanoClawBridge, NanoClawChannelAdapter } from './nanoclaw'
import { patchEnvPath } from './util/exec-util'
import { createMainWindow } from './window-manager'
import type { AppServices } from './window-manager'
import { registerIpcHandlers } from './ipc-handlers'

// ---------------------------------------------------------------------------
// Patch PATH early — macOS GUI apps have minimal PATH
// ---------------------------------------------------------------------------
patchEnvPath()

// ---------------------------------------------------------------------------
// Service container — all services start here, lazily populated by background init
// ---------------------------------------------------------------------------
const services: AppServices = {
  tmux: new TmuxManager(),
  statusMonitor: new StatusLineMonitor(),
  nanoClawBridge: new NanoClawBridge(),
  voiceManager: null,
  graphDb: null,
  graphWriter: null,
  graphMcpServer: null,
  noteManager: null,
  noteTagging: null,
  tagClassRepo: null,
  tagIndex: null,
  noteWatcher: null,
}

// NanoClawChannelAdapter wraps the bridge — held as module-level ref to prevent GC
const _nanoClawAdapter = new NanoClawChannelAdapter(services.nanoClawBridge)

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpcHandlers(services)
  createMainWindow(services)

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(services)
    }
  })
})

// Quit on all windows closed (Windows/Linux behavior; macOS handles via 'activate')
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// P2-SEC: Prevent silent crashes from unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[main] Unhandled rejection:', reason)
})

// Graceful shutdown — close graph DB to flush WAL (CK-GRAPH-028)
app.on('before-quit', () => {
  try {
    services.graphDb?.close()
    services.graphDb = null
    services.graphWriter = null
    services.graphMcpServer = null
  } catch (err) {
    console.warn('[main] Graph DB close error:', err)
  }
})
