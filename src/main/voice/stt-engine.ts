/**
 * STT Engine — Whisper.cpp wrapper with hallucination/noise filtering.
 *
 * Uses @fugood/whisper.node for local speech-to-text (CK-VOICE-002).
 * Audio is processed EXCLUSIVELY locally (CK-NFR-006).
 *
 * Ported from cipher-mux 0.9.x.
 */

import { EventEmitter } from 'node:events'
import path from 'node:path'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Hallucination & Noise Filters (pure functions)
// ---------------------------------------------------------------------------

const HALLUCINATION_RE =
  /^\s*(\[.*?\]|\(.*?\)|♪.*?♪|Musik|Gesang|Music|Singing|Untertitel|Subtitles|Vielen Dank|Thank you|Thanks for watching|\.{2,}|MoU|SWR|ZDF|ARD|Verwendet\.?)\s*$/i

const REPEATED_HALLUCINATION_RE = /^[\s,.\-;]*(\w+)[\s,.\-;]+(\1[\s,.\-;]*){2,}$/i

export const HALLUCINATION_BLOCKLIST: string[] = [
  'verwendet.',
  'verwendet,',
  'verwendet',
  'untertitel von',
  'danke fürs zuschauen',
  'danke fuers zuschauen',
  'vielen dank.',
  'vielen dank',
  'swr 2021',
  'swr 2022',
]

const HALLUCINATION_STRIP_RE = /\[.*?\]|\(.*?\)|♪.*?♪/g
const NOISE_RE = /^[.,!?\-\u2013\u2014\u2026\s]+$/

export const CODING_BIAS_PROMPT =
  'programming: function, variable, class, return, async, await, ' +
  'TypeScript, React, import, export, const, let, interface, component. ' +
  'voice commands: grid, scroll, hoch, runter, links, rechts, abschicken, senden, marker, ' +
  'löschen, leeren, kopieren, einfügen, copy, paste'

export function filterHallucinations(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''

  if (HALLUCINATION_RE.test(trimmed)) return ''
  if (REPEATED_HALLUCINATION_RE.test(trimmed)) return ''

  const lower = trimmed.toLowerCase()
  if (HALLUCINATION_BLOCKLIST.some(h => lower === h)) return ''

  const cleaned = trimmed.replace(HALLUCINATION_STRIP_RE, '').trim()
  return cleaned
}

export function isNoiseOnly(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return true
  return NOISE_RE.test(trimmed)
}

// ---------------------------------------------------------------------------
// STTEngine class
// ---------------------------------------------------------------------------

export interface STTEngineOptions {
  modelDir: string
  model?: string      // default: 'ggml-small.bin'
  language?: string   // default: '' (auto-detect)
}

export class STTEngine extends EventEmitter {
  private readonly modelDir: string
  private readonly modelName: string
  private readonly language: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private context: any = null
  private ready = false

  constructor(opts: STTEngineOptions) {
    super()
    this.modelDir = opts.modelDir
    this.modelName = opts.model ?? 'ggml-small.bin'
    const lang = opts.language ?? ''
    this.language = lang === 'auto' ? '' : (lang || 'de')
  }

  get modelPath(): string {
    return path.join(this.modelDir, this.modelName)
  }

  async init(): Promise<void> {
    if (this.ready) return

    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`Whisper model not found: ${this.modelPath}`)
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initWhisper } = require('@fugood/whisper.node')
      this.context = await initWhisper({
        filePath: this.modelPath,
        useGpu: true,
      })
      console.log('[STT] whisper.node context initialized (GPU enabled)')
    } catch (err) {
      throw new Error(
        `Failed to init whisper.node: ${(err as Error).message}`
      )
    }

    this.ready = true
    this.emit('ready')
  }

  async transcribe(pcmBuffer: Buffer, prompt?: string): Promise<string> {
    if (!this.ready || !this.context) {
      throw new Error('STTEngine not initialized — call init() first')
    }

    const arrayBuffer = pcmBuffer.buffer.slice(
      pcmBuffer.byteOffset,
      pcmBuffer.byteOffset + pcmBuffer.byteLength
    )

    const { promise } = this.context.transcribeData(arrayBuffer, {
      language: this.language,
      maxLen: 1,
      tokenTimestamps: false,
      ...(prompt ? { prompt } : {}),
    })
    const { result } = await promise

    const raw: string = (result || '').trim()
    const filtered = filterHallucinations(raw)
    if (filtered === '' || isNoiseOnly(filtered)) return ''

    return filtered
  }

  isReady(): boolean {
    return this.ready
  }

  shutdown(): void {
    this.ready = false
    this.context = null
    this.emit('shutdown')
    this.removeAllListeners()
  }
}
