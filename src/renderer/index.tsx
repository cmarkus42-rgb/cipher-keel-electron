/**
 * cipher-keel-electron — Renderer process entry point.
 *
 * Bootstraps React and renders the SessionGrid.
 * Access to Electron main process goes exclusively through window.cipherKeel
 * (exposed via src/preload.ts via contextBridge).
 *
 * No direct access to Node.js APIs — renderer runs with:
 *   contextIsolation: true, nodeIntegration: false, sandbox: true
 */

import { StrictMode, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionGrid } from './components/SessionGrid'
import { Sidebar, SidebarSession } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { useVoiceSession } from './hooks/useVoiceSession'
import { shouldApplyStatusResult } from './service-status-fetch'
import { errorMessage, type ServiceStatusMap } from '../shared/service-status'
import { defaultPresetId } from '../shared/preset-catalog'

interface SessionSlot {
  type: 'session' | 'launcher'
  sessionId?: string
  sessionName?: string
  status?: 'active' | 'closing' | 'stopped'
  contextUsage?: number
}

// IPC channel constants (inlined to avoid circular imports in renderer)
const SERVICES_STATUS = 'services:status'
const SERVICES_STATUS_CHANGED = 'services:status-changed'
const APP_READY = 'app:ready'

const api = () => (window as any).cipherKeel

function App() {
  const [slots, setSlots] = useState<SessionSlot[]>([])
  const [grid] = useState({ cols: 2, rows: 2 })
  // CK-NFR-010: subsystem degradation status for the StatusBar
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusMap | null>(null)
  // Derive focused session ID from first active session slot
  const focusedSessionId = useMemo(() => {
    const active = slots.find(s => s.type === 'session' && s.status === 'active')
    return active?.sessionId ?? null
  }, [slots])
  // CK-VOICE-009/010: Voice session with graceful degradation
  const voice = useVoiceSession(focusedSessionId)

  // F-6: returns an error message string on failure (null on success) instead of
  // only console.error-ing it, so LauncherCell can show the user what happened
  // rather than reverting silently from "..." back to "+".
  const handleStartSession = useCallback(async (_slotIndex: number, entityId = defaultPresetId()): Promise<string | null> => {
    const result = await api().invoke('session:create', { entityId }) as {
      id: string | null
      name: string | null
      error: string | null
    }
    if (result?.id && result.name) {
      setSlots((prev) => [
        ...prev,
        { type: 'session', sessionId: result.name!, sessionName: result.name!, status: 'active' }
      ])
      return null
    }
    const message = errorMessage(result?.error ?? 'Session konnte nicht gestartet werden')
    console.error('[renderer] session create failed:', result?.error)
    return message
  }, [])

  const handleCloseSession = useCallback(async (sessionId: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, status: 'closing' as const } : s))
    )
    const result = await api().invoke('session:destroy', sessionId)
    if (result?.ok) {
      setSlots((prev) => prev.filter((s) => s.sessionId !== sessionId))
    } else {
      console.error('[renderer] session destroy failed:', result?.error)
      setSlots((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, status: 'active' as const } : s))
      )
    }
  }, [])

  // Listen for context usage updates from StatusLineMonitor
  useEffect(() => {
    const unsub = api().on('statusline:ctx-update', (_event: unknown, sessionId: string, usage: { percentage: number }) => {
      setSlots((prev) =>
        prev.map((s) =>
          s.sessionId === sessionId ? { ...s, contextUsage: usage.percentage } : s
        )
      )
    })
    return unsub
  }, [])

  // CK-NFR-010: fetch subsystem status once, then re-fetch once main-process
  // init finishes and whenever the status changes. The first fetch on mount
  // can legitimately land before service-lifecycle's setImmediate-deferred
  // init runs, so app:ready is the signal that the snapshot is trustworthy.
  //
  // getServiceStatus() is a synchronous read today, so responses happen to
  // resolve in dispatch order — but nothing guarantees that once it becomes
  // a real async probe. requestSeqRef/appliedSeqRef + shouldApplyStatusResult
  // enforce "only the newest response wins" explicitly rather than relying
  // on that timing accident.
  const requestSeqRef = useRef(0)
  const appliedSeqRef = useRef(0)

  const fetchServiceStatus = useCallback(async () => {
    if (!api()) return
    const mySeq = ++requestSeqRef.current
    try {
      const result = await api().invoke(SERVICES_STATUS) as ServiceStatusMap | undefined
      if (shouldApplyStatusResult(appliedSeqRef.current, mySeq)) {
        appliedSeqRef.current = mySeq
        setServiceStatus(result ?? null)
      }
    } catch (err) {
      // Fail safe: keep the last known serviceStatus rather than clobbering it.
      console.error('[renderer] services:status fetch failed:', err)
    }
  }, [])

  useEffect(() => {
    fetchServiceStatus()
  }, [fetchServiceStatus])

  useEffect(() => {
    if (!api()) return
    const unsubReady = api().on(APP_READY, () => { fetchServiceStatus() })
    const unsubChanged = api().on(SERVICES_STATUS_CHANGED, () => { fetchServiceStatus() })
    return () => {
      unsubReady()
      unsubChanged()
    }
  }, [fetchServiceStatus])

  const sidebarSessions = useMemo<SidebarSession[]>(() =>
    slots
      .filter(s => s.type === 'session')
      .map(s => ({
        sessionId: s.sessionId!,
        sessionName: s.sessionName!,
        status: s.status!,
      })),
    [slots]
  )

  const sessionCount = sidebarSessions.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          sessions={sidebarSessions}
          activeSessionId={focusedSessionId ?? undefined}
        />
        <SessionGrid
          cols={grid.cols}
          rows={grid.rows}
          slots={slots}
          voiceDot={voice.voiceDotState}
          onStartSession={handleStartSession}
          onCloseSession={handleCloseSession}
        />
      </div>
      <StatusBar sessionCount={sessionCount} activeProject="" serviceStatus={serviceStatus} />
    </div>
  )
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
