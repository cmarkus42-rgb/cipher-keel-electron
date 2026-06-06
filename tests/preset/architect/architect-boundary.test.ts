// tests/preset/architect/architect-boundary.test.ts
import { describe, it, expect } from 'vitest'
import { checkArchitectBoundary, checkCfBoundary } from '../../../src/main/preset/capability-lint'

describe('Architect Boundary Check (CK-P3A-013)', () => {
  it('returns warning for .ts file write', () => {
    const results = checkArchitectBoundary(['src/auth/login.ts'])
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('warning')
    expect(results[0].message).toContain('produktiver Code')
  })

  it('returns warning for .tsx file write', () => {
    const results = checkArchitectBoundary(['src/components/App.tsx'])
    expect(results).toHaveLength(1)
  })

  it('no warning for .md file write', () => {
    const results = checkArchitectBoundary(['docs/adr-001.md'])
    expect(results).toHaveLength(0)
  })

  it('no warning for empty file list', () => {
    const results = checkArchitectBoundary([])
    expect(results).toHaveLength(0)
  })

  it('multiple code files produce multiple warnings', () => {
    const results = checkArchitectBoundary(['a.ts', 'b.js', 'c.py'])
    expect(results).toHaveLength(3)
  })
})
