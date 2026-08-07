/**
 * useTimeline — Data hook for the Timeline component.
 *
 * CK-UI-004–007: Fetches phase data, artifacts per phase, and gate status
 * via IPC calls to the Knowledge Graph (phase_chain, nodes_by_kind queries).
 */

import { useState, useEffect, useCallback } from 'react'
import { deriveGates } from '../timeline-utils'
import type { PhaseData, ArtifactData, GateData, TimelineState, PhaseUIStatus } from '../timeline-utils'
import { errorMessage } from '../../shared/service-status'

const api = () => (window as any).cipherKeel

interface RawPhaseRow {
  uid: string
  title: string
  frontmatter: string
}

interface RawArtifactRow {
  uid: string
  title: string
  kind: string
  path: string | null
  status: string
  frontmatter: string
  erstellt: string
}

/** Parse phase rows from graph phase_chain query result. */
function parsePhases(rows: RawPhaseRow[]): PhaseData[] {
  return rows.map(row => {
    let fm: { name?: string; position?: number; phase_status?: string } = {}
    try { fm = JSON.parse(row.frontmatter) } catch { /* ignore */ }
    return {
      uid: row.uid,
      name: fm.name ?? row.title,
      position: fm.position ?? 0,
      phase_status: (fm.phase_status ?? 'ausstehend') as PhaseUIStatus,
    }
  })
}

/**
 * Parse artifact rows, resolving their phase assignment from the frontmatter
 * or via a separate phase-binding lookup.
 *
 * For now, phase_name is read from frontmatter.phase_name if present,
 * otherwise defaults to the artifact's kind for display.
 */
function parseArtifacts(rows: RawArtifactRow[]): ArtifactData[] {
  return rows.map(row => {
    let fm: { phase_name?: string; schenkel?: string } = {}
    try { fm = JSON.parse(row.frontmatter) } catch { /* ignore */ }
    return {
      uid: row.uid,
      title: row.title,
      kind: row.kind,
      phase_name: fm.phase_name ?? '',
      status: row.status,
      path: row.path,
      erstellt: row.erstellt,
      schenkel: fm.schenkel,
    }
  })
}

export interface UseTimelineResult extends TimelineState {
  /** Re-runs the phase/artifact fetch — used to recover once a degraded graph reports ready again. */
  refresh: () => Promise<void>
}

export function useTimeline(projectPath?: string): UseTimelineResult {
  const [state, setState] = useState<TimelineState>({
    phases: [],
    artifacts: [],
    gates: [],
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))

      // Fetch phase chain (CK-PROC-001)
      const phaseResult = await api().graph.query({ template: 'phase_chain' })
      if (phaseResult?.error) {
        setState(prev => ({ ...prev, loading: false, error: errorMessage(phaseResult.error) }))
        return
      }
      const phases = parsePhases(phaseResult?.rows ?? [])

      // Fetch artifact nodes (uebergabedokument + artefakt + note + entscheidung)
      const [udResult, artefaktResult, noteResult] = await Promise.all([
        api().graph.query({ template: 'nodes_by_kind', params: { kind: 'uebergabedokument', limit: 200 } }),
        api().graph.query({ template: 'nodes_by_kind', params: { kind: 'artefakt', limit: 200 } }),
        api().graph.query({ template: 'nodes_by_kind', params: { kind: 'note', limit: 200 } }),
      ])

      const allRaw: RawArtifactRow[] = [
        ...(udResult?.rows ?? []),
        ...(artefaktResult?.rows ?? []),
        ...(noteResult?.rows ?? []),
      ]

      const artifacts = parseArtifacts(allRaw)
      const gates: GateData[] = deriveGates(phases)

      setState({ phases, artifacts, gates, loading: false, error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState(prev => ({ ...prev, loading: false, error: msg }))
    }
  }, [projectPath])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...state, refresh }
}
