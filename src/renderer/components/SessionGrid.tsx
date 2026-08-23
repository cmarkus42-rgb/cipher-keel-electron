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
import { HarnessCell } from './HarnessCell'
import type { HarnessEreignis } from '../../shared/harness-types'

interface SessionSlot {
  type: 'session' | 'launcher' | 'harness'
  sessionId?: string
  sessionName?: string
  status?: 'active' | 'closing' | 'stopped'
  contextUsage?: number
  /**
   * Nur fuer type 'harness'. Gefuehrt vom Hauptprozess ueber SESSION_STATUS_CHANGED, nie hier
   * abgeleitet — siehe den Modulkopf von HarnessCell.tsx.
   */
  zustand?: 'leerlaufend' | 'laeuft'
  laufId?: string | null
  letzterEndzustand?: string | null
  /** SchleifenZelle.eintragId, festgehalten bei Anlage der Zelle (siehe HarnessCell.tsx). */
  eintragId?: string
}

interface SessionGridProps {
  cols: number
  rows: number
  slots: SessionSlot[]
  voiceDot?: VoiceDotState
  /** Resolves to an error message on failure, or null on success (F-6). */
  onStartSession: (slotIndex: number, entityId: string) => Promise<string | null>
  onCloseSession: (sessionId: string) => void
  /** Alle Harness-Ereignisse aller Zellen — jede HarnessCell filtert selbst auf ihre laufId. */
  harnessEreignisse: HarnessEreignis[]
  onAuftrag: (sessionName: string, auftragstext: string) => Promise<string | null>
  onAbbrechen: (laufId: string) => Promise<string | null>
}

export function SessionGrid({
  cols, rows, slots, voiceDot, onStartSession, onCloseSession, harnessEreignisse, onAuftrag, onAbbrechen,
}: SessionGridProps) {
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
        ) : slot.type === 'harness' && slot.sessionName ? (
          <HarnessCell
            key={slot.sessionName}
            sessionName={slot.sessionName}
            eintragId={slot.eintragId ?? ''}
            zustand={slot.zustand ?? 'leerlaufend'}
            laufId={slot.laufId ?? null}
            letzterEndzustand={slot.letzterEndzustand ?? null}
            ereignisse={harnessEreignisse}
            onAuftrag={(auftragstext) => onAuftrag(slot.sessionName!, auftragstext)}
            onAbbrechen={() => {
              // zellenansicht() macht den Abbrechen-Knopf nur klickbar, solange zustand ===
              // 'laeuft' — und die Zelle setzt laufId in genau demselben SESSION_STATUS_CHANGED,
              // das zustand auf 'laeuft' setzt (siehe SESSION_AUFTRAG in ipc-handlers.ts). Ein
              // fehlendes laufId hier waere also ein Bug in dieser Verdrahtung, kein normaler
              // Fall — sichtbar gemacht statt stillschweigend nichts zu tun.
              if (!slot.laufId) {
                return Promise.resolve(
                  `Interner Fehler: Zelle '${slot.sessionName}' hat keine laufende laufId.`
                )
              }
              return onAbbrechen(slot.laufId)
            }}
            onClose={() => onCloseSession(slot.sessionId ?? slot.sessionName!)}
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
