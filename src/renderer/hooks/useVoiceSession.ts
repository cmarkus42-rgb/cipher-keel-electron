/**
 * useVoiceSession — React hook for voice mode: OFF / STT.
 *
 * OFF: No voice active.
 * STT: VAD + Whisper → keystrokes to focused session.
 *
 * Ported from cipher-mux 0.9.x (CK-VOICE-001..008).
 * Adapted from Preact to React 19.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { MicVADInstance } from '../voice/vad-loader'
import { BargeInMonitor } from '../voice/barge-in-monitor'

export type VoiceMode = 'off' | 'stt'

const PTT_COMBO = { ctrlKey: true, shiftKey: true, code: 'Space' }

interface Toast {
  text: string
  type: 'transcription' | 'dispatched' | 'error'
}

const api = () => (window as any).cipherKeel

export function useVoiceSession(focusedSessionId: string | null) {
  const [mode, setMode] = useState<VoiceMode>('off')
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pinned, setPinned] = useState(false)
  const [pinnedSessionId, setPinnedSessionId] = useState<string | null>(null)
  const [activeVoiceSessionId, setActiveVoiceSessionId] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadRef = useRef<MicVADInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const bargeInMonitorRef = useRef<BargeInMonitor | null>(null)

  const active = mode !== 'off'

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  // Push focused session to main process
  useEffect(() => {
    api().voice.setSessionTarget(focusedSessionId)
  }, [focusedSessionId])

  const teardownVAD = useCallback(() => {
    if (bargeInMonitorRef.current) {
      bargeInMonitorRef.current.detach()
      bargeInMonitorRef.current = null
    }
    if (vadRef.current) {
      vadRef.current.destroy()
      vadRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const initVAD = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
    })
    streamRef.current = stream

    const audioCtx = new AudioContext({ sampleRate: 16000 })
    audioCtxRef.current = audioCtx

    const { initVAD: loadVAD } = await import('../voice/vad-loader')
    vadRef.current = await loadVAD(stream, audioCtx, {
      onSpeechStart: () => {
        api().voice.vadSpeechStart()
      },
      onSpeechEnd: (audio: Float32Array) => {
        api().voice.vadSpeechEnd(Array.from(audio))
      },
      onVADMisfire: () => {
        api().voice.vadMisfire()
      },
    }, {
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.25,
      minSpeechFrames: 3,
      preSpeechPadFrames: 5,
    })
    vadRef.current.start()

    const monitor = new BargeInMonitor({
      thresholdDb: -30,
      minDurationMs: 50,
      onBargeIn: () => {
        api().voice.bargeIn()
      },
    })
    monitor.attach(stream, audioCtx)
    bargeInMonitorRef.current = monitor
  }, [])

  const switchMode = useCallback(async (newMode: VoiceMode) => {
    if (newMode === mode) return

    // Deactivate current mode
    if (mode === 'stt') {
      api().voice.setRoutingMode('off')
      teardownVAD()
      setRecording(false)
      setProcessing(false)
      setVoiceState('idle')
      setPinned(false)
      setPinnedSessionId(null)
    }

    if (newMode === 'off') {
      setMode('off')
      setError(null)
      return
    }

    // Activate STT
    try {
      const availResult = await api().voice.available()
      if (!availResult.available) {
        setError(`Voice not available — ${availResult.reason ?? 'native modules missing'}`)
        setMode('off')
        return
      }

      const result = await api().voice.startSession()
      if (!result.ok) {
        setError(result.error ?? 'Failed to start STT mode')
        setMode('off')
        return
      }
      await initVAD()
      api().voice.setSessionTarget(focusedSessionId)
      api().voice.setRoutingMode('session')
      setMode('stt')
      setVoiceState('ready')
      setError(null)
    } catch (err) {
      console.error('[VoiceSession] Activation error:', err)
      setError((err as Error).message)
      setMode('off')
    }
  }, [mode, focusedSessionId, teardownVAD, initVAD])

  const toggle = useCallback(async () => {
    await switchMode(mode === 'off' ? 'stt' : 'off')
  }, [mode, switchMode])

  // Listen for voice events from main
  useEffect(() => {
    if (!active) return

    const unsubs: (() => void)[] = []

    unsubs.push(api().voice.onState((state: string) => {
      setVoiceState(state)
      setRecording(state === 'recording')
      setProcessing(state === 'processing')
      if (bargeInMonitorRef.current) {
        bargeInMonitorRef.current.setEnabled(state === 'agent_speaking')
      }
    }))

    unsubs.push(api().voice.onTranscription((text: string) => {
      showToast({ text, type: 'transcription' })
    }))

    unsubs.push(api().voice.onDispatched((data: { sessionId: string; text: string }) => {
      showToast({ text: `Sent: ${data.text}`, type: 'dispatched' })
    }))

    unsubs.push(api().voice.onError((msg: string) => {
      showToast({ text: msg, type: 'error' })
    }))

    unsubs.push(api().voice.onPinStatus((data: { pinned: boolean; sessionId: string | null }) => {
      setPinned(data.pinned)
      setPinnedSessionId(data.sessionId)
    }))

    unsubs.push(api().voice.onActiveSession((data: { sessionId: string | null }) => {
      setActiveVoiceSessionId(data.sessionId)
    }))

    return () => unsubs.forEach(fn => fn())
  }, [active, showToast])

  // PTT hotkey handler (Ctrl+Shift+Space)
  useEffect(() => {
    if (!active) return

    let pttDown = false

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey === PTT_COMBO.ctrlKey && e.shiftKey === PTT_COMBO.shiftKey && e.code === PTT_COMBO.code) {
        e.preventDefault()
        if (!pttDown) {
          pttDown = true
          api().voice.vadSpeechStart()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === PTT_COMBO.code && pttDown) {
        pttDown = false
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [active])

  const togglePin = useCallback((sessionId: string) => {
    api().voice.pinSession(sessionId)
  }, [])

  return {
    mode,
    active,
    recording,
    processing,
    voiceState,
    toast,
    error,
    toggle,
    switchMode,
    pinned,
    pinnedSessionId,
    activeVoiceSessionId,
    togglePin,
  }
}
