/**
 * SessionCell — single session tile in the grid.
 *
 * Renders a TerminalPane with a header bar showing session status.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-005).
 */

import { useCallback } from 'react'
import { TerminalPane } from './TerminalPane'

interface SessionCellProps {
  sessionId: string
  sessionName: string
  status: 'active' | 'closing' | 'stopped'
  contextUsage?: number
  onClose?: (sessionId: string) => void
}

export function SessionCell({ sessionId, sessionName, status, contextUsage, onClose }: SessionCellProps) {
  const handleClose = useCallback(() => {
    onClose?.(sessionId)
  }, [sessionId, onClose])

  const statusColor = status === 'active' ? '#98c379'
    : status === 'closing' ? '#e5c07b'
    : '#e06c75'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      border: '1px solid #333',
      borderRadius: '4px',
      overflow: 'hidden',
      background: '#0d0d0d',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        fontSize: '12px',
        color: '#ccc',
        flexShrink: 0,
      }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
        }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sessionName}
        </span>
        <button
          onClick={handleClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '14px',
            lineHeight: 1,
          }}
          title="Close session"
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {status === 'closing' ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
          }}>
            Session wird beendet...
          </div>
        ) : (
          <TerminalPane
            sessionId={sessionId}
            sessionName={sessionName}
            contextUsage={contextUsage}
          />
        )}
      </div>
    </div>
  )
}
