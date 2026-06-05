/**
 * BargeInMonitor — renderer-side amplitude monitor for barge-in detection.
 *
 * Attaches to mic MediaStream via AnalyserNode and polls RMS amplitude.
 * When signal exceeds threshold for minimum duration, fires onBargeIn callback.
 *
 * Ported from cipher-mux 0.9.x.
 */

export interface BargeInMonitorOptions {
  thresholdDb?: number
  minDurationMs?: number
  pollIntervalMs?: number
  onBargeIn: () => void
}

export class BargeInMonitor {
  private thresholdLinear: number
  private minDurationMs: number
  private pollIntervalMs: number
  private onBargeIn: () => void

  private analyser: AnalyserNode | null = null
  private dataBuffer: Float32Array | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null

  private enabled = false
  private onsetStartTime: number | null = null
  private fired = false

  constructor(opts: BargeInMonitorOptions) {
    const thresholdDb = opts.thresholdDb ?? -30
    this.thresholdLinear = Math.pow(10, thresholdDb / 20)
    this.minDurationMs = opts.minDurationMs ?? 50
    this.pollIntervalMs = opts.pollIntervalMs ?? 20
    this.onBargeIn = opts.onBargeIn
  }

  attach(stream: MediaStream, audioCtx: AudioContext): void {
    if (this.analyser) this.detach()

    const source = audioCtx.createMediaStreamSource(stream)
    this.analyser = audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    this.dataBuffer = new Float32Array(this.analyser.fftSize)
    this.pollTimer = setInterval(() => this._poll(), this.pollIntervalMs)
  }

  detach(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.analyser) {
      try { this.analyser.disconnect() } catch { /* ignore */ }
      this.analyser = null
    }
    this.dataBuffer = null
    this.enabled = false
    this.onsetStartTime = null
    this.fired = false
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.onsetStartTime = null
      this.fired = false
    }
  }

  private _poll(): void {
    if (!this.enabled || this.fired || !this.analyser || !this.dataBuffer) return

    this.analyser.getFloatTimeDomainData(this.dataBuffer)
    const rms = this._computeRMS(this.dataBuffer)

    if (rms >= this.thresholdLinear) {
      if (this.onsetStartTime === null) {
        this.onsetStartTime = Date.now()
      } else if (Date.now() - this.onsetStartTime >= this.minDurationMs) {
        this.fired = true
        this.onBargeIn()
      }
    } else {
      this.onsetStartTime = null
    }
  }

  private _computeRMS(samples: Float32Array): number {
    if (samples.length === 0) return 0
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    return Math.sqrt(sum / samples.length)
  }
}
