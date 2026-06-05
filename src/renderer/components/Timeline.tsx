/**
 * Timeline — SVG-based horizontal phase timeline.
 *
 * CK-UI-004: 8 phase tiles in horizontal order.
 * CK-UI-005: Artifact nodes placed under each phase tile.
 * CK-UI-007: Gate indicators at each phase boundary.
 * CK-UI-008: trivial-skip visual state.
 */

import { PhaseBlock } from './PhaseBlock'
import { ArtifactNode } from './ArtifactNode'
import { GateIndicator } from './GateIndicator'
import { PHASE_NAMES, groupArtifactsByPhase } from '../timeline-utils'
import type { PhaseData, ArtifactData, GateData } from '../timeline-utils'

interface TimelineProps {
  phases: PhaseData[]
  artifacts: ArtifactData[]
  gates: GateData[]
  selectedPhase?: string | null
  onPhaseClick?: (phaseName: string) => void
  onArtifactClick?: (artifact: ArtifactData) => void
}

export function Timeline({
  phases,
  artifacts,
  gates,
  selectedPhase,
  onPhaseClick,
  onArtifactClick,
}: TimelineProps) {
  // Build phase map for lookup
  const phaseMap = new Map(phases.map(p => [p.name, p]))
  const artifactsByPhase = groupArtifactsByPhase(artifacts)
  const gateMap = new Map(gates.map(g => [g.after_phase, g]))

  // Use canonical PHASE_NAMES order (CK-UI-004: always 8 tiles)
  const orderedPhases = PHASE_NAMES.map(name => {
    const phase = phaseMap.get(name)
    if (phase) return phase
    // Fallback for missing data — show as ausstehend
    return {
      uid: `placeholder-${name}`,
      name,
      position: PHASE_NAMES.indexOf(name) + 1,
      phase_status: 'ausstehend' as const,
    }
  })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: '#0d0d0d',
      padding: '4px 8px',
      boxSizing: 'border-box',
    }}>
      {/* Phase tiles row */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '0',
        height: '56px',
        flex: '0 0 56px',
      }}>
        {orderedPhases.map((phase, idx) => {
          const gate = idx > 0 ? gateMap.get(PHASE_NAMES[idx - 1]) : undefined
          return (
            <div key={phase.name} style={{ display: 'flex', alignItems: 'stretch', flex: 1, minWidth: 0 }}>
              {/* Gate indicator before this phase (except first) */}
              {gate && (
                <GateIndicator gate={gate} />
              )}

              <PhaseBlock
                phase={phase}
                artifacts={artifactsByPhase.get(phase.name) ?? []}
                isSelected={selectedPhase === phase.name}
                onClick={onPhaseClick}
              />
            </div>
          )
        })}
      </div>

      {/* Artifact nodes row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        paddingTop: '4px',
        gap: '0',
        height: '18px',
        flex: '0 0 18px',
        overflow: 'visible',
      }}>
        {orderedPhases.map(phase => {
          const phaseArtifacts = artifactsByPhase.get(phase.name) ?? []
          return (
            <div
              key={phase.name}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                overflow: 'hidden',
              }}
            >
              {phaseArtifacts.slice(0, 6).map(artifact => (
                <ArtifactNode
                  key={artifact.uid}
                  artifact={artifact}
                  onClick={onArtifactClick}
                />
              ))}
              {phaseArtifacts.length > 6 && (
                <span style={{ fontSize: '9px', color: '#555' }}>+{phaseArtifacts.length - 6}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
