/**
 * preload-api.d.ts — Unified TypeScript declaration for window.cipherKeel.
 *
 * This file is the single source of truth for the renderer-side API bridge.
 * The actual implementation lives in src/preload.ts (contextBridge).
 *
 * CK-INF-009, CK-INF-022
 */

declare global {
  interface Window {
    cipherKeel: CipherKeelBridge
  }
}

export interface CipherKeelBridge {
  /** Fire-and-forget message to main process. */
  send(channel: string, ...args: unknown[]): void
  /** Invoke main handler and await response. */
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  /** Subscribe to push events from main. Returns unsubscribe function. */
  on(channel: string, listener: (...args: unknown[]) => void): () => void
  /** Subscribe once to a push event from main. */
  once(channel: string, listener: (...args: unknown[]) => void): void

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

export {}
