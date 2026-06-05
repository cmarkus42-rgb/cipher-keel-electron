/**
 * MacOSTTS — macOS `say` command fallback for TTS.
 *
 * Used when Piper is not available (CK-VOICE-003).
 * Audio is processed EXCLUSIVELY locally (CK-NFR-006).
 */

import { execFile, type ChildProcess } from 'node:child_process'
import { TTSEngine } from './tts-engine'

export class MacOSTTS extends TTSEngine {
  private ready = false
  private _interrupted = false
  private currentProcess: ChildProcess | null = null

  async init(): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('MacOSTTS is only available on macOS')
    }
    this.ready = true
  }

  async *speak(text: string): AsyncGenerator<Buffer> {
    if (!this.ready) {
      throw new Error('MacOSTTS not initialized')
    }

    this._interrupted = false

    // macOS say outputs to speakers directly — we yield nothing
    // but the speak contract requires async generator
    await new Promise<void>((resolve, reject) => {
      if (this._interrupted) { resolve(); return }

      this.currentProcess = execFile('say', [text], (err) => {
        this.currentProcess = null
        if (err && !this._interrupted) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  stop(): void {
    this._interrupted = true
    if (this.currentProcess) {
      try { this.currentProcess.kill('SIGTERM') } catch { /* ignore */ }
      this.currentProcess = null
    }
  }

  isReady(): boolean {
    return this.ready
  }

  shutdown(): void {
    this.stop()
    this.ready = false
  }
}
