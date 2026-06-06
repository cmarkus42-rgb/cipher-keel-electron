/**
 * CF Worker Orchestration — Schenkel-1 Protocol.
 *
 * Defines the worker session lifecycle constants and types.
 * Actual tmux/session operations are handled by the runtime adapter.
 *
 * CK-P3CF-003
 */

/** Wait time after mux_create_session before checking prompt. */
export const STARTUP_WAIT_MS = 10000

/** Wait time after sending instruction before verifying work started. */
export const TASK_PARSE_WAIT_MS = 15000

/** Monitoring loop interval. */
export const MONITORING_INTERVAL_MS = 120000

/** Context usage threshold for proactive rotation. */
export const CONTEXT_ROTATION_THRESHOLD = 0.8

/** Max retries for startup prompt check. */
export const MAX_STARTUP_RETRIES = 3

/** Ordered lifecycle steps for a worker session. */
export const WorkerLifecycle = [
  'create_session',
  'wait_startup',
  'check_prompt',
  'send_instruction',
  'wait_parse',
  'verify_working',
  'monitoring',
] as const

export type WorkerStep = (typeof WorkerLifecycle)[number]

export interface WorkerStatus {
  sessionId: string
  step: WorkerStep
  contextUsage: number
  startedAt: Date
  lastCheck: Date | null
}
