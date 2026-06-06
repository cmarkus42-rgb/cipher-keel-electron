// tests/preset/cyber-factory/cf-worker-orchestration.test.ts
import { describe, it, expect } from 'vitest'
import {
  WorkerLifecycle,
  STARTUP_WAIT_MS,
  TASK_PARSE_WAIT_MS,
  MONITORING_INTERVAL_MS,
  CONTEXT_ROTATION_THRESHOLD,
  MAX_STARTUP_RETRIES,
} from '../../../src/main/preset/cyber-factory/cf-worker-orchestration'

describe('CF Worker Orchestration — Schenkel-1 Protocol (CK-P3CF-003)', () => {
  it('STARTUP_WAIT_MS is 8000-10000ms range', () => {
    expect(STARTUP_WAIT_MS).toBeGreaterThanOrEqual(8000)
    expect(STARTUP_WAIT_MS).toBeLessThanOrEqual(10000)
  })

  it('TASK_PARSE_WAIT_MS is 15000ms', () => {
    expect(TASK_PARSE_WAIT_MS).toBe(15000)
  })

  it('MONITORING_INTERVAL_MS is 120000ms (2min)', () => {
    expect(MONITORING_INTERVAL_MS).toBe(120000)
  })

  it('CONTEXT_ROTATION_THRESHOLD is 0.8', () => {
    expect(CONTEXT_ROTATION_THRESHOLD).toBe(0.8)
  })

  it('MAX_STARTUP_RETRIES is 3', () => {
    expect(MAX_STARTUP_RETRIES).toBe(3)
  })

  it('WorkerLifecycle has correct step order', () => {
    expect(WorkerLifecycle).toEqual([
      'create_session',
      'wait_startup',
      'check_prompt',
      'send_instruction',
      'wait_parse',
      'verify_working',
      'monitoring',
    ])
  })
})
