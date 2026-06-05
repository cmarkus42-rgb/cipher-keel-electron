/**
 * timeline-utils.ts — Pure TypeScript logic for the Timeline component.
 *
 * No React imports — all functions are testable in a Node.js environment.
 *
 * CK-UI-004: 8 phase tiles, 4 states (aktiv, abgeschlossen, trivial-skip, ausstehend)
 * CK-UI-005: Artifact nodes assigned to phases
 * CK-UI-006: Tooltip data structure
 * CK-UI-007: Gate status indicators (gruen, gelb, rot)
 * CK-UI-008: trivial-skip visual at 60% opacity
 */

// ---------------------------------------------------------------------------
// Timeline layout constants (CK-UI-025)
// ---------------------------------------------------------------------------

export const MIN_TIMELINE_PCT = 15
export const MAX_TIMELINE_PCT = 60
export const DEFAULT_TIMELINE_PCT = 35

/**
 * Clamps a timeline percentage to the valid [MIN, MAX] range.
 * Used to validate persisted values before applying them (CK-UI-025).
 */
export function clampTimelinePct(pct: number): number {
  return Math.max(MIN_TIMELINE_PCT, Math.min(MAX_TIMELINE_PCT, pct))
}

// ---------------------------------------------------------------------------
// Phase constants (CK-UI-004, CK-PROC-001)
// ---------------------------------------------------------------------------

export const PHASE_NAMES = [
  'ideation',
  'requirements',
  'architecture',
  'development',
  'testing',
  'fixing',
  'audit',
  'release-management',
] as const

export type PhaseName = (typeof PHASE_NAMES)[number]

export const PHASE_DISPLAY_NAMES: Record<PhaseName, string> = {
  'ideation': 'Ideation',
  'requirements': 'Requirements',
  'architecture': 'Architektur',
  'development': 'Development',
  'testing': 'Testing',
  'fixing': 'Fixing',
  'audit': 'Audit',
  'release-management': 'Release',
}

// ---------------------------------------------------------------------------
// Phase status (CK-UI-004, CK-UI-008)
// ---------------------------------------------------------------------------

export type PhaseUIStatus = 'ausstehend' | 'aktiv' | 'abgeschlossen' | 'trivial-skip'

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface PhaseData {
  uid: string
  name: string
  position: number
  phase_status: PhaseUIStatus
}

export interface ArtifactData {
  uid: string
  title: string
  kind: string
  phase_name: string
  status: string
  path: string | null
  erstellt: string
  /** Optional: which Schenkel (A/B/C) created this artifact */
  schenkel?: string
}

export type GateStatus = 'gruen' | 'gelb' | 'rot'

export interface GateData {
  /** Phase name after which this gate sits */
  after_phase: string
  status: GateStatus
}

export interface TimelineState {
  phases: PhaseData[]
  artifacts: ArtifactData[]
  gates: GateData[]
  loading: boolean
  error: string | null
}

// ---------------------------------------------------------------------------
// Style helpers (CK-UI-004, CK-UI-008)
// ---------------------------------------------------------------------------

export interface PhaseBlockStyle {
  opacity: number
  background: string
  border: string
  fontWeight: string | number
  color: string
}

/**
 * Returns CSS style values for a phase tile based on its status.
 * All 4 states are visually distinguishable (CK-UI-004 acceptance criterion 2).
 */
export function getPhaseBlockStyle(status: PhaseUIStatus): PhaseBlockStyle {
  switch (status) {
    case 'aktiv':
      return {
        opacity: 1,
        background: '#1e3a2f',
        border: '2px solid #98c379',
        fontWeight: 'bold',
        color: '#e8e8e8',
      }
    case 'abgeschlossen':
      return {
        opacity: 0.7,
        background: '#1a2a1a',
        border: '1px solid #555',
        fontWeight: 'normal',
        color: '#aaa',
      }
    case 'trivial-skip':
      return {
        // CK-UI-008: 60% opacity
        opacity: 0.6,
        background: '#1a1a1a',
        border: '1px dashed #444',
        fontWeight: 'normal',
        color: '#777',
      }
    case 'ausstehend':
    default:
      return {
        opacity: 1,
        background: '#111',
        border: '1px solid #333',
        fontWeight: 'normal',
        color: '#888',
      }
  }
}

