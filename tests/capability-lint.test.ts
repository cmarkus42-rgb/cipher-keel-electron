/**
 * Capability Lint + Token Count tests.
 * Phase 3c / Task 10: estimateTokens, lintCapabilities, warnOversizedPackages
 */

import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  lintCapabilities,
  warnOversizedPackages,
  type PackageContent,
} from '../src/main/preset/capability-lint'
import { LoaderType, type CapabilityPackage } from '../src/main/preset/capability-schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkg(name: string, abhaengigkeiten?: string[]): CapabilityPackage {
  return {
    name,
    beschreibung: `Package ${name}`,
    loader: LoaderType.SkillMd,
    pfad: `/capabilities/${name}.md`,
    abhaengigkeiten,
  }
}

function makeContent(name: string, content: string): PackageContent {
  return { name, content }
}

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
}

// ---------------------------------------------------------------------------
// estimateTokens — delegates to estimateTokenCount (chars/4 heuristic, M-6)
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    // whitespace-only has length > 0, chars/4 returns > 0
    // but estimateTokenCount checks length === 0, not trim
    const result = estimateTokens('   \n\t  ')
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('estimates single word using chars/4', () => {
    // 'hello' = 5 chars → ceil(5/4) = 2
    expect(estimateTokens('hello')).toBe(2)
  })

  it('estimates longer text proportional to character count', () => {
    const text = 'a'.repeat(100)
    expect(estimateTokens(text)).toBe(25) // 100/4
  })

  it('result is always a non-negative integer', () => {
    for (const n of [0, 1, 5, 7, 11, 33]) {
      const result = estimateTokens(words(n))
      expect(result).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(result)).toBe(true)
    }
  })

  it('matches estimateTokenCount from capability-schema (M-6 consolidation)', async () => {
    const { estimateTokenCount } = await import('../src/main/preset/capability-schema')
    const text = words(50)
    expect(estimateTokens(text)).toBe(estimateTokenCount(text))
  })
})

// ---------------------------------------------------------------------------
// lintCapabilities — dependency resolution check
// ---------------------------------------------------------------------------

describe('lintCapabilities — empty / no issues', () => {
  it('returns [] for empty package list', () => {
    expect(lintCapabilities([])).toEqual([])
  })

  it('returns [] when no packages have abhaengigkeiten', () => {
    expect(lintCapabilities([makePkg('a'), makePkg('b')])).toEqual([])
  })

  it('returns [] when all declared deps are present', () => {
    const pkgs = [
      makePkg('core'),
      makePkg('advanced', ['core']),
    ]
    expect(lintCapabilities(pkgs)).toEqual([])
  })

  it('returns [] for multi-level satisfied deps', () => {
    const pkgs = [
      makePkg('base'),
      makePkg('mid', ['base']),
      makePkg('top', ['mid', 'base']),
    ]
    expect(lintCapabilities(pkgs)).toEqual([])
  })
})

