/**
 * StatusLineMonitor — Watches /tmp/cipher-keel/context/ for per-session
 * context usage JSON files written by Claude Code's statusLine hook.
 *
 * Each file is named <session-id>.json and contains a JSON object with
 * context usage data. The monitor parses these files and emits events.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-007).
 */

import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { CONTEXT_WARNING_THRESHOLD, STATUSLINE_DIR } from '../../shared/constants'
import type { ContextUsage } from '../../shared/types'

export class StatusLineMonitor extends EventEmitter {
  private watchDir: string
  private watcher: fs.FSWatcher | null = null
  private cache: Map<string, ContextUsage> = new Map()
  private warningEmitted: Set<string> = new Set()
  /** Session IDs that were explicitly removed — ignore subsequent file changes (race guard). */
  private removedIds: Set<string> = new Set()

  constructor(watchDir: string = STATUSLINE_DIR) {
    super()
    this.watchDir = watchDir
  }

  /**
   * Start watching the context directory.
   * Creates the directory if it doesn't exist.
   */
  start(): void {
    if (this.watcher) return

    fs.mkdirSync(this.watchDir, { recursive: true })
    this.scanExisting()

    try {
      this.watcher = fs.watch(this.watchDir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return
        this.handleFileChange(filename)
      })

      this.watcher.on('error', (err) => {
        console.error('[StatusLineMonitor] watch error:', err)
      })
    } catch (err) {
      console.error('[StatusLineMonitor] failed to start watch:', err)
    }
  }

  /**
   * Stop watching and clear cache.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.cache.clear()
    this.warningEmitted.clear()
    this.removedIds.clear()
  }

  get(sessionId: string): ContextUsage | undefined {
    return this.cache.get(sessionId)
  }

  getAll(): Map<string, ContextUsage> {
    return new Map(this.cache)
  }

  /**
   * Remove a session from the cache (when session stops).
   * Adds a tombstone to prevent the file watcher from re-adding stale data.
   */
  remove(sessionId: string): void {
    this.cache.delete(sessionId)
    this.warningEmitted.delete(sessionId)
    this.removedIds.add(sessionId)

    const filePath = path.join(this.watchDir, `${sessionId}.json`)
    try {
      fs.unlinkSync(filePath)
    } catch {
      // file may not exist
    }
  }

  /**
   * Clear the tombstone for a session ID (when a session with this ID is re-created).
   */
  clearRemoved(sessionId: string): void {
    this.removedIds.delete(sessionId)
  }

  private scanExisting(): void {
    try {
      const files = fs.readdirSync(this.watchDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          this.handleFileChange(file)
        }
      }
    } catch {
      // directory may be empty or not readable
    }
  }

  private handleFileChange(filename: string): void {
    const sessionId = filename.replace('.json', '')
    if (!sessionId) return
    if (this.removedIds.has(sessionId)) return
    const filePath = path.join(this.watchDir, filename)

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      const usage = this.parseUsage(data)

      if (!usage) return

      this.cache.set(sessionId, usage)
      this.emit('usage-updated', sessionId, usage)

      // Extract Claude session ID if present
      const claudeSessionId = this.extractClaudeSessionId(data)
      if (claudeSessionId) {
        this.emit('claude-session-id', sessionId, claudeSessionId)
      }

      // Warning threshold
      if (usage.usedPercentage >= CONTEXT_WARNING_THRESHOLD && !this.warningEmitted.has(sessionId)) {
        this.warningEmitted.add(sessionId)
        this.emit('usage-warning', sessionId, usage)
      }

      // Reset warning if usage drops back (e.g. new conversation)
      if (usage.usedPercentage < CONTEXT_WARNING_THRESHOLD) {
        this.warningEmitted.delete(sessionId)
      }
    } catch {
      // File may be mid-write or invalid JSON — ignore
    }
  }

  /**
   * Parse a statusLine JSON payload into ContextUsage.
   * Defensive: returns null if data is malformed.
   *
   * Claude Code nests context data under `context_window`:
   *   { context_window: { used_percentage, ... }, model: { id }, ... }
   * We also support flat payloads for forward-compat and testing.
   */
  private parseUsage(data: unknown): ContextUsage | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>

    const cw = (d.context_window && typeof d.context_window === 'object')
      ? d.context_window as Record<string, unknown>
      : null

    const usedPercentage = cw && typeof cw.used_percentage === 'number' ? cw.used_percentage
      : typeof d.usedPercentage === 'number' ? d.usedPercentage
      : typeof d.used_percentage === 'number' ? d.used_percentage
      : typeof d.percent === 'number' ? d.percent
      : null

    if (usedPercentage === null) return null

    const remainingPercentage = cw && typeof cw.remaining_percentage === 'number' ? cw.remaining_percentage
      : typeof d.remainingPercentage === 'number' ? d.remainingPercentage
      : 100 - usedPercentage

    const totalInputTokens = cw && typeof cw.total_input_tokens === 'number' ? cw.total_input_tokens
      : typeof d.totalInputTokens === 'number' ? d.totalInputTokens
      : (d.total_input_tokens as number) ?? 0

    const totalOutputTokens = cw && typeof cw.total_output_tokens === 'number' ? cw.total_output_tokens
      : typeof d.totalOutputTokens === 'number' ? d.totalOutputTokens
      : (d.total_output_tokens as number) ?? 0

    const contextWindowSize = cw && typeof cw.context_window_size === 'number' ? cw.context_window_size
      : typeof d.contextWindowSize === 'number' ? d.contextWindowSize
      : (d.context_window_size as number) ?? 0

    const modelObj = (d.model && typeof d.model === 'object') ? d.model as Record<string, unknown> : null
    const modelId = modelObj && typeof modelObj.id === 'string' ? modelObj.id
      : typeof d.modelId === 'string' ? d.modelId
      : (d.model_id as string) ?? ''

    // Compute actual context window usage from current_usage (if available)
    const currentUsage = cw && typeof cw.current_usage === 'object' ? cw.current_usage as Record<string, unknown> : null
    let used: number | undefined
    if (currentUsage) {
      const inputTokens = typeof currentUsage.input_tokens === 'number' ? currentUsage.input_tokens : 0
      const outputTokens = typeof currentUsage.output_tokens === 'number' ? currentUsage.output_tokens : 0
      const cacheCreation = typeof currentUsage.cache_creation_input_tokens === 'number' ? currentUsage.cache_creation_input_tokens : 0
      const cacheRead = typeof currentUsage.cache_read_input_tokens === 'number' ? currentUsage.cache_read_input_tokens : 0
      used = inputTokens + outputTokens + cacheCreation + cacheRead
    } else if (contextWindowSize > 0 && usedPercentage > 0) {
      used = Math.round(contextWindowSize * usedPercentage / 100)
    }

    return {
      usedPercentage,
      remainingPercentage,
      totalInputTokens,
      totalOutputTokens,
      contextWindowSize,
      used,
      total: contextWindowSize > 0 ? contextWindowSize : undefined,
      modelId,
      updatedAt: Date.now(),
    }
  }

  private extractClaudeSessionId(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    if (typeof d.session_id === 'string' && d.session_id) return d.session_id
    if (typeof d.sessionId === 'string' && d.sessionId) return d.sessionId
    return null
  }
}