// ---------------------------------------------------------------------------
// Phase name → number (CK-UI-012, coupling Timeline → Kanban filter)
// ---------------------------------------------------------------------------

/**
 * Converts a canonical phase name to its 1-based position number.
 * Returns null for unknown names.
 *
 * Used to derive a KanbanFilter { phases: [num] } from a Timeline click.
 */
export function phaseNameToNumber(name: string): number | null {
  const idx = PHASE_NAMES.indexOf(name as PhaseName)
  return idx >= 0 ? idx + 1 : null
}

// ---------------------------------------------------------------------------
// Rendering mode (CK-UI-031 — performance fallback at 500+ nodes)
// ---------------------------------------------------------------------------

export type RenderingMode = 'svg' | 'canvas'

/**
 * Returns 'canvas' for 500+ artifact nodes (Node-Virtualisierung / Canvas
 * fallback per CK-UI-031 acceptance criterion 2), 'svg' otherwise.
 */
export function getRenderingMode(nodeCount: number): RenderingMode {
  return nodeCount >= 500 ? 'canvas' : 'svg'
}

// ---------------------------------------------------------------------------
// Gate color (CK-UI-007)
// ---------------------------------------------------------------------------

/**
 * Returns the hex color for a gate status indicator.
 * Three distinct colors (CK-UI-007 acceptance criterion 2).
 */
export function getGateColor(status: GateStatus): string {
  switch (status) {
    case 'gruen':
      return '#98c379'
    case 'gelb':
      return '#e5c07b'
    case 'rot':
      return '#e06c75'
  }
}

// ---------------------------------------------------------------------------
// Artifact grouping (CK-UI-005)
// ---------------------------------------------------------------------------

/**
 * Groups artifacts by their phase_name.
 * Returns a Map<phaseName, ArtifactData[]>.
 * Artifacts with unknown phase_name are included under their phase_name key.
 */
export function groupArtifactsByPhase(artifacts: ArtifactData[]): Map<string, ArtifactData[]> {
  const result = new Map<string, ArtifactData[]>()

  // Pre-populate with all known phases (empty arrays)
  for (const name of PHASE_NAMES) {
    result.set(name, [])
  }

  for (const artifact of artifacts) {
    const key = artifact.phase_name
    if (!result.has(key)) {
      result.set(key, [])
    }
    result.get(key)!.push(artifact)
  }

  return result
}

// ---------------------------------------------------------------------------
// Gate derivation (CK-UI-007)
// ---------------------------------------------------------------------------

/**
 * Derives gate status for each phase boundary from phase data.
 *
 * Logic:
 *   - gruen:  the preceding phase is 'abgeschlossen'
 *   - rot:    the preceding phase is 'ausstehend' (gap — skipped over)
 *   - gelb:   the preceding phase is 'aktiv' (in-progress, plausibility open)
 *   - trivial-skip phases get no gate (gate is omitted in Timeline)
 *
 * Returns gates for positions 2–8 (after each phase that has a predecessor).
 */
export function deriveGates(phases: PhaseData[]): GateData[] {
  const sorted = [...phases].sort((a, b) => a.position - b.position)
  const gates: GateData[] = []

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    // trivial-skip phases don't get a gate indicator
    if (prev.phase_status === 'trivial-skip') continue

    let status: GateStatus
    switch (prev.phase_status) {
      case 'abgeschlossen':
        status = 'gruen'
        break
      case 'aktiv':
        status = 'gelb'
        break
      default:
        status = 'rot'
    }

    gates.push({ after_phase: prev.name, status })
  }

  return gates
}
