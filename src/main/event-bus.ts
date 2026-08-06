/**
 * event-bus.ts — Main→Renderer broadcast registry.
 *
 * Background services must not capture a single BrowserWindow in a closure: with two
 * windows open (project + grid) only the window that triggered initialization would
 * receive events. Every window registers here; broadcast reaches all live ones.
 *
 * CK-UI-002 (Drei-Fenster-Modell)
 */

import type { MainToRendererChannel } from '../shared/ipc-channels'

/**
 * Structural subset of BrowserWindow. Declared structurally so this module stays
 * loadable under vitest without electron.
 */
export interface BroadcastTarget {
  webContents: { send(channel: string, ...args: unknown[]): void }
  isDestroyed(): boolean
  once(event: 'closed', cb: () => void): void
}

const windows = new Set<BroadcastTarget>()

/** Registers a window and auto-deregisters it when it closes. */
export function registerWindow(win: BroadcastTarget): void {
  if (windows.has(win)) return
  windows.add(win)
  win.once('closed', () => {
    windows.delete(win)
  })
}

/** Sends a channel message to every live registered window. */
export function broadcast(channel: MainToRendererChannel, ...args: unknown[]): void {
  for (const win of [...windows]) {
    if (win.isDestroyed()) {
      windows.delete(win)
      continue
    }
    try {
      win.webContents.send(channel, ...args)
    } catch (err) {
      // A window can die between the isDestroyed check and the send.
      console.warn('[event-bus] send failed, dropping window:', err)
      windows.delete(win)
    }
  }
}

/** Number of currently registered windows. */
export function windowCount(): number {
  return windows.size
}

/** Test seam — clears the registry. */
export function resetEventBus(): void {
  windows.clear()
}
