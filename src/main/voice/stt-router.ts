/**
 * STT Router — local-only speech-to-text routing layer.
 *
 * Only local Whisper via STTEngine — no cloud STT (CK-NFR-006).
 * Ported from cipher-mux 0.9.x (CK-VOICE-002).
 */

import { EventEmitter } from 'node:events'
import { STTEngine, type STTEngineOptions } from './stt-engine'

export interface STTRouterConfig {
  local: STTEngineOptions
  onStatusChange?: (msg: string, level: string) => void
}

export class STTRouter extends EventEmitter {
  private readonly engine: STTEngine
  private readonly onStatus: ((msg: string, level: string) => void) | undefined

  constructor(config: STTRouterConfig) {
    super()
    this.engine = new STTEngine(config.local)
    this.onStatus = config.onStatusChange
  }

  async init(): Promise<void> {
    this.onStatus?.('Initializing local STT engine…', 'info')
    try {
      await this.engine.init()
      this.onStatus?.('Local STT engine ready', 'info')
    } catch (err) {
      const msg = `STT init failed: ${(err as Error).message}`
      this.onStatus?.(msg, 'error')
      throw err
    }
  }

  isReady(): boolean {
    return this.engine.isReady()
  }

  activeProvider(): 'local' {
    return 'local'
  }

  async transcribeBatch(pcmBuffer: Buffer, prompt?: string): Promise<string> {
    return this.engine.transcribe(pcmBuffer, prompt)
  }

  shutdown(): void {
    this.engine.shutdown()
    this.removeAllListeners()
  }
}
