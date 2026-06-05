/**
 * GateIndicator — visual gate status at a phase boundary.
 *
 * CK-UI-007: Three states — gruen (erfuellt), gelb (Befund offen), rot (Luecken).
 * Updates on graph changes (parent re-renders on data refresh).
 */

import { getGateColor } from '../timeline-utils'
import type { GateData } from '../timeline-utils'

interface GateIndicatorProps {
  gate: GateData
}

const GATE_LABELS: Record<string, string> = {
  gruen: 'Gate erfuellt',
  gelb: 'Befund offen',
  rot: 'Strukturelle Luecken',
}

export function GateIndicator({ gate }: GateIndicatorProps) {
  const color = getGateColor(gate.status)
  const label = GATE_LABELS[gate.status] ?? gate.status

  return (
    <div
      title={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        padding: '0 2px',
        flexShrink: 0,
      }}
    >
      {/* Vertical line */}
      <div style={{
        width: '1px',
        height: '8px',
        background: color,
        opacity: 0.5,
      }} />

      {/* Gate dot */}
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />

      {/* Vertical line */}
      <div style={{
        width: '1px',
        height: '8px',
        background: color,
        opacity: 0.5,
      }} />
    </div>
  )
}
