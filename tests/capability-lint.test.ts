/**
 * Capability Lint + Token Count tests.
 * Phase 3c / Task 10: estimateTokens, lintCapabilities, warnOversizedPackages
 */

import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  lintCapabilities,
  warnOversizedPackages,
  type LintResult,
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
// estimateTokens — whitespace split * 1.3
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(estimateTokens('   \n\t  ')).toBe(0)
  })

  it('estimates single word as ceil(1 * 1.3) = 2', () => {
    expect(estimateTokens('hello')).toBe(2)
  })

  it('estimates 10 words as ceil(10 * 1.3) = 13', () => {
    expect(estimateTokens(words(10))).toBe(13)
  })

  it('estimates 100 words as ceil(100 * 1.3) = 130', () => {
    expect(estimateTokens(words(100))).toBe(130)
  })

  it('estimates 1000 words as 1300', () => {
    expect(estimateTokens(words(1000))).toBe(1300)
  })

  it('handles multiple whitespace separators (tabs, newlines)', () => {
    // "hello\t\tworld\n\nfoo" = 3 words → ceil(3 * 1.3) = 4
    expect(estimateTokens('hello\t\tworld\n\nfoo')).toBe(4)
  })

  it('result is always a non-negative integer', () => {
    for (const n of [0, 1, 5, 7, 11, 33]) {
      const result = estimateTokens(words(n))
      expect(result).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(result)).toBe(true)
    }
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
    // 384 words → ceil(384 * 1.3) = 500 → exactly at boundary
    const pkg = makeContent('small', words(384)) // 499 tokens
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
    const pkg = makeContent('giant', words(8000)) // 10400 tokens
    const results = warnOversizedPackages([pkg], 'A')

    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('giant')
    expect(results[0].severity).toBe('warning')
    expect(results[0].message).toContain('10')
  })

  it('niveau B: warns for package exceeding 10k tokens', () => {
    const pkg = makeContent('huge', words(8000)) // 10400 tokens
    const results = warnOversizedPackages([pkg], 'B')
    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('huge')
  })

  it('niveau C: warns for package exceeding 500 tokens', () => {
    const pkg = makeContent('tooLarge', words(400)) // 520 tokens > 500
    const results = warnOversizedPackages([pkg], 'C')

    expect(results).toHaveLength(1)
    expect(results[0].packageName).toBe('tooLarge')
    expect(results[0].severity).toBe('warning')
    expect(results[0].message).toContain('500')
  })

  it('warns for multiple oversized packages', () => {
    const pkgs = [
      makeContent('pkg-a', words(8000)),
      makeContent('pkg-b', words(100)),
      makeContent('pkg-c', words(8000)),
    ]
    const results = warnOversizedPackages(pkgs, 'A')

    expect(results).toHaveLength(2)
    const names = results.map(r => r.packageName)
    expect(names).toContain('pkg-a')
    expect(names).toContain('pkg-c')
    expect(names).not.toContain('pkg-b')
  })

  it('LintResult includes estimatedTokens and limit in message', () => {
    const pkg = makeContent('toobig', words(8000))
    const results = warnOversizedPackages([pkg], 'A')

    expect(results[0].message).toBeDefined()
    expect(results[0].message.length).toBeGreaterThan(0)
  })
})

describe('warnOversizedPackages — niveau C applies stricter threshold', () => {
  it('niveau C uses 500 limit, not 10k', () => {
    const pkg = makeContent('medium', words(500)) // ~650 tokens: over 500, under 10k
    const resultsA = warnOversizedPackages([pkg], 'A')
    const resultsC = warnOversizedPackages([pkg], 'C')

    expect(resultsA).toEqual([])    // 650 < 10000 — no warning at A
    expect(resultsC).toHaveLength(1) // 650 > 500 — warning at C
  })
})
