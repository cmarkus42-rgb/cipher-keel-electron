/**
 * cipher-keel-electron preload script.
 *
 * This is the ONLY bridge between the Electron main process and the renderer.
 * Only channels declared in src/shared/ipc-channels.ts are exposed.
 *
 * Security baseline (CK-NFR-004, CK-INF-022):
 *   - contextIsolation: true  (enforced in BrowserWindow)
 *   - nodeIntegration: false  (enforced in BrowserWindow)
 *   - sandbox: true           (enforced in BrowserWindow)
 *   - This file is the sole contextBridge.exposeInMainWorld call site.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { RendererToMainChannel, MainToRendererChannel } from './shared/ipc-channels'

// ---------------------------------------------------------------------------
// The API exposed to the renderer (window.cipherKeel)
// ---------------------------------------------------------------------------
const api = {
  /**
   * Send a message from renderer to main (fire-and-forget).
   */
  send(channel: RendererToMainChannel, ...args: unknown[]): void {
    ipcRenderer.send(channel, ...args)
  },

  /**
   * Send a message from renderer to main and wait for a response.
   */
  invoke(channel: RendererToMainChannel, ...args: unknown[]): Promise<unknown> {
    return ipcRenderer.invoke(channel, ...args)
  },

  /**
   * Listen for messages from main sent to this renderer.
   * Returns an unsubscribe function.
   */
  on(
    channel: MainToRendererChannel,
    listener: (event: IpcRendererEvent, ...args: unknown[]) => void
  ): () => void {
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  /**
   * Listen once for a message from main.
   */
  once(
    channel: MainToRendererChannel,
    listener: (event: IpcRendererEvent, ...args: unknown[]) => void
  ): void {
    ipcRenderer.once(channel, listener)
  }
}

contextBridge.exposeInMainWorld('cipherKeel', api)

// ---------------------------------------------------------------------------
// Type declaration for the renderer (window.cipherKeel)
// ---------------------------------------------------------------------------
export type CipherKeelApi = typeof api
