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
  SE_PACKAGES,
} from '../src/main/preset/systems-engineer/se-capabilities'
import { validateCapabilityPackage } from '../src/main/preset/capability-schema'

// ---------------------------------------------------------------------------
// SE_CAPABILITIES_A — 7 packages (companion-memory-tools dropped, Task 12)
// ---------------------------------------------------------------------------

describe('SE_CAPABILITIES_A', () => {
  it('contains exactly 7 package IDs', () => {
    expect(SE_CAPABILITIES_A).toHaveLength(7)
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
// SE_CAPABILITIES_B — 5 packages (no graph-navigation-advanced, no steuer-ueberblick-tool,
// no companion-memory-tools — Task 12)
// ---------------------------------------------------------------------------

describe('SE_CAPABILITIES_B', () => {
  it('contains exactly 5 package IDs', () => {
    expect(SE_CAPABILITIES_B).toHaveLength(5)
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
  it('niveau A returns 7 packages', () => {
    expect(getSECapabilities('A')).toHaveLength(7)
  })

  it('niveau B returns 5 packages', () => {
    expect(getSECapabilities('B')).toHaveLength(5)
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

// ---------------------------------------------------------------------------
// SE capability packages (CapabilityPackage objects)
// ---------------------------------------------------------------------------

describe('SE capability packages', () => {
  it('defines a package for every Niveau-A capability', () => {
    const names = SE_PACKAGES.map(p => p.name)
    for (const id of getSECapabilities('A')) {
      expect(names, id).toContain(id)
    }
  })

  it('every package passes the schema validator', () => {
    for (const pkg of SE_PACKAGES) {
      expect(validateCapabilityPackage(pkg).errors, pkg.name).toEqual([])
    }
  })

  it('no longer carries companion-memory-tools', () => {
    // The companion is deferred; keel has no companion_memory_* MCP tools.
    expect(getSECapabilities('A')).not.toContain('companion-memory-tools')
    expect(getSECapabilities('B')).not.toContain('companion-memory-tools')
  })

  it('keeps seven capabilities at Niveau A and five at Niveau B', () => {
    expect(getSECapabilities('A')).toHaveLength(7)
    expect(getSECapabilities('B')).toHaveLength(5)
  })

  // niveauMinimum is documentation only — nothing in getSECapabilities consumes it,
  // so it can silently drift out of sync with SE_CAPABILITIES_B. This assertion is
  // the price of keeping the field: a package flagged niveauMinimum 'A' must be
  // absent from Niveau B, and one without the flag must be present there.
  it('niveauMinimum stays in sync with SE_CAPABILITIES_B membership', () => {
    for (const pkg of SE_PACKAGES) {
      const inNiveauB = (SE_CAPABILITIES_B as readonly string[]).includes(pkg.name)
      if (pkg.niveauMinimum === 'A') {
        expect(inNiveauB, `${pkg.name} flagged niveauMinimum 'A'`).toBe(false)
      } else {
        expect(inNiveauB, `${pkg.name} has no niveauMinimum flag`).toBe(true)
      }
    }
  })
})
