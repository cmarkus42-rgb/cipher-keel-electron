// tests/preset/cyber-factory/cf-boundary.test.ts
import { describe, it, expect } from 'vitest'
import { checkCfBoundary } from '../../../src/main/preset/capability-lint'

describe('CF Boundary Check (CK-P3CF-011)', () => {
  it('returns warning when CF writes schnittstellen_vertrag', () => {
    const results = checkCfBoundary(['schnittstellen_vertrag'])
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('warning')
  })

  it('returns warning when CF modifies adr', () => {
    const results = checkCfBoundary(['adr'])
    expect(results).toHaveLength(1)
  })

  it('no warning for frage_knoten (allowed)', () => {
    const results = checkCfBoundary(['frage_knoten'])
    expect(results).toHaveLength(0)
  })

  it('no warning for gate_befund (allowed — risk reviews)', () => {
    const results = checkCfBoundary(['gate_befund'])
    expect(results).toHaveLength(0)
  })

  it('no warning for anforderungspaket reads', () => {
    const results = checkCfBoundary(['anforderungspaket'])
    expect(results).toHaveLength(0)
  })
})
