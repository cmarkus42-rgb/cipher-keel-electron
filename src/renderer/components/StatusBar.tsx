/**
 * StatusBar.tsx — Untere Leiste mit Basis-System-Zustand.
 *
 * CK-INF-019: Aktives Projekt, Anzahl aktiver Sessions.
 * Erweiterbar fuer NanoClaw-Status und Cost (Phase 5).
 */

import { SUBSYSTEM_IDS, type ServiceStatusMap, type SubsystemStatus } from '../../shared/service-status'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  connected:    '#22c55e',
  disconnected: '#ef4444',
  connecting:   '#eab308',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusBarProps {
  activeProject?: string
  sessionCount: number
  /** NanoClaw-Verbindungsstatus (Schenkel 2, Phase 5) */
  nanoClawStatus?: 'connected' | 'disconnected' | 'connecting'
  /** Subsystem-Status (CK-NFR-010). null = noch nicht geladen. */
  serviceStatus?: ServiceStatusMap | null
}

export interface DegradationSummary {
  healthy: boolean
  degraded: SubsystemStatus[]
  label: string
}

// ---------------------------------------------------------------------------
// summarizeDegradation
// ---------------------------------------------------------------------------

/**
 * Reduces the subsystem status map to a single StatusBar line.
 * 'disabled' is a deliberate config choice, not a fault — it never counts as degraded.
 */
export function summarizeDegradation(status: ServiceStatusMap | null): DegradationSummary {
  if (!status) {
    return { healthy: false, degraded: [], label: 'Subsystem-Status unbekannt' }
  }

  const degraded = SUBSYSTEM_IDS
    .map(id => status[id])
    .filter((s): s is SubsystemStatus => s?.state === 'degraded')

  if (degraded.length === 0) {
    return { healthy: true, degraded: [], label: 'alle Subsysteme bereit' }
  }

  const noun = degraded.length === 1 ? 'Subsystem' : 'Subsysteme'
  return {
    healthy: false,
    degraded,
    label: `${degraded.length} ${noun} degradiert: ${degraded.map(s => s.id).join(', ')}`,
  }
}

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

export function StatusBar({ activeProject, sessionCount, nanoClawStatus, serviceStatus }: StatusBarProps) {
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

      {(() => {
        const summary = summarizeDegradation(serviceStatus ?? null)
        if (summary.healthy) return null
        return (
          <span
            title={summary.degraded.map(s => `${s.id}: ${s.reason ?? 'unbekannt'}`).join('\n')}
            style={{ color: '#eab308', cursor: 'help' }}
          >
            ⚠ {summary.label}
          </span>
        )
      })()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NanoClawIndicator (erweiterbar fuer Phase 5)
// ---------------------------------------------------------------------------

function NanoClawIndicator({ status }: { status: NonNullable<StatusBarProps['nanoClawStatus']> }) {
  const colors = STATUS_COLORS
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
