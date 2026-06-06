/**
 * Subsystem Cycle — Dev→Testing→Fixing→Audit per subsystem strand.
 * After cycle: integration, then Testing→Fixing→Audit again.
 * CK-PROC-016
 */

import type { GraphWriter } from './writer'

export const CYCLE_PHASES = ['development', 'testing', 'fixing', 'audit'] as const
export type CyclePhase = (typeof CYCLE_PHASES)[number]

export interface CycleStatus {
  subsystemUid: string
  phases: { name: CyclePhase; uid: string; status: string }[]
  currentPhase: CyclePhase
  integrated: boolean
}

export function createSubsystemCycle(writer: GraphWriter, subsystemUid: string, subsystemName: string): CycleStatus {
  const phases = CYCLE_PHASES.map((name, i) => {
    const result = writer.upsertNode({
      kind: 'phase',
      title: `${subsystemName}/${name}`,
      path: `/cycles/${subsystemUid}/${name}`,
      frontmatter: {
        name,
        position: i + 1,
        phase_status: i === 0 ? 'aktiv' : 'ausstehend',
        cycle_subsystem: subsystemUid,
      },
    })
    return { name, uid: result.uid, status: i === 0 ? 'aktiv' : 'ausstehend' }
  })

  // Chain consecutive cycle phases via naechste_phase (phase→phase is valid)
  for (let i = 0; i < phases.length - 1; i++) {
    writer.linkEdge({ src: phases[i].uid, dst: phases[i + 1].uid, type: 'naechste_phase' })
  }

  return { subsystemUid, phases, currentPhase: 'development', integrated: false }
}

export function advanceCyclePhase(writer: GraphWriter, cycle: CycleStatus): CycleStatus {
  const currentIdx = CYCLE_PHASES.indexOf(cycle.currentPhase)
  if (currentIdx >= CYCLE_PHASES.length - 1) return cycle // already at audit

  const nextPhase = CYCLE_PHASES[currentIdx + 1]

  // Mark current as abgeschlossen
  writer.upsertNode({
    kind: 'phase',
    title: `${cycle.subsystemUid}/${cycle.currentPhase}`,
    path: `/cycles/${cycle.subsystemUid}/${cycle.currentPhase}`,
    frontmatter: {
      name: cycle.currentPhase,
      position: currentIdx + 1,
      phase_status: 'abgeschlossen',
      cycle_subsystem: cycle.subsystemUid,
    },
  })

  // Mark next as aktiv
  writer.upsertNode({
    kind: 'phase',
    title: `${cycle.subsystemUid}/${nextPhase}`,
    path: `/cycles/${cycle.subsystemUid}/${nextPhase}`,
    frontmatter: {
      name: nextPhase,
      position: currentIdx + 2,
      phase_status: 'aktiv',
      cycle_subsystem: cycle.subsystemUid,
    },
  })

  return { ...cycle, currentPhase: nextPhase }
}
