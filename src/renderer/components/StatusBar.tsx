/**
 * StatusBar.tsx — Untere Leiste mit Basis-System-Zustand.
 *
 * CK-INF-019: Aktives Projekt, Anzahl aktiver Sessions.
 * Erweiterbar fuer NanoClaw-Status und Cost (Phase 5).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusBarProps {
  activeProject?: string
  sessionCount: number
  /** NanoClaw-Verbindungsstatus (Schenkel 2, Phase 5) */
  nanoClawStatus?: 'connected' | 'disconnected' | 'connecting'
}

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

export function StatusBar({ activeProject, sessionCount, nanoClawStatus }: StatusBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '2px 12px',
      background: '#1a1a1a',
      borderTop: '1px solid #333',
      fontSize: '11px',
      color: '#888',
      flexShrink: 0,
      height: '22px',
    }}>
      {activeProject ? (
        <span title="Aktives Projekt">
          {activeProject}
        </span>
      ) : (
        <span style={{ color: '#555' }}>Kein Projekt</span>
      )}

      <span style={{ color: '#555' }}>|</span>

      <span title="Aktive Sessions">
        {sessionCount} {sessionCount === 1 ? 'Session' : 'Sessions'}
      </span>

      {nanoClawStatus && (
        <>
          <span style={{ color: '#555' }}>|</span>
          <NanoClawIndicator status={nanoClawStatus} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NanoClawIndicator (erweiterbar fuer Phase 5)
// ---------------------------------------------------------------------------

function NanoClawIndicator({ status }: { status: NonNullable<StatusBarProps['nanoClawStatus']> }) {
  const colors = {
    connected:    '#98c379',
    disconnected: '#e06c75',
    connecting:   '#e5c07b',
  }
  const labels = {
    connected:    'NC verbunden',
    disconnected: 'NC getrennt',
    connecting:   'NC verbindet…',
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: colors[status],
      }} />
      <span>{labels[status]}</span>
    </span>
  )
}
