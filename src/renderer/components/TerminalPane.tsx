/**
 * TerminalPane — xterm.js terminal embedded in a flex container.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-005, CK-INF-006).
 */

import { useTerminal } from '../hooks/useTerminal'

interface TerminalPaneProps {
  sessionId: string
  sessionName?: string
  contextUsage?: number
}

export function TerminalPane({ sessionId, sessionName, contextUsage }: TerminalPaneProps) {
  const { terminalRef } = useTerminal(sessionId)

  const ctxLabel = contextUsage != null ? `${Math.round(contextUsage)}%` : ''
  const ctxColor = contextUsage != null
    ? contextUsage >= 80 ? '#e06c75'
    : contextUsage >= 60 ? '#e5c07b'
    : '#98c379'
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 8px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        fontSize: '12px',
        color: '#999',
        flexShrink: 0,
      }}>
        <span>{sessionName ?? sessionId}</span>
        {ctxLabel && <span style={{ color: ctxColor, fontWeight: 600 }}>CTX {ctxLabel}</span>}
      </div>
      <div
        ref={terminalRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      />
    </div>
  )
}
