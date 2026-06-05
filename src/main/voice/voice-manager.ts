/**
 * VoiceManager — top-level orchestrator for the entire voice pipeline.
 *
 * Manages: VAD (renderer-side), STT (local Whisper), TTS (Piper / macOS say),
 * VoiceInputRouter (routes transcriptions to sessions).
 *
 * Audio is processed EXCLUSIVELY locally (CK-NFR-006).
 * Voice pipeline is deactivatable (CK-VOICE-009).
 * Graceful degradation on missing hardware/models (CK-VOICE-010).
 *
 * Ported from cipher-mux 0.9.x (CK-VOICE-001, 002, 003, 004).
 */

import { EventEmitter } from 'node:events'
import path from 'node:path'
import { STTRouter, type STTRouterConfig } from './stt-router'
import { PiperTTS } from './tts-piper'
import { MacOSTTS } from './tts-macos'
import { VoiceInputRouter, type VoiceInputRouterDeps } from './voice-input-router'
import { VoiceStateMachine, VoiceState } from './voice-state'
import type { TTSEngine } from './tts-engine'

export type VoiceDotState = 'off' | 'listening' | 'processing' | 'unavailable' | 'disabled'

export interface VoiceManagerConfig {
  whisperModelDir?: string
  piperModelsDir?: string
  piperVoice?: string
  sendKeys: (sessionId: string, data: string) => Promise<void>
}

export class VoiceManager extends EventEmitter {
  private sttRouter: STTRouter | null = null
  private tts: TTSEngine | null = null
  private inputRouter: VoiceInputRouter
  private stateMachine = new VoiceStateMachine()
  private readonly config: VoiceManagerConfig
  private initialized = false
  private sttAvailable = false
  private ttsAvailable = false

  constructor(config: VoiceManagerConfig) {
    super()
    this.config = config

    this.inputRouter = new VoiceInputRouter({
      sendKeys: config.sendKeys,
    })

    // Forward input router events
    this.inputRouter.on('dispatched', (data) => this.emit('dispatched', data))
    this.inputRouter.on('error', (data) => this.emit('error', data))
    this.inputRouter.on('gridNav', (data) => this.emit('gridNav', data))
    this.inputRouter.on('scroll', (data) => this.emit('scroll', data))
    this.inputRouter.on('speechInterrupt', () => this.stopTTS())
    this.inputRouter.on('pinChanged', (data) => this.emit('pinChanged', data))
    this.inputRouter.on('activeSessionChanged', (id) => this.emit('activeSessionChanged', id))

    // State machine transitions → emit state changes
    this.stateMachine.onTransition((newState) => {
      this.emit('stateChanged', newState)
    })
  }

  /**
   * Initialize the voice pipeline. Graceful degradation (CK-VOICE-010):
   * - Missing Whisper model → STT unavailable, TTS still works
   * - Missing Piper → falls back to macOS say
   * - Missing both → voice unavailable
   */
  async init(): Promise<{ stt: boolean; tts: boolean }> {
    if (this.initialized) return { stt: this.sttAvailable, tts: this.ttsAvailable }

    const whisperModelDir = this.config.whisperModelDir ?? path.join(
      process.env.HOME ?? '',
      'Library', 'Application Support', 'cipher-keel-electron', 'models', 'whisper'
    )

    // Init STT (Whisper) — graceful degradation
    try {
      const sttConfig: STTRouterConfig = {
        local: { modelDir: whisperModelDir },
        onStatusChange: (msg, level) => this.emit('status', { msg, level }),
      }
      this.sttRouter = new STTRouter(sttConfig)
      await this.sttRouter.init()
      this.sttAvailable = true
      console.log('[VoiceManager] STT initialized (local Whisper)')
    } catch (err) {
      console.warn('[VoiceManager] STT init failed (graceful degradation):', (err as Error).message)
      this.sttAvailable = false
    }

    // Init TTS (Piper → macOS say fallback) — graceful degradation
    try {
      const piper = new PiperTTS({
        voice: this.config.piperVoice,
        modelsDir: this.config.piperModelsDir,
      })
      await piper.init()
      this.tts = piper
      this.ttsAvailable = true
      console.log('[VoiceManager] TTS initialized (Piper)')
    } catch (err) {
      console.warn('[VoiceManager] Piper TTS init failed, trying macOS say:', (err as Error).message)
      try {
        const macos = new MacOSTTS()
        await macos.init()
        this.tts = macos
        this.ttsAvailable = true
        console.log('[VoiceManager] TTS initialized (macOS say fallback)')
      } catch (ttsErr) {
        console.warn('[VoiceManager] TTS unavailable:', (ttsErr as Error).message)
        this.ttsAvailable = false
      }
    }

    this.initialized = true

    if (this.sttAvailable) {
      this.stateMachine.transition(VoiceState.READY)
    }

    return { stt: this.sttAvailable, tts: this.ttsAvailable }
  }

