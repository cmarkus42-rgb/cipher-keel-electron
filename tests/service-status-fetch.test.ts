/**
 * tests/service-status-fetch.test.ts — sequencing guard for services:status fetches.
 *
 * Pure function only, no React rendering — style matches tests/status-bar-degradation.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { shouldApplyStatusResult } from '../src/renderer/service-status-fetch'

describe('shouldApplyStatusResult', () => {
  it('applies a newer result', () => {
    expect(shouldApplyStatusResult(2, 3)).toBe(true)
  })

  it('drops a stale result that arrives after a newer one was already applied', () => {
    expect(shouldApplyStatusResult(3, 2)).toBe(false)
  })

  it('drops a result with an equal sequence number (duplicate, already applied)', () => {
    expect(shouldApplyStatusResult(2, 2)).toBe(false)
  })

  it('applies the very first result (nothing applied yet)', () => {
    expect(shouldApplyStatusResult(0, 1)).toBe(true)
  })
})
