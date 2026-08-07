/**
 * Capability System Tests — CK-ENT-006, CK-ENT-007, CK-ENT-017
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  LoaderType,
  validateCapabilityPackage,
  estimateTokenCount,
  type CapabilityPackage,
} from '../src/main/preset/capability-schema'

// ---------------------------------------------------------------------------
// capability-schema.ts
// ---------------------------------------------------------------------------

describe('estimateTokenCount', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0)
  })

  it('estimates ~1 token per 4 chars', () => {
    const text = 'a'.repeat(400)
    expect(estimateTokenCount(text)).toBe(100)
  })

  it('rounds up partial tokens', () => {
    // 401 chars → Math.ceil(401/4) = 101
    expect(estimateTokenCount('a'.repeat(401))).toBe(101)
  })
})

describe('validateCapabilityPackage', () => {
  it('accepts a valid package', () => {
    const pkg: CapabilityPackage = {
      name: 'test-pkg',
      beschreibung: 'A short description.',
      loader: LoaderType.Inline,
      pfad: '/some/path',
      niveauCExtrakt: 'Inline content here.',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts a package with all optional fields', () => {
    const pkg: CapabilityPackage = {
      name: 'full-pkg',
      beschreibung: 'A full package.',
      loader: LoaderType.SkillMd,
      pfad: '/skills/full/SKILL.md',
      niveauMinimum: 'B',
      niveauCExtrakt: 'Short extract.',
      abhaengigkeiten: ['dep-a', 'dep-b'],
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(true)
  })

  it('rejects a package missing name', () => {
    const pkg = {
      beschreibung: 'A short description.',
      loader: LoaderType.Inline,
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('name'))).toBe(true)
  })

  it('rejects a package with empty name', () => {
    const pkg = {
      name: '   ',
      beschreibung: 'A short description.',
      loader: LoaderType.Inline,
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('name'))).toBe(true)
  })

  it('rejects a package with beschreibung exceeding 100 tokens', () => {
    // 420 chars → 105 tokens > 100
    const longDesc = 'a'.repeat(420)
    const pkg = {
      name: 'bloated-pkg',
      beschreibung: longDesc,
      loader: LoaderType.Inline,
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('beschreibung'))).toBe(true)
  })

  it('accepts beschreibung of exactly 100 tokens (400 chars)', () => {
    const pkg = {
      name: 'edge-pkg',
      beschreibung: 'a'.repeat(400),
      loader: LoaderType.Inline,
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(true)
  })

  it('rejects unknown loader type', () => {
    const pkg = {
      name: 'bad-loader',
      beschreibung: 'Short.',
      loader: 'unknown-loader',
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('loader'))).toBe(true)
  })

  it('rejects invalid niveauMinimum value', () => {
    const pkg = {
      name: 'bad-niveau',
      beschreibung: 'Short.',
      loader: LoaderType.Inline,
      pfad: '/some/path',
      niveauMinimum: 'D',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('niveauMinimum'))).toBe(true)
  })

  it('rejects non-null non-object input', () => {
    const result = validateCapabilityPackage('not an object')
    expect(result.valid).toBe(false)
  })

  it('accepts empty abhaengigkeiten array', () => {
    const pkg: CapabilityPackage = {
      name: 'no-deps',
      beschreibung: 'No dependencies.',
      loader: LoaderType.Inline,
      pfad: '',
      niveauCExtrakt: 'Content.',
      abhaengigkeiten: [],
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// capability-loader.ts
// ---------------------------------------------------------------------------

import * as fs from 'fs/promises'
import { loadCapabilityContent } from '../src/main/preset/capability-loader'

vi.mock('fs/promises')

describe('loadCapabilityContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('skill-md: reads file at pfad', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# My Skill\nDo things.')
    const pkg: CapabilityPackage = {
      name: 'my-skill',
      beschreibung: 'Does things.',
      loader: LoaderType.SkillMd,
      pfad: '/skills/my-skill/SKILL.md',
    }
    const content = await loadCapabilityContent(pkg)
    expect(fs.readFile).toHaveBeenCalledWith('/skills/my-skill/SKILL.md', 'utf8')
    expect(content).toBe('# My Skill\nDo things.')
  })

  it('nanoclaw-skill: returns JSON payload with type, name, pfad', async () => {
    const pkg: CapabilityPackage = {
      name: 'nc-skill',
      beschreibung: 'NanoClaw capability.',
      loader: LoaderType.NanoClawSkill,
      pfad: '/nc/route',
    }
    const content = await loadCapabilityContent(pkg)
    const parsed = JSON.parse(content)
    expect(parsed.type).toBe('nanoclaw-skill')
    expect(parsed.name).toBe('nc-skill')
    expect(parsed.pfad).toBe('/nc/route')
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('reference-material: reads file at pfad', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('Reference docs here.')
    const pkg: CapabilityPackage = {
      name: 'ref-doc',
      beschreibung: 'Reference material.',
      loader: LoaderType.ReferenceMaterial,
      pfad: '/docs/ref.md',
    }
    const content = await loadCapabilityContent(pkg)
    expect(fs.readFile).toHaveBeenCalledWith('/docs/ref.md', 'utf8')
    expect(content).toBe('Reference docs here.')
  })

  it('inline: returns niveauCExtrakt directly without file I/O', async () => {
    const pkg: CapabilityPackage = {
      name: 'inline-pkg',
      beschreibung: 'Inline capability.',
      loader: LoaderType.Inline,
      pfad: '',
      niveauCExtrakt: 'Inline content here.',
    }
    const content = await loadCapabilityContent(pkg)
    expect(content).toBe('Inline content here.')
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('inline: throws if niveauCExtrakt is missing', async () => {
    const pkg: CapabilityPackage = {
      name: 'bad-inline',
      beschreibung: 'Broken inline.',
      loader: LoaderType.Inline,
      pfad: '',
    }
    await expect(loadCapabilityContent(pkg)).rejects.toThrow('niveauCExtrakt')
  })
})

// ---------------------------------------------------------------------------
// capability-tree.ts
// ---------------------------------------------------------------------------

import { CapabilityTree } from '../src/main/preset/capability-tree'

const makeInline = (name: string, desc: string, content: string): CapabilityPackage => ({
  name,
  beschreibung: desc,
  loader: LoaderType.Inline,
  pfad: '',
  niveauCExtrakt: content,
})

describe('CapabilityTree — inventory and lazy-loading', () => {
  it('getInventory returns beschreibung of all packages', () => {
    const tree = new CapabilityTree([
      makeInline('a', 'Alpha capability', 'Alpha content'),
      makeInline('b', 'Beta capability', 'Beta content'),
    ])
    const inv = tree.getInventory()
    expect(inv).toHaveLength(2)
    expect(inv).toContain('Alpha capability')
    expect(inv).toContain('Beta capability')
  })

  it('isLoaded returns false before loadPackage', () => {
    const tree = new CapabilityTree([makeInline('a', 'Alpha', 'Content A')])
    expect(tree.isLoaded('a')).toBe(false)
  })

  it('getLoadedTokenCount is 0 before any loadPackage call', () => {
    const pkgs = Array.from({ length: 5 }, (_, i) =>
      makeInline(`pkg-${i}`, `Package ${i}`, `Content for package ${i}`)
    )
    const tree = new CapabilityTree(pkgs)
    expect(tree.getLoadedTokenCount()).toBe(0)
  })

  it('loadPackage loads content and isLoaded becomes true', async () => {
    const tree = new CapabilityTree([makeInline('a', 'Alpha', 'Alpha content here')])
    expect(tree.isLoaded('a')).toBe(false)
    const content = await tree.loadPackage('a')
    expect(content).toBe('Alpha content here')
    expect(tree.isLoaded('a')).toBe(true)
  })

  it('getLoadedTokenCount increases after loadPackage', async () => {
    const tree = new CapabilityTree([makeInline('a', 'Alpha', 'Alpha content here')])
    expect(tree.getLoadedTokenCount()).toBe(0)
    await tree.loadPackage('a')
    expect(tree.getLoadedTokenCount()).toBeGreaterThan(0)
  })

  it('loadPackage is idempotent (same content on repeated calls)', async () => {
    const tree = new CapabilityTree([makeInline('a', 'Alpha', 'Alpha content')])
    const first = await tree.loadPackage('a')
    const second = await tree.loadPackage('a')
    expect(first).toBe(second)
  })

  it('throws for unknown package name', async () => {
    const tree = new CapabilityTree([])
    await expect(tree.loadPackage('nonexistent')).rejects.toThrow('nonexistent')
  })

  it('5 packages: only token count of loaded packages counted', async () => {
    const pkgs = Array.from({ length: 5 }, (_, i) =>
      makeInline(`pkg-${i}`, `Package ${i}`, `Content for package ${i}`)
    )
    const tree = new CapabilityTree(pkgs)
    // Load only first package
    await tree.loadPackage('pkg-0')
    const count = tree.getLoadedTokenCount()
    // Only pkg-0 content counted, not all 5
    const expectedCount = estimateTokenCount('Content for package 0')
    expect(count).toBe(expectedCount)
  })
})

describe('CapabilityTree — dependency resolution', () => {
  it('loadPackage(A) also loads B when A depends on B', async () => {
    const pkgB = makeInline('b', 'Beta', 'Beta content')
    const pkgA: CapabilityPackage = {
      ...makeInline('a', 'Alpha', 'Alpha content'),
      abhaengigkeiten: ['b'],
    }
    const tree = new CapabilityTree([pkgA, pkgB])
    expect(tree.isLoaded('b')).toBe(false)
    await tree.loadPackage('a')
    expect(tree.isLoaded('a')).toBe(true)
    expect(tree.isLoaded('b')).toBe(true)
  })

  it('loads transitive dependencies (A→B→C)', async () => {
    const pkgC = makeInline('c', 'Gamma', 'Gamma content')
    const pkgB: CapabilityPackage = {
      ...makeInline('b', 'Beta', 'Beta content'),
      abhaengigkeiten: ['c'],
    }
    const pkgA: CapabilityPackage = {
      ...makeInline('a', 'Alpha', 'Alpha content'),
      abhaengigkeiten: ['b'],
    }
    const tree = new CapabilityTree([pkgA, pkgB, pkgC])
    await tree.loadPackage('a')
    expect(tree.isLoaded('a')).toBe(true)
    expect(tree.isLoaded('b')).toBe(true)
    expect(tree.isLoaded('c')).toBe(true)
  })
})

describe('CapabilityTree — cycle detection', () => {
  it('A→B→A throws a circular dependency error', async () => {
    const pkgA: CapabilityPackage = {
      ...makeInline('a', 'Alpha', 'Alpha'),
      abhaengigkeiten: ['b'],
    }
    const pkgB: CapabilityPackage = {
      ...makeInline('b', 'Beta', 'Beta'),
      abhaengigkeiten: ['a'],
    }
    const tree = new CapabilityTree([pkgA, pkgB])
    await expect(tree.loadPackage('a')).rejects.toThrow(/[Cc]ircular/)
  })

  it('self-referencing package throws cycle error', async () => {
    const pkgA: CapabilityPackage = {
      ...makeInline('a', 'Alpha', 'Alpha'),
      abhaengigkeiten: ['a'],
    }
    const tree = new CapabilityTree([pkgA])
    await expect(tree.loadPackage('a')).rejects.toThrow(/[Cc]ircular/)
  })
})
