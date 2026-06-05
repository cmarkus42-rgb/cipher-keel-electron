/**
 * Output batching for terminal data before IPC delivery.
 *
 * Batches high-frequency terminal output per pane and flushes
 * at a configurable interval to avoid overwhelming the IPC bridge.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-002).
 */

import { OUTPUT_BATCH_INTERVAL_MS } from '../../shared/constants'

export type FlushCallback = (paneId: string, data: string) => void

/**
 * The timer only runs while there is pending data — no CPU is
 * burned on empty intervals.
 */
export class OutputBatcher {
  private readonly buffers = new Map<string, string>()
  private readonly flushCb: FlushCallback
  private readonly intervalMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private destroyed = false

  constructor(flushCb: FlushCallback, intervalMs: number = OUTPUT_BATCH_INTERVAL_MS) {
    this.flushCb = flushCb
    this.intervalMs = intervalMs
  }

  /** Buffer data for a pane. Starts the flush timer if not already running. */
  push(paneId: string, data: string): void {
    if (this.destroyed) return

    const existing = this.buffers.get(paneId)
    this.buffers.set(paneId, existing ? existing + data : data)

    this.ensureTimer()
  }

  /** Immediately flush all pending buffers to the callback. */
  flush(): void {
    if (this.buffers.size === 0) return

    for (const [paneId, data] of this.buffers) {
      this.flushCb(paneId, data)
    }
    this.buffers.clear()
    this.stopTimer()
  }

  /** Flush remaining data and stop the batcher permanently. */
  destroy(): void {
    this.flush()
    this.destroyed = true
    this.stopTimer()
  }

  /** Number of panes with pending data (useful for testing). */
  get pendingCount(): number {
    return this.buffers.size
  }

  private ensureTimer(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.flush(), this.intervalMs)
  }

  private stopTimer(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
  }
}
