/**
 * StatusBar.tsx — Untere Leiste mit Basis-System-Zustand.
 *
 * CK-INF-019: Aktives Projekt, Anzahl aktiver Sessions.
 */

import { SUBSYSTEM_IDS, type ServiceStatusMap, type SubsystemStatus } from '../../shared/service-status'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusBarProps {
  activeProject?: string
  sessionCount: number
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

export function StatusBar({ activeProject, sessionCount, serviceStatus }: StatusBarProps) {
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
