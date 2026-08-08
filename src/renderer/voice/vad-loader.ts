/**
 * vad-loader.ts — Initialize Silero VAD in Electron renderer.
 *
 * Loads MicVAD with local ONNX/WASM assets (no CDN).
 * Audio is processed EXCLUSIVELY locally (CK-NFR-006, CK-VOICE-001).
 *
 * Ported from cipher-mux 0.9.x.
 */

// Shape of the `vad-web` UMD bundle loaded via <script> in index.html
// (CK-NFR-006: local ONNX/WASM assets, no npm package — no upstream types).
interface MicVADFactory {
  new: (config: {
    getStream: () => Promise<MediaStream>
    pauseStream: () => Promise<void>
    resumeStream: () => Promise<MediaStream>
    audioContext: AudioContext
    baseAssetPath: string
    onnxWASMBasePath: string
    model: string
    startOnLoad: boolean
    positiveSpeechThreshold?: number
    negativeSpeechThreshold?: number
    redemptionFrames?: number
    minSpeechFrames?: number
    preSpeechPadFrames?: number
    onSpeechStart: () => void
    onSpeechEnd: (audio: Float32Array) => void
    onVADMisfire?: () => void
  }) => Promise<MicVADInstance>
}

declare global {
  interface Window {
    vad?: { MicVAD: MicVADFactory }
    ort?: { env: { wasm: { numThreads: number } } }
  }
}

const VAD_ASSETS_PATH = new URL('./vad-assets/', window.location.href).href

export interface VADCallbacks {
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
  onVADMisfire?: () => void
}

export interface VADConfig {
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  redemptionFrames?: number
  minSpeechFrames?: number
  preSpeechPadFrames?: number
}

export interface MicVADInstance {
  start: () => void
  pause: () => void
  destroy: () => void
}

export async function initVAD(
  stream: MediaStream,
  audioCtx: AudioContext,
  callbacks: VADCallbacks,
  vadConfig: VADConfig = {},
): Promise<MicVADInstance> {
  if (!window.vad?.MicVAD) {
    throw new Error('VAD not loaded — ensure ort.wasm.min.js and vad-web.bundle.min.js are included in index.html')
  }

  const config = {
    positiveSpeechThreshold: vadConfig.positiveSpeechThreshold ?? 0.7,
    negativeSpeechThreshold: vadConfig.negativeSpeechThreshold ?? 0.3,
    redemptionFrames: vadConfig.redemptionFrames ?? 8,
    minSpeechFrames: vadConfig.minSpeechFrames ?? 5,
    preSpeechPadFrames: vadConfig.preSpeechPadFrames ?? 3,
  }

  console.log('[VAD] Initializing Silero VAD')

  if (window.ort?.env?.wasm) {
    window.ort.env.wasm.numThreads = 1
  }

  const micVAD = await window.vad.MicVAD.new({
    getStream: () => Promise.resolve(stream),
    pauseStream: () => Promise.resolve(),
    resumeStream: () => Promise.resolve(stream),
    audioContext: audioCtx,
    baseAssetPath: VAD_ASSETS_PATH,
    onnxWASMBasePath: VAD_ASSETS_PATH,
    model: 'legacy',
    startOnLoad: false,
    ...config,

    onSpeechStart: () => callbacks.onSpeechStart(),
    onSpeechEnd: (audio: Float32Array) => callbacks.onSpeechEnd(audio),
    onVADMisfire: () => callbacks.onVADMisfire?.(),
  })

  console.log('[VAD] Silero VAD initialized')
  return micVAD
}
