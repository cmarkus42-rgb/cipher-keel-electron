/**
 * PhaseBlock — single phase tile in the Timeline.
 *
 * CK-UI-004: 4 states visually distinguishable (aktiv, abgeschlossen, trivial-skip, ausstehend)
 * CK-UI-008: trivial-skip at 60% opacity with symbol and tooltip
 */

import { useState } from 'react'
import { getPhaseBlockStyle, PHASE_DISPLAY_NAMES } from '../timeline-utils'
import type { PhaseData, PhaseUIStatus, ArtifactData } from '../timeline-utils'

interface PhaseBlockProps {
  phase: PhaseData
  artifacts: ArtifactData[]
  isSelected?: boolean
  onClick?: (phaseName: string) => void
  children?: React.ReactNode
}

export function PhaseBlock({ phase, artifacts, isSelected, onClick, children }: PhaseBlockProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const style = getPhaseBlockStyle(phase.phase_status as PhaseUIStatus)
  const displayName = PHASE_DISPLAY_NAMES[phase.name as keyof typeof PHASE_DISPLAY_NAMES] ?? phase.name

  const isTrivial = phase.phase_status === 'trivial-skip'
  const isDone = phase.phase_status === 'abgeschlossen'
  const isActive = phase.phase_status === 'aktiv'

  return (
    <div
      title={isTrivial ? 'Als trivial uebersprungen' : undefined}
      onClick={() => onClick?.(phase.name)}
      onMouseEnter={() => isTrivial && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minWidth: 0,
        padding: '6px 4px',
        borderRadius: '4px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'box-shadow 0.15s',
        boxShadow: isSelected ? '0 0 0 2px #61afef' : 'none',
        opacity: style.opacity,
        background: style.background,
        border: style.border,
        fontWeight: style.fontWeight,
        color: style.color,
        fontSize: '11px',
        textAlign: 'center',
      }}
    >
      {/* Status symbol top-right */}
      <span style={{
        position: 'absolute',
        top: '2px',
        right: '4px',
        fontSize: '10px',
      }}>
        {isDone && '✓'}
        {isTrivial && '⊘'}
        {isActive && '●'}
      </span>

      <span style={{ fontWeight: 'inherit', lineHeight: 1.2 }}>
        {displayName}
      </span>

      <span style={{ fontSize: '9px', color: '#666', marginTop: '1px' }}>
        {artifacts.length > 0 && `${artifacts.length}`}
      </span>

      {children}

      {/* Trivial tooltip (CK-UI-008) */}
      {showTooltip && isTrivial && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '4px',
          padding: '4px 8px',
          background: '#333',
          color: '#ddd',
          borderRadius: '3px',
          fontSize: '11px',
          whiteSpace: 'nowrap',
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          Als trivial uebersprungen
        </div>
      )}
    </div>
  )
}
