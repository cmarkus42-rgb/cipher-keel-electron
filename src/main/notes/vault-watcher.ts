/**
 * Vault Watcher — filesystem watcher for external vault changes (Obsidian).
 * Debounced, markdown-only, incremental.
 * CK-NOTES-009
 */

import fs from 'node:fs'
import path from 'node:path'

export type VaultEvent = {
  type: 'created' | 'changed' | 'deleted'
  path: string
}

export class VaultWatcher {
  private watcher: fs.FSWatcher | null = null
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private readonly DEBOUNCE_MS = 500

  constructor(
    private vaultPath: string,
    private onFileChanged: (event: VaultEvent) => void,
  ) {}

  start(): void {
    this.watcher = fs.watch(this.vaultPath, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return

      const fullPath = path.join(this.vaultPath, filename)

      const existing = this.debounceTimers.get(fullPath)
      if (existing) clearTimeout(existing)

      this.debounceTimers.set(fullPath, setTimeout(() => {
        this.debounceTimers.delete(fullPath)
        const exists = fs.existsSync(fullPath)
        this.onFileChanged({
          type: exists ? (eventType === 'rename' ? 'created' : 'changed') : 'deleted',
          path: fullPath,
        })
      }, this.DEBOUNCE_MS))
    })
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()
  }
}
