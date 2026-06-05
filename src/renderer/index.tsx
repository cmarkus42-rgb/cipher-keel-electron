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

import { StrictMode, useState, useCallback, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionGrid } from './components/SessionGrid'

interface SessionSlot {
  type: 'session' | 'launcher'
  sessionId?: string
  sessionName?: string
  status?: 'active' | 'closing' | 'stopped'
  contextUsage?: number
}

const api = () => (window as any).cipherKeel

function App() {
  const [slots, setSlots] = useState<SessionSlot[]>([])
  const [grid] = useState({ cols: 2, rows: 2 })

  const handleStartSession = useCallback(async (_slotIndex: number) => {
    const name = `session-${Date.now()}`
    const result = await api().invoke('session:create', { name })
    if (result?.id) {
      setSlots((prev) => [
        ...prev,
        { type: 'session', sessionId: name, sessionName: name, status: 'active' }
      ])
    } else {
      console.error('[renderer] session create failed:', result?.error)
    }
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

  return (
    <SessionGrid
      cols={grid.cols}
      rows={grid.rows}
      slots={slots}
      onStartSession={handleStartSession}
      onCloseSession={handleCloseSession}
    />
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
