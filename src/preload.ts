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
import type { CipherKeelBridge } from './shared/cipher-keel-bridge'

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

// ---------------------------------------------------------------------------
// Voice API — typed wrappers for voice IPC (CK-VOICE-001..010)
// ---------------------------------------------------------------------------
const voiceApi = {
  available: () => ipcRenderer.invoke('voice:available' as RendererToMainChannel),
  startSession: () => ipcRenderer.invoke('voice:start-session' as RendererToMainChannel),
  stopSession: () => ipcRenderer.invoke('voice:stop-session' as RendererToMainChannel),
  setSessionTarget: (sessionId: string | null) =>
    ipcRenderer.send('voice:set-session-target' as RendererToMainChannel, sessionId),
  setRoutingMode: (mode: string) =>
    ipcRenderer.send('voice:set-routing-mode' as RendererToMainChannel, mode),
  vadSpeechStart: () =>
    ipcRenderer.send('voice:vad-speech-start' as RendererToMainChannel),
  vadSpeechEnd: (audio: number[]) =>
    ipcRenderer.send('voice:vad-speech-end' as RendererToMainChannel, audio),
  vadMisfire: () =>
    ipcRenderer.send('voice:vad-misfire' as RendererToMainChannel),
  bargeIn: () =>
    ipcRenderer.send('voice:barge-in' as RendererToMainChannel),
  pinSession: (sessionId: string) =>
    ipcRenderer.send('voice:pin-session' as RendererToMainChannel, sessionId),

  // Event listeners (Main → Renderer)
  onState: (cb: (state: string) => void) => {
    const listener = (_e: IpcRendererEvent, state: string) => cb(state)
    ipcRenderer.on('voice:state' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('voice:state' as MainToRendererChannel, listener) }
  },
  onTranscription: (cb: (text: string) => void) => {
    const listener = (_e: IpcRendererEvent, text: string) => cb(text)
    ipcRenderer.on('voice:transcription' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('voice:transcription' as MainToRendererChannel, listener) }
  },
  onDispatched: (cb: (data: { sessionId: string; text: string }) => void) => {
    const listener = (_e: IpcRendererEvent, data: { sessionId: string; text: string }) => cb(data)
    ipcRenderer.on('voice:dispatched' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('voice:dispatched' as MainToRendererChannel, listener) }
  },
  onError: (cb: (msg: string) => void) => {
    const listener = (_e: IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('voice:error' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('voice:error' as MainToRendererChannel, listener) }
  },
  onPinStatus: (cb: (data: { pinned: boolean; sessionId: string | null }) => void) => {
    const listener = (_e: IpcRendererEvent, data: { pinned: boolean; sessionId: string | null }) => cb(data)
    ipcRenderer.on('voice:pin-status' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('voice:pin-status' as MainToRendererChannel, listener) }
  },
  onActiveSession: (cb: (data: { sessionId: string | null }) => void) => {
    const listener = (_e: IpcRendererEvent, data: { sessionId: string | null }) => cb(data)
    ipcRenderer.on('voice:active-session' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('voice:active-session' as MainToRendererChannel, listener) }
  },
}

// ---------------------------------------------------------------------------
// Notes API — typed wrappers for notes IPC (CK-NOTES-001..003)
// ---------------------------------------------------------------------------
const notesApi = {
  list: (filterTags?: string[]) =>
    ipcRenderer.invoke('notes:list' as RendererToMainChannel, filterTags),
  create: (title: string, body: string, tags?: string[]) =>
    ipcRenderer.invoke('notes:create' as RendererToMainChannel, title, body, tags),
  read: (id: string) =>
    ipcRenderer.invoke('notes:read' as RendererToMainChannel, id),
  save: (id: string, body: string, tags?: string[]) =>
    ipcRenderer.invoke('notes:save' as RendererToMainChannel, id, body, tags),
  saveRaw: (id: string, rawContent: string) =>
    ipcRenderer.invoke('notes:save-raw' as RendererToMainChannel, id, rawContent),
  delete: (id: string) =>
    ipcRenderer.invoke('notes:delete' as RendererToMainChannel, id),
  trash: (id: string) =>
    ipcRenderer.invoke('notes:trash' as RendererToMainChannel, id),
  trashMany: (ids: string[]) =>
    ipcRenderer.invoke('notes:trash-many' as RendererToMainChannel, ids),
  restoreMany: (ids: string[]) =>
    ipcRenderer.invoke('notes:restore-many' as RendererToMainChannel, ids),
  search: (query: string, tags?: string[]) =>
    ipcRenderer.invoke('notes:search' as RendererToMainChannel, query, tags),
  tags: () =>
    ipcRenderer.invoke('notes:tags' as RendererToMainChannel),
  autoTag: (content: string) =>
    ipcRenderer.invoke('notes:auto-tag' as RendererToMainChannel, content),
  tagIndex: () =>
    ipcRenderer.invoke('notes:tag-index' as RendererToMainChannel),

  // Event listeners (Main → Renderer)
  onChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('notes:changed' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('notes:changed' as MainToRendererChannel, listener) }
  },
  onValidationWarning: (cb: (warnings: string[]) => void) => {
    const listener = (_e: IpcRendererEvent, warnings: string[]) => cb(warnings)
    ipcRenderer.on('notes:validation-warning' as MainToRendererChannel, listener)
    return () => { ipcRenderer.removeListener('notes:validation-warning' as MainToRendererChannel, listener) }
  },
}

// ---------------------------------------------------------------------------
// Graph API — typed wrappers for knowledge graph IPC (CK-GRAPH-037)
// ---------------------------------------------------------------------------
const graphApi = {
  search: (params: { query: string; limit?: number; kind?: string }) =>
    ipcRenderer.invoke('graph:search' as RendererToMainChannel, params),
  getNode: (uid: string) =>
    ipcRenderer.invoke('graph:read' as RendererToMainChannel, uid),
  expand: (params: { uid: string; depth?: number; edge_type?: string; direction?: string }) =>
    ipcRenderer.invoke('graph:expand' as RendererToMainChannel, params),
  query: (params: { template: string; params?: Record<string, unknown> }) =>
    ipcRenderer.invoke('graph:query' as RendererToMainChannel, params),
  upsertNode: (input: { kind: string; title: string; [key: string]: unknown }) =>
    ipcRenderer.invoke('graph:write' as RendererToMainChannel, input),
  link: (input: { src: string; dst: string; type?: string; source?: string; props?: Record<string, unknown> }) =>
    ipcRenderer.invoke('graph:link' as RendererToMainChannel, input),
  maintain: (params: { operation: string }) =>
    ipcRenderer.invoke('graph:maintain' as RendererToMainChannel, params),
  deleteNode: (uid: string) =>
    ipcRenderer.invoke('graph:delete' as RendererToMainChannel, uid),
}

// Type-checked against the canonical shape (src/shared/cipher-keel-bridge.ts)
// that src/renderer/preload-api.d.ts declares window.cipherKeel with — this
// is what keeps the two in sync instead of drifting apart silently.
const fullApi: CipherKeelBridge = { ...api, voice: voiceApi, notes: notesApi, graph: graphApi }

contextBridge.exposeInMainWorld('cipherKeel', fullApi)
