/**
 * SE Capabilities per Niveau — tests.
 * Phase 3c / Task 7
 */

import { describe, it, expect } from 'vitest'
import {
  SE_CAPABILITIES_A,
  SE_CAPABILITIES_B,
  SE_CAPABILITIES_C,
  getSECapabilities,
} from '../src/main/preset/systems-engineer/se-capabilities'

// ---------------------------------------------------------------------------
// SE_CAPABILITIES_A — 8 packages
// ---------------------------------------------------------------------------

describe('SE_CAPABILITIES_A', () => {
  it('contains exactly 8 package IDs', () => {
    expect(SE_CAPABILITIES_A).toHaveLength(8)
  })

  it('includes se-core-identity', () => {
    expect(SE_CAPABILITIES_A).toContain('se-core-identity')
  })

  it('includes graph-navigation-advanced', () => {
    expect(SE_CAPABILITIES_A).toContain('graph-navigation-advanced')
  })

  it('includes steuer-ueberblick-tool', () => {
    expect(SE_CAPABILITIES_A).toContain('steuer-ueberblick-tool')
  })
})

// ---------------------------------------------------------------------------
// SE_CAPABILITIES_B — 6 packages (no graph-navigation-advanced, no steuer-ueberblick-tool)
// ---------------------------------------------------------------------------

describe('SE_CAPABILITIES_B', () => {
  it('contains exactly 6 package IDs', () => {
    expect(SE_CAPABILITIES_B).toHaveLength(6)
  })

  it('does not contain graph-navigation-advanced', () => {
    expect(SE_CAPABILITIES_B).not.toContain('graph-navigation-advanced')
  })

  it('does not contain steuer-ueberblick-tool', () => {
    expect(SE_CAPABILITIES_B).not.toContain('steuer-ueberblick-tool')
  })

  it('still contains se-core-identity', () => {
    expect(SE_CAPABILITIES_B).toContain('se-core-identity')
  })
})

// ---------------------------------------------------------------------------
// SE_CAPABILITIES_C — 1 package (se-core-identity only)
// ---------------------------------------------------------------------------

describe('SE_CAPABILITIES_C', () => {
  it('contains exactly 1 package ID', () => {
    expect(SE_CAPABILITIES_C).toHaveLength(1)
  })

  it('contains only se-core-identity', () => {
    expect(SE_CAPABILITIES_C).toContain('se-core-identity')
    expect(SE_CAPABILITIES_C[0]).toBe('se-core-identity')
  })
})

// ---------------------------------------------------------------------------
// getSECapabilities(niveau)
// ---------------------------------------------------------------------------

describe('getSECapabilities', () => {
  it('niveau A returns 8 packages', () => {
    expect(getSECapabilities('A')).toHaveLength(8)
  })

  it('niveau B returns 6 packages', () => {
    expect(getSECapabilities('B')).toHaveLength(6)
  })

  it('niveau C returns 1 package', () => {
    expect(getSECapabilities('C')).toHaveLength(1)
  })

  it('niveau A result matches SE_CAPABILITIES_A', () => {
    expect(getSECapabilities('A')).toEqual([...SE_CAPABILITIES_A])
  })

  it('niveau B result matches SE_CAPABILITIES_B', () => {
    expect(getSECapabilities('B')).toEqual([...SE_CAPABILITIES_B])
  })

  it('niveau C result matches SE_CAPABILITIES_C', () => {
    expect(getSECapabilities('C')).toEqual([...SE_CAPABILITIES_C])
  })
})