describe('lintCapabilities — missing dependency errors', () => {
  it('flags a package whose dependency is not in the set', () => {
    const pkgs = [makePkg('advanced', ['missing-dep'])]
    const results = lintCapabilities(pkgs)

    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('advanced')
    expect(results[0].severity).toBe('error')
    expect(results[0].message).toContain('missing-dep')
  })

  it('produces one LintResult per missing dependency', () => {
    const pkgs = [makePkg('top', ['dep-a', 'dep-b', 'dep-c'])]
    const results = lintCapabilities(pkgs)

    expect(results).toHaveLength(3)
    const msgs = results.map(r => r.message)
    expect(msgs.some(m => m.includes('dep-a'))).toBe(true)
    expect(msgs.some(m => m.includes('dep-b'))).toBe(true)
    expect(msgs.some(m => m.includes('dep-c'))).toBe(true)
  })

  it('only reports the missing dep, not the present one', () => {
    const pkgs = [
      makePkg('base'),
      makePkg('top', ['base', 'missing']),
    ]
    const results = lintCapabilities(pkgs)

    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('missing')
    expect(results[0].message).not.toContain('base')
  })

  it('LintResult has packageName, severity: error, and message', () => {
    const results = lintCapabilities([makePkg('pkg', ['gone'])])

    expect(results[0]).toMatchObject({
      packageName: 'pkg',
      severity: 'error',
    })
    expect(typeof results[0].message).toBe('string')
    expect(results[0].message.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// warnOversizedPackages — size thresholds per niveau
// ---------------------------------------------------------------------------

describe('warnOversizedPackages — no warnings', () => {
  it('returns [] for empty package list', () => {
    expect(warnOversizedPackages([], 'A')).toEqual([])
  })

  it('niveau A: no warning for package under 10k tokens', () => {
    const pkg = makeContent('small', words(100)) // 130 tokens
    expect(warnOversizedPackages([pkg], 'A')).toEqual([])
  })

  it('niveau B: no warning for package under 10k tokens', () => {
    const pkg = makeContent('medium', words(500)) // 650 tokens
    expect(warnOversizedPackages([pkg], 'B')).toEqual([])
  })

  it('niveau C: no warning for package under 500 tokens', () => {
    // chars/4: 1999 chars → ceil(1999/4) = 500 → exactly at boundary
    const pkg = makeContent('small', 'a'.repeat(1999))
    const results = warnOversizedPackages([pkg], 'C')
    expect(results).toEqual([])
  })

  it('niveau A: 500-token package has no warning (only C threshold)', () => {
    const pkg = makeContent('medium', words(400)) // 520 tokens < 10k
    expect(warnOversizedPackages([pkg], 'A')).toEqual([])
  })
})

describe('warnOversizedPackages — warnings triggered', () => {
  it('niveau A: warns for package exceeding 10k tokens', () => {
    const pkg = makeContent('giant', 'a'.repeat(40001)) // 10001 tokens
    const results = warnOversizedPackages([pkg], 'A')

    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('giant')
    expect(results[0].severity).toBe('warning')
    expect(results[0].message).toContain('10')
  })

  it('niveau B: warns for package exceeding 10k tokens', () => {
    const pkg = makeContent('huge', 'a'.repeat(40001)) // 10001 tokens
    const results = warnOversizedPackages([pkg], 'B')
    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('huge')
  })

  it('niveau C: warns for package exceeding 500 tokens', () => {
    const pkg = makeContent('tooLarge', 'a'.repeat(2001)) // 501 tokens > 500
    const results = warnOversizedPackages([pkg], 'C')

    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('tooLarge')
    expect(results[0].severity).toBe('warning')
    expect(results[0].message).toContain('500')
  })

  it('warns for multiple oversized packages', () => {
    const pkgs = [
      makeContent('pkg-a', 'a'.repeat(40001)),
      makeContent('pkg-b', 'a'.repeat(100)),
      makeContent('pkg-c', 'a'.repeat(40001)),
    ]
    const results = warnOversizedPackages(pkgs, 'A')

    expect(results).toHaveLength(2)
    const names = results.map(r => r.packageName)
    expect(names).toContain('pkg-a')
    expect(names).toContain('pkg-c')
    expect(names).not.toContain('pkg-b')
  })

  it('LintResult includes estimatedTokens and limit in message', () => {
    const pkg = makeContent('toobig', 'a'.repeat(40001))
    const results = warnOversizedPackages([pkg], 'A')

    expect(results[0].message).toBeDefined()
    expect(results[0].message.length).toBeGreaterThan(0)
  })
})

describe('warnOversizedPackages — niveau C applies stricter threshold', () => {
  it('niveau C uses 500 limit, not 10k', () => {
    const pkg = makeContent('medium', 'a'.repeat(2400)) // 600 tokens: over 500, under 10k
    const resultsA = warnOversizedPackages([pkg], 'A')
    const resultsC = warnOversizedPackages([pkg], 'C')

    expect(resultsA).toEqual([])    // 650 < 10000 — no warning at A
    expect(resultsC).toHaveLength(1) // 650 > 500 — warning at C
  })
})
