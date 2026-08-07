/**
 * service-status.ts — Subsystem status shared by Main and Renderer.
 *
 * CK-NFR-010: Graceful degradation must be visible. A subsystem that failed to
 * initialize must be distinguishable from a subsystem that is simply empty.
 */

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------

/** All subsystems initialized by service-lifecycle, in initialization order. */
export const SUBSYSTEM_IDS = ['tmux', 'nanoclaw', 'voice', 'graph', 'kanban', 'notes'] as const

export type SubsystemId = (typeof SUBSYSTEM_IDS)[number]

/**
 * ready    — initialized, fully usable
 * degraded — initialization failed or the backing resource is unreachable
 * disabled — intentionally switched off by config; not an error
 */
export type ServiceState = 'ready' | 'degraded' | 'disabled'

export interface SubsystemStatus {
  id: SubsystemId
  state: ServiceState
  /** Human-readable cause. Always set unless state is 'ready'. */
  reason: string | null
}

export type ServiceStatusMap = Record<SubsystemId, SubsystemStatus>

// ---------------------------------------------------------------------------
// Typed error returned by IPC handlers instead of a silent empty result
// ---------------------------------------------------------------------------

export const SUBSYSTEM_UNAVAILABLE = 'SUBSYSTEM_UNAVAILABLE' as const

export interface SubsystemError {
  code: typeof SUBSYSTEM_UNAVAILABLE
  subsystem: SubsystemId
  message: string
}

export function subsystemError(subsystem: SubsystemId, message: string): SubsystemError {
  return { code: SUBSYSTEM_UNAVAILABLE, subsystem, message }
}

export function isSubsystemError(value: unknown): value is SubsystemError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: unknown }).code === SUBSYSTEM_UNAVAILABLE
  )
}

// ---------------------------------------------------------------------------
// Display normalizer — the boundary where a typed error becomes renderable text
// ---------------------------------------------------------------------------

/**
 * Normalizes an IPC error value to a displayable string.
 *
 * IPC error results may be a plain string (legacy handlers) or a typed error
 * object such as SubsystemError or the kickoff module's KICKOFF_FAILED shape —
 * both carry a string `.message`. Never returns undefined and never lets an
 * object reach a JSX child unstringified.
 */
export function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value || 'Unbekannter Fehler'
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message || 'Unbekannter Fehler'
  }
  return 'Unbekannter Fehler'
}
