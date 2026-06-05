/**
 * ArtifactNode — small node on the Timeline representing a graph artifact.
 *
 * CK-UI-005: Graph nodes (Uebergabedokumente, Brain-Notes, Entscheidungen) as nodes on timeline.
 * CK-UI-006: Hover tooltip <200ms with Titel, Phase, Datum, Status, Schenkel-Badge.
 */

import { useState } from 'react'
import type { ArtifactData } from '../timeline-utils'

interface ArtifactNodeProps {
  artifact: ArtifactData
  onClick?: (artifact: ArtifactData) => void
}

const KIND_COLORS: Record<string, string> = {
  uebergabedokument: '#61afef',
  artefakt: '#98c379',
  note: '#e5c07b',
  entscheidung: '#c678dd',
  anforderung: '#56b6c2',
}

export function ArtifactNode({ artifact, onClick }: ArtifactNodeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipTimer, setTooltipTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const color = KIND_COLORS[artifact.kind] ?? '#666'

  const handleMouseEnter = () => {
    // CK-UI-006: tooltip appears in < 200ms
    const timer = setTimeout(() => setTooltipVisible(true), 0)
    setTooltipTimer(timer)
  }

  const handleMouseLeave = () => {
    if (tooltipTimer) clearTimeout(tooltipTimer)
    setTooltipVisible(false)
    setTooltipTimer(null)
  }

  const formattedDate = artifact.erstellt
    ? new Date(artifact.erstellt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

  return (
    <div
      onClick={() => onClick?.(artifact)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: color,
        cursor: 'pointer',
        flexShrink: 0,
      }}
      title={artifact.title}
    >
      {tooltipVisible && (
        <div style={{
          position: 'absolute',
          bottom: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '6px 10px',
          background: '#1e1e2e',
          border: '1px solid #444',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#ccc',
          whiteSpace: 'nowrap',
          zIndex: 200,
          pointerEvents: 'none',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 'bold', color: '#e8e8e8' }}>{artifact.title}</div>
          <div>Phase: <span style={{ color }}>{artifact.phase_name}</span></div>
          <div>Stand: {formattedDate}</div>
          <div>Status: {artifact.status}</div>
          {artifact.schenkel && <div>Schenkel: <span style={{ color: '#61afef' }}>{artifact.schenkel}</span></div>}
        </div>
      )}
    </div>
  )
}