  /** Check if voice pipeline is available (at least STT works) */
  isAvailable(): boolean {
    return this.sttAvailable
  }

  /** Get the current voice dot state for UI display (CK-VOICE-008) */
  getVoiceDotState(): VoiceDotState {
    if (!this.initialized) return 'off'
    if (!this.sttAvailable) return 'unavailable'
    const state = this.stateMachine.state
    if (state === VoiceState.IDLE) return 'off'
    if (state === VoiceState.RECORDING || state === VoiceState.USER_SPEAKING) return 'listening'
    if (state === VoiceState.PROCESSING) return 'processing'
    return 'listening'
  }

  /** Start a voice session (STT mode) */
  async startSession(): Promise<{ ok: boolean; error?: string }> {
    if (!this.initialized) {
      await this.init()
    }
    if (!this.sttAvailable) {
      return { ok: false, error: 'STT not available — Whisper model missing' }
    }

    this.inputRouter.setMode('session')
    this.stateMachine.transition(VoiceState.READY)
    return { ok: true }
  }

  /** Stop the voice session */
  stopSession(): void {
    this.inputRouter.setMode('off')
    this.stateMachine.reset()
    this.stopTTS()
  }

  /** Process VAD speech start event from renderer */
  onVadSpeechStart(): void {
    this.stateMachine.transition(VoiceState.RECORDING)
  }

  /** Process VAD speech end event from renderer — transcribe audio */
  async onVadSpeechEnd(audioSamples: number[]): Promise<void> {
    if (!this.sttRouter?.isReady()) return

    this.stateMachine.transition(VoiceState.PROCESSING)

    try {
      // Convert Float32 samples to 16-bit PCM buffer
      const float32 = new Float32Array(audioSamples)
      const pcm = Buffer.alloc(float32.length * 2)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        pcm.writeInt16LE(s >= 0 ? Math.round(s * 32767) : Math.round(s * 32768), i * 2)
      }

      const text = await this.sttRouter.transcribeBatch(pcm)

      if (text) {
        this.emit('transcription', text)
        await this.inputRouter.routeTranscription(text)
      }

      this.stateMachine.transition(VoiceState.READY)
    } catch (err) {
      console.error('[VoiceManager] Transcription error:', (err as Error).message)
      this.stateMachine.transition(VoiceState.ERROR)
      this.emit('error', { code: 'stt-error', message: (err as Error).message })
      // Auto-recover
      this.stateMachine.transition(VoiceState.READY)
    }
  }

  /** Speak text via TTS (CK-VOICE-003) */
  async speak(text: string): Promise<void> {
    if (!this.tts?.isReady()) return

    try {
      this.stateMachine.transition(VoiceState.AGENT_SPEAKING)
      for await (const wav of this.tts.speak(text)) {
        this.emit('audioPlayback', wav.toString('base64'))
      }
    } catch (err) {
      console.error('[VoiceManager] TTS error:', (err as Error).message)
    } finally {
      this.stateMachine.transition(VoiceState.READY)
    }
  }

  /** Stop TTS playback */
  stopTTS(): void {
    this.tts?.stop()
  }

  /** Set focused session for routing */
  setFocusedSession(sessionId: string | null): void {
    this.inputRouter.setFocusedSession(sessionId)
  }

  /** Toggle pin for a session */
  togglePin(sessionId: string): void {
    this.inputRouter.togglePin(sessionId)
  }

  /** Get routing state */
  getRoutingState(): {
    mode: string
    activeSessionId: string | null
    pinned: boolean
    pinnedSessionId: string | null
  } {
    return {
      mode: this.inputRouter.getMode(),
      activeSessionId: this.inputRouter.getActiveSessionId(),
      pinned: this.inputRouter.isPinned(),
      pinnedSessionId: this.inputRouter.getPinnedSessionId(),
    }
  }

  /** Shut down everything */
  shutdown(): void {
    this.stopSession()
    this.sttRouter?.shutdown()
    this.tts?.shutdown()
    this.removeAllListeners()
  }
}
