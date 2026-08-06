# Capability System (W1B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the modular capability tree with lazy-loading and package schema (CK-ENT-006, CK-ENT-007, CK-ENT-017).

**Architecture:** Three focused files — `capability-schema.ts` (types + validation), `capability-tree.ts` (lazy-load orchestrator with dependency + cycle resolution), `capability-loader.ts` (loader-type dispatcher). Worker 1A types are not yet present; local interfaces used that can be replaced later.

**Tech Stack:** TypeScript, vitest, Node.js `fs/promises`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/main/preset/capability-schema.ts` | `LoaderType` enum, `CapabilityPackage` interface, `ValidationResult`, `validateCapabilityPackage`, `estimateTokenCount` helper |
| `src/main/preset/capability-tree.ts` | `CapabilityTree` class — lazy-load orchestrator, dependency resolution, cycle detection |
| `src/main/preset/capability-loader.ts` | `loadCapabilityContent` — dispatch by loader type, file I/O |
| `tests/capability-system.test.ts` | All tests for the three modules |

---

## Task 1: capability-schema.ts

**Files:**
- Create: `src/main/preset/capability-schema.ts`

- [ ] **Step 1: Write failing test for schema validation**

```typescript
// tests/capability-system.test.ts (initial skeleton)
import { describe, it, expect } from 'vitest'
import {
  LoaderType,
  validateCapabilityPackage,
  estimateTokenCount,
  type CapabilityPackage,
} from '../src/main/preset/capability-schema'

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

  it('rejects a package missing name', () => {
    const pkg = {
      beschreibung: 'A short description.',
      loader: LoaderType.Inline,
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('name'))).toBe(true)
  })

  it('rejects a package with beschreibung exceeding 100 tokens', () => {
    const longDesc = 'word '.repeat(450) // ~450 words → ~450*5/4 = ~562 tokens
    const pkg = {
      name: 'bloated-pkg',
      beschreibung: longDesc,
      loader: LoaderType.Inline,
      pfad: '/some/path',
    }
    const result = validateCapabilityPackage(pkg)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('beschreibung'))).toBe(true)
  })
})

