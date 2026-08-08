/**
 * cipher-keel-bridge.ts — Canonical shape of window.cipherKeel.
 *
 * Single source of truth for the renderer-side API bridge exposed by
 * src/preload.ts via contextBridge. Lives under src/shared/ (not
 * src/renderer/) so it is reachable from BOTH tsconfig.node.json (which
 * type-checks src/preload.ts against it) and tsconfig.web.json (whose
 * src/renderer/preload-api.d.ts declares window.cipherKeel with it) without
 * either project reaching across the solution-style project-reference
 * boundary — src/preload.ts itself is only in the node project's file list,
 * so importing its type directly from the web project is not valid there.
 *
 * Phase 7 / Task 5b: previously this shape was declared twice — once here
 * (informally, hand-written and already drifted: its on()/once() listener
 * signature omitted the mandatory IpcRendererEvent first argument that
 * Electron always passes) and once derived from src/preload.ts's actual
 * implementation in src/renderer/env.d.ts. The two conflicting global
 * `Window.cipherKeel` augmentations were only not a compile error because
 * `skipLibCheck: true` skips validating that declaration merges agree.
 * There is now exactly one declaration of this shape.
 *
 * Follow-up finding: that consolidation kept the *looser* of the two
 * declarations — `channel` typed as plain `string` here, vs.
 * `RendererToMainChannel` / `MainToRendererChannel` in src/preload.ts's
 * actual implementation — so the renderer had zero compile-time validation
 * of IPC channel names. Now imports and uses the same two unions from
 * ipc-channels.ts that src/preload.ts already uses, so this declaration and
 * the implementation it describes cannot drift apart again.
 *
 * CK-INF-009, CK-INF-022
 */

import type { IpcRendererEvent } from 'electron'
import type { RendererToMainChannel, MainToRendererChannel } from './ipc-channels'

export interface CipherKeelBridge {
  /** Fire-and-forget message to main process. */
  send(channel: RendererToMainChannel, ...args: unknown[]): void
  /** Invoke main handler and await response. */
  invoke(channel: RendererToMainChannel, ...args: unknown[]): Promise<unknown>
  /** Subscribe to push events from main. Returns unsubscribe function. */
  on(channel: MainToRendererChannel, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): () => void
  /** Subscribe once to a push event from main. */
  once(channel: MainToRendererChannel, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): void

  voice: {
    available(): Promise<unknown>
    startSession(): Promise<unknown>
    stopSession(): Promise<unknown>
    setSessionTarget(sessionId: string | null): void
    setRoutingMode(mode: string): void
    vadSpeechStart(): void
    vadSpeechEnd(audio: number[]): void
    vadMisfire(): void
    bargeIn(): void
    pinSession(sessionId: string): void
    onState(cb: (state: string) => void): () => void
    onTranscription(cb: (text: string) => void): () => void
    onDispatched(cb: (data: { sessionId: string; text: string }) => void): () => void
    onError(cb: (msg: string) => void): () => void
    onPinStatus(cb: (data: { pinned: boolean; sessionId: string | null }) => void): () => void
    onActiveSession(cb: (data: { sessionId: string | null }) => void): () => void
  }

  notes: {
    list(filterTags?: string[]): Promise<unknown>
    create(title: string, body: string, tags?: string[]): Promise<unknown>
    read(id: string): Promise<unknown>
    save(id: string, body: string, tags?: string[]): Promise<unknown>
    saveRaw(id: string, rawContent: string): Promise<unknown>
    delete(id: string): Promise<unknown>
    trash(id: string): Promise<unknown>
    trashMany(ids: string[]): Promise<unknown>
    restoreMany(ids: string[]): Promise<unknown>
    search(query: string, tags?: string[]): Promise<unknown>
    tags(): Promise<unknown>
    autoTag(content: string): Promise<unknown>
    tagIndex(): Promise<unknown>
    onChanged(cb: () => void): () => void
    onValidationWarning(cb: (warnings: string[]) => void): () => void
  }

  graph: {
    search(params: { query: string; limit?: number; kind?: string }): Promise<unknown>
    getNode(uid: string): Promise<unknown>
    expand(params: { uid: string; depth?: number; edge_type?: string; direction?: string }): Promise<unknown>
    query(params: { template: string; params?: Record<string, unknown> }): Promise<unknown>
    upsertNode(input: { kind: string; title: string; [key: string]: unknown }): Promise<unknown>
    link(input: { src: string; dst: string; type?: string; source?: string; props?: Record<string, unknown> }): Promise<unknown>
    maintain(params: { operation: string }): Promise<unknown>
    deleteNode(uid: string): Promise<unknown>
  }
}
