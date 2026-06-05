/**
 * NoteWatcher — Filesystem watcher for external note changes.
 *
 * Ported from cipher-mux 0.9.x.
 * Debounces and deduplicates rapid events. Suppresses internal writes.
 */

import fs from 'node:fs'

export class NoteWatcher {
  private dir: string
  private onChange: (noteId: string) => void
  private watcher: fs.FSWatcher | null = null
  private pending = new Map<string, NodeJS.Timeout>()
  private suppressed = new Set<string>()
  private debounceMs = 500

  constructor(dir: string, onChange: (noteId: string) => void) {
    this.dir = dir
    this.onChange = onChange
  }

  start(): void {
    if (this.watcher) return
    try {
      this.watcher = fs.watch(this.dir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return
        const noteId = filename.replace(/\.md$/, '')
        this.debounce(noteId)
      })
      this.watcher.on('error', () => {
        this.stop()
      })
    } catch {
      // Directory may not exist yet
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const timer of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
    this.suppressed.clear()
  }

  suppressNext(noteId: string): void {
    this.suppressed.add(noteId)
    setTimeout(() => this.suppressed.delete(noteId), 2000)
  }

  private debounce(noteId: string): void {
    const existing = this.pending.get(noteId)
    if (existing) clearTimeout(existing)

    this.pending.set(noteId, setTimeout(() => {
      this.pending.delete(noteId)

      if (this.suppressed.has(noteId)) {
        this.suppressed.delete(noteId)
        return
      }

      this.onChange(noteId)
    }, this.debounceMs))
  }
}
