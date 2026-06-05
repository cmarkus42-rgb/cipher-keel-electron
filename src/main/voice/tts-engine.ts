/**
 * TTSEngine — Abstract base class for text-to-speech engines.
 *
 * Ported from cipher-mux 0.9.x (CK-VOICE-003).
 */

export abstract class TTSEngine {
  protected config: Record<string, unknown>

  constructor(config?: Record<string, unknown>) {
    this.config = config ?? {}
  }

  abstract init(): Promise<void>
  abstract speak(text: string): AsyncGenerator<Buffer>
  abstract stop(): void
  abstract isReady(): boolean
  abstract shutdown(): void
}
