/**
 * SessionGrid — layout container for session cells.
 *
 * Renders a CSS Grid of SessionCell and LauncherCell components.
 * Grid dimensions are configurable (cols x rows).
 *
 * Ported from cipher-mux 0.9.x (CK-INF-005).
 */

import { useCallback } from 'react'
import { SessionCell, type VoiceDotState } from './SessionCell'
import { LauncherCell } from './LauncherCell'

interface SessionSlot {
  type: 'session' | 'launcher'
  sessionId?: string
  sessionName?: string
  status?: 'active' | 'closing' | 'stopped'
  contextUsage?: number
}

interface SessionGridProps {
  cols: number
  rows: number
  slots: SessionSlot[]
  voiceDot?: VoiceDotState
  onStartSession: (slotIndex: number, entityId: string) => void
  onCloseSession: (sessionId: string) => void
}

export function SessionGrid({ cols, rows, slots, voiceDot, onStartSession, onCloseSession }: SessionGridProps) {
  const handleClose = useCallback((sessionId: string) => {
    onCloseSession(sessionId)
  }, [onCloseSession])

  const totalSlots = cols * rows
  // Fill remaining slots with launchers
  const filledSlots: SessionSlot[] = []
  for (let i = 0; i < totalSlots; i++) {
    filledSlots.push(slots[i] ?? { type: 'launcher' })
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: '4px',
      padding: '4px',
      height: '100%',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {filledSlots.map((slot, i) => (
        slot.type === 'session' && slot.sessionId ? (
          <SessionCell
            key={slot.sessionId}
            sessionId={slot.sessionId}
            sessionName={slot.sessionName ?? slot.sessionId}
            status={slot.status ?? 'active'}
            contextUsage={slot.contextUsage}
            voiceDot={voiceDot}
            onClose={handleClose}
          />
        ) : (
          <LauncherCell
            key={`launcher-${i}`}
            slotIndex={i}
            onStart={onStartSession}
          />
        )
      ))}
    </div>
  )
}