describe('estimateTokenCount', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0)
  })

  it('estimates ~1 token per 4 chars', () => {
    // 400 chars → 100 tokens
    const text = 'a'.repeat(400)
    expect(estimateTokenCount(text)).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd <repo-root> && npm test -- --reporter=verbose tests/capability-system.test.ts 2>&1 | head -30
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Write capability-schema.ts**

```typescript
// src/main/preset/capability-schema.ts

export enum LoaderType {
  SkillMd = 'skill-md',
  NanoClawSkill = 'nanoclaw-skill',
  ReferenceMaterial = 'reference-material',
  Inline = 'inline',
}

export interface CapabilityPackage {
  /** Unique identifier for this capability package */
  name: string
  /** Short description for the inventory (≤ 100 tokens / ~400 chars heuristic) */
  beschreibung: string
  /** How this package is loaded at runtime */
  loader: LoaderType
  /** Path to the package file (or channel route for nanoclaw-skill) */
  pfad: string
  /** Minimum capability level required to load this package */
  niveauMinimum?: 'A' | 'B' | 'C'
  /** Inline extract for Level C (≤ 500 tokens). Required when loader is 'inline'. */
  niveauCExtrakt?: string
  /** Names of other packages this package depends on */
  abhaengigkeiten?: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/** Estimate token count using ~4 chars per token heuristic. */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}

const VALID_LOADER_TYPES = new Set<string>(Object.values(LoaderType))

export function validateCapabilityPackage(pkg: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof pkg !== 'object' || pkg === null) {
    return { valid: false, errors: ['Package must be a non-null object'] }
  }

  const p = pkg as Record<string, unknown>

  // Required: name
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    errors.push('name is required and must be a non-empty string')
  }

  // Required: beschreibung + token check
  if (typeof p.beschreibung !== 'string' || p.beschreibung.trim() === '') {
    errors.push('beschreibung is required and must be a non-empty string')
  } else if (estimateTokenCount(p.beschreibung) > 100) {
    errors.push(
      `beschreibung exceeds 100 tokens (estimated ${estimateTokenCount(p.beschreibung)} tokens)`
    )
  }

  // Required: loader
  if (typeof p.loader !== 'string' || !VALID_LOADER_TYPES.has(p.loader)) {
    errors.push(
      `loader must be one of: ${Array.from(VALID_LOADER_TYPES).join(', ')}`
    )
  }

  // Required: pfad
  if (typeof p.pfad !== 'string' || p.pfad.trim() === '') {
    errors.push('pfad is required and must be a non-empty string')
  }

  // Optional: niveauMinimum
  if (p.niveauMinimum !== undefined) {
    if (!['A', 'B', 'C'].includes(p.niveauMinimum as string)) {
      errors.push('niveauMinimum must be A, B, or C')
    }
  }

  // Optional: abhaengigkeiten
  if (p.abhaengigkeiten !== undefined) {
    if (
      !Array.isArray(p.abhaengigkeiten) ||
      p.abhaengigkeiten.some((d) => typeof d !== 'string')
    ) {
      errors.push('abhaengigkeiten must be an array of strings')
    }
  }

  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd <repo-root> && npm test -- tests/capability-system.test.ts 2>&1 | tail -20
```
Expected: PASS (schema validation tests)

- [ ] **Step 5: Commit**

```bash
cd <repo-root> && git add src/main/preset/capability-schema.ts tests/capability-system.test.ts && git commit -m "feat(preset): CK-ENT-007 capability-schema — LoaderType, CapabilityPackage, validateCapabilityPackage"
```

---

## Task 2: capability-loader.ts

**Files:**
- Create: `src/main/preset/capability-loader.ts`
- Modify: `tests/capability-system.test.ts`

- [ ] **Step 1: Add loader dispatch tests**

Append to `tests/capability-system.test.ts`:

```typescript
import { vi } from 'vitest'
import * as fs from 'fs/promises'
import { loadCapabilityContent } from '../src/main/preset/capability-loader'

vi.mock('fs/promises')

describe('loadCapabilityContent', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('skill-md: reads file content', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# My Skill\nDo things.' as any)
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

  it('nanoclaw-skill: returns JSON payload', async () => {
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
  })

  it('reference-material: reads file as reference', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('Reference docs here.' as any)
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

  it('inline: returns niveauCExtrakt directly', async () => {
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
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
cd <repo-root> && npm test -- tests/capability-system.test.ts 2>&1 | tail -20
```
Expected: FAIL — "Cannot find module '../src/main/preset/capability-loader'"

- [ ] **Step 3: Write capability-loader.ts**

```typescript
// src/main/preset/capability-loader.ts

import { readFile } from 'fs/promises'
import { LoaderType, type CapabilityPackage } from './capability-schema'

/**
 * Load the full content of a capability package based on its loader type.
 *
 * - skill-md: reads the file at `pfad` (SKILL.md for Level A)
 * - nanoclaw-skill: returns a JSON payload for the NanoClaw channel
 * - reference-material: reads the file at `pfad` as reference material
 * - inline: returns `niveauCExtrakt` directly
 *
 * Dependency resolution and cycle detection are handled by CapabilityTree.
 */
export async function loadCapabilityContent(pkg: CapabilityPackage): Promise<string> {
  switch (pkg.loader) {
    case LoaderType.SkillMd:
      return readFile(pkg.pfad, 'utf8')

    case LoaderType.NanoClawSkill:
      return JSON.stringify({ type: 'nanoclaw-skill', name: pkg.name, pfad: pkg.pfad })

    case LoaderType.ReferenceMaterial:
      return readFile(pkg.pfad, 'utf8')

    case LoaderType.Inline: {
      if (!pkg.niveauCExtrakt) {
        throw new Error(
          `Capability package '${pkg.name}' has loader 'inline' but no niveauCExtrakt defined`
        )
      }
      return pkg.niveauCExtrakt
    }

    default: {
      const _exhaustive: never = pkg.loader
      throw new Error(`Unknown loader type: ${_exhaustive}`)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd <repo-root> && npm test -- tests/capability-system.test.ts 2>&1 | tail -20
```
Expected: PASS (schema + loader tests)

- [ ] **Step 5: Commit**

```bash
cd <repo-root> && git add src/main/preset/capability-loader.ts tests/capability-system.test.ts && git commit -m "feat(preset): CK-ENT-006/007 capability-loader — dispatch by LoaderType"
```

---

## Task 3: capability-tree.ts

**Files:**
- Create: `src/main/preset/capability-tree.ts`
- Modify: `tests/capability-system.test.ts`

- [ ] **Step 1: Add capability tree tests**

Append to `tests/capability-system.test.ts`:

```typescript
import { CapabilityTree } from '../src/main/preset/capability-tree'

describe('CapabilityTree — lazy loading', () => {
  const makeInlinePkg = (name: string, desc: string, content: string): CapabilityPackage => ({
    name,
    beschreibung: desc,
    loader: LoaderType.Inline,
    pfad: '',
    niveauCExtrakt: content,
  })

  it('getInventory returns beschreibung of all packages', () => {
    const pkgs = [
      makeInlinePkg('a', 'Alpha capability', 'Alpha content'),
      makeInlinePkg('b', 'Beta capability', 'Beta content'),
    ]
    const tree = new CapabilityTree(pkgs)
    const inv = tree.getInventory()
    expect(inv).toHaveLength(2)
    expect(inv).toContain('Alpha capability')
    expect(inv).toContain('Beta capability')
  })

  it('isLoaded returns false before loadPackage', () => {
    const tree = new CapabilityTree([
      makeInlinePkg('a', 'Alpha', 'Content A'),
    ])
    expect(tree.isLoaded('a')).toBe(false)
  })

  it('getLoadedTokenCount is 0 before any loadPackage', () => {
    const pkgs = Array.from({ length: 5 }, (_, i) =>
      makeInlinePkg(`pkg-${i}`, `Package ${i}`, `Content for package ${i}`)
    )
    const tree = new CapabilityTree(pkgs)
    expect(tree.getLoadedTokenCount()).toBe(0)
  })

  it('loadPackage loads content and updates token count', async () => {
    const tree = new CapabilityTree([
      makeInlinePkg('a', 'Alpha', 'Alpha content here'),
    ])
    expect(tree.getLoadedTokenCount()).toBe(0)
    const content = await tree.loadPackage('a')
    expect(content).toBe('Alpha content here')
    expect(tree.isLoaded('a')).toBe(true)
    expect(tree.getLoadedTokenCount()).toBeGreaterThan(0)
  })

  it('loadPackage is idempotent (does not re-load)', async () => {
    const tree = new CapabilityTree([
      makeInlinePkg('a', 'Alpha', 'Alpha content'),
    ])
    const first = await tree.loadPackage('a')
    const second = await tree.loadPackage('a')
    expect(first).toBe(second)
  })

  it('throws for unknown package name', async () => {
    const tree = new CapabilityTree([])
    await expect(tree.loadPackage('nonexistent')).rejects.toThrow("nonexistent")
  })
})

describe('CapabilityTree — dependency resolution', () => {
  it('loadPackage(A) also loads B when A depends on B', async () => {
    const pkgB: CapabilityPackage = {
      name: 'b',
      beschreibung: 'Beta',
      loader: LoaderType.Inline,
      pfad: '',
      niveauCExtrakt: 'Beta content',
    }
    const pkgA: CapabilityPackage = {
      name: 'a',
      beschreibung: 'Alpha',
      loader: LoaderType.Inline,
      pfad: '',
      niveauCExtrakt: 'Alpha content',
      abhaengigkeiten: ['b'],
    }
    const tree = new CapabilityTree([pkgA, pkgB])
    expect(tree.isLoaded('b')).toBe(false)
    await tree.loadPackage('a')
    expect(tree.isLoaded('a')).toBe(true)
    expect(tree.isLoaded('b')).toBe(true)
  })
})

describe('CapabilityTree — cycle detection', () => {
  it('A→B→A throws a cycle error', async () => {
    const pkgA: CapabilityPackage = {
      name: 'a',
      beschreibung: 'Alpha',
      loader: LoaderType.Inline,
      pfad: '',
      niveauCExtrakt: 'Alpha',
      abhaengigkeiten: ['b'],
    }
    const pkgB: CapabilityPackage = {
      name: 'b',
      beschreibung: 'Beta',
      loader: LoaderType.Inline,
      pfad: '',
      niveauCExtrakt: 'Beta',
      abhaengigkeiten: ['a'],
    }
    const tree = new CapabilityTree([pkgA, pkgB])
    await expect(tree.loadPackage('a')).rejects.toThrow(/[Cc]ircular/)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
cd <repo-root> && npm test -- tests/capability-system.test.ts 2>&1 | tail -20
```
Expected: FAIL — "Cannot find module '../src/main/preset/capability-tree'"

- [ ] **Step 3: Write capability-tree.ts**

```typescript
// src/main/preset/capability-tree.ts

import { estimateTokenCount, type CapabilityPackage } from './capability-schema'
import { loadCapabilityContent } from './capability-loader'

/**
 * CapabilityTree manages a set of capability packages with lazy-loading.
 *
 * - Inventory (short descriptions) is always available for the system prompt
 * - Full package content is only loaded on demand via loadPackage()
 * - Dependencies are resolved recursively; cycles throw an error
 */
export class CapabilityTree {
  private readonly packages: Map<string, CapabilityPackage>
  private readonly loaded: Map<string, string>

  constructor(packages: CapabilityPackage[]) {
    this.packages = new Map(packages.map((p) => [p.name, p]))
    this.loaded = new Map()
  }

  /** Returns short descriptions of all packages for the system prompt inventory. */
  getInventory(): string[] {
    return Array.from(this.packages.values()).map((p) => p.beschreibung)
  }

  /** Returns true if the package has been loaded into memory. */
  isLoaded(name: string): boolean {
    return this.loaded.has(name)
  }

  /**
   * Loads the full content of a package (and its dependencies) on demand.
   * Throws if the package is not found or a circular dependency is detected.
   */
  async loadPackage(name: string): Promise<string> {
    return this._loadPackage(name, new Set<string>())
  }

  /** Estimated token count of all currently loaded package contents. */
  getLoadedTokenCount(): number {
    let total = 0
    for (const content of this.loaded.values()) {
      total += estimateTokenCount(content)
    }
    return total
  }

  private async _loadPackage(name: string, visiting: Set<string>): Promise<string> {
    if (this.loaded.has(name)) return this.loaded.get(name)!

    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected: '${name}' is already in the loading chain`)
    }

    const pkg = this.packages.get(name)
    if (!pkg) {
      throw new Error(`Capability package '${name}' not found in this tree`)
    }

    const nextVisiting = new Set(visiting)
    nextVisiting.add(name)

    for (const dep of pkg.abhaengigkeiten ?? []) {
      await this._loadPackage(dep, nextVisiting)
    }

    const content = await loadCapabilityContent(pkg)
    this.loaded.set(name, content)
    return content
  }
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd <repo-root> && npm test -- tests/capability-system.test.ts 2>&1 | tail -30
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root> && git add src/main/preset/capability-tree.ts tests/capability-system.test.ts && git commit -m "feat(preset): CK-ENT-006/017 capability-tree — lazy-loading, dependency resolution, cycle detection"
```

---

## Task 4: Full test suite run + mux_send

**Files:** none new

- [ ] **Step 1: Run full test suite**

```bash
cd <repo-root> && npm test 2>&1 | tail -30
```
Expected: All tests pass (existing + new capability-system tests)

- [ ] **Step 2: Send completion signal via mux_send**

Send to `01KTBQD9DJZQT19XTJ8FHGTQKE`:
"W1B fertig: [capability-schema.ts, capability-loader.ts, capability-tree.ts] [tests/capability-system.test.ts — N tests]"
