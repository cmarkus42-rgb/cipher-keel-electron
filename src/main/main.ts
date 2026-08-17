/**
 * cipher-keel-electron — Electron Main Process entry point.
 *
 * Startup, service instantiation, and app-lifecycle events only.
 * Window creation, IPC registration and background service init are delegated to:
 *   window-manager.ts    — BrowserWindow lifecycle
 *   ipc-handlers.ts      — all IPC handler registrations
 *   service-lifecycle.ts — window-independent background service init (Befund 1)
 *
 * Security baseline (CK-NFR-004, CK-INF-022) — NON-NEGOTIABLE:
 *   contextIsolation: true, nodeIntegration: false, sandbox: true
 *   (enforced in window-manager.ts BrowserWindow webPreferences)
 *
 * Startup performance (CK-INF-025, CK-NFR-008):
 *   Service init is deferred one tick so the project window paints first, but runs
 *   from app.whenReady() regardless of whether any window opens the grid.
 */

import { app, BrowserWindow } from 'electron'
import { TmuxManager } from './tmux/tmux-manager'
import { StatusLineMonitor } from './monitoring/statusline-monitor'
import { patchEnvPath } from './util/exec-util'
import { createProjectWindow } from './window-manager'
import type { AppServices } from './window-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { registerWindow } from './event-bus'
import { initializeServices, shutdownServices } from './service-lifecycle'
import { configStore } from './config/config-store'

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
  voiceManager: null,
  graphDb: null,
  graphWriter: null,
  graphMcpServer: null,
  noteManager: null,
  noteTagging: null,
  tagClassRepo: null,
  tagIndex: null,
  noteWatcher: null,
  kanbanStore: null,
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  console.log('[main] app ready — registering handlers + creating project window')
  registerIpcHandlers(services)
  const win = createProjectWindow(services)
  registerWindow(win)
  console.log('[main] project window created, id:', win.id)

  // Deferred so the window paints first — startup budget stays under 5s
  // (CK-INF-025, CK-NFR-008). Measured for real in Phase 9.
  setImmediate(() => {
    void initializeServices(services, {
      userDataPath: app.getPath('userData'),
      appPath: app.getAppPath(),
      voiceEnabled: configStore.get('voice').enabled !== false,
    })
  })

  win.on('closed', () => {
    console.log('[main] project window closed')
  })

  win.webContents.on('did-fail-load', (_ev, code, desc) => {
    console.error('[main] project window failed to load:', code, desc)
  })

  win.webContents.on('did-finish-load', () => {
    console.log('[main] project window finished loading')
  })

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      registerWindow(createProjectWindow(services))
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

// Graceful shutdown — tear down every background service (tmux, voice,
// note watcher, graph DB) so nothing is left connected or holding a file handle
// (CK-GRAPH-028). See service-lifecycle.ts for the per-disposer failure isolation.
app.on('before-quit', () => {
  shutdownServices(services)
})
