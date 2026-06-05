# P1 Frontmatter System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the P1 Uebergabedokument frontmatter system — status validator, frontmatter schema with niveau A/B/C + quereinstieg, and filename convention — with full test coverage.

**Architecture:** Three focused modules under `src/main/p1/`: `status-validator.ts` (enum + transition rules), `frontmatter-schema.ts` (field validation per niveau, imports status validator), `filename-convention.ts` (generator/validator/parser, standalone). All tests in one file `tests/p1-frontmatter.test.ts`, built incrementally via TDD.

**Tech Stack:** TypeScript, Vitest, no external deps needed.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/main/p1/status-validator.ts` | `DokumentStatus` enum, `isValidDokumentStatus`, `validateStatusTransition` |
| Create | `src/main/p1/frontmatter-schema.ts` | Required/optional field sets per niveau, `validateFrontmatter(fm, niveau)` |
| Create | `src/main/p1/filename-convention.ts` | `generateFilename`, `validateFilename`, `parseFilename` |
| Create | `tests/p1-frontmatter.test.ts` | All tests (built incrementally across tasks) |

---

## Task 1: Status Validator — Failing Tests

**Files:**
- Create: `tests/p1-frontmatter.test.ts`

- [ ] **Step 1: Create test file with status section**

```typescript
// tests/p1-frontmatter.test.ts
import { describe, it, expect } from 'vitest'
import {
  DOKUMENT_STATUSES,
  isValidDokumentStatus,
  validateStatusTransition,
} from '../src/main/p1/status-validator'

// ============================================================
// CK-P1-014 — Status Enum + Transitions
// ============================================================

describe('DOKUMENT_STATUSES (CK-P1-014)', () => {
  it('contains exactly 3 values: entwurf, freigegeben, abgeloest', () => {
    expect(DOKUMENT_STATUSES).toEqual(['entwurf', 'freigegeben', 'abgeloest'])
  })
})

describe('isValidDokumentStatus', () => {
  it('accepts all 3 valid statuses', () => {
    for (const s of DOKUMENT_STATUSES) {
      expect(isValidDokumentStatus(s)).toBe(true)
    }
  })
  it('rejects invalid status strings', () => {
    expect(isValidDokumentStatus('in-review')).toBe(false)
    expect(isValidDokumentStatus('entwruf')).toBe(false)
    expect(isValidDokumentStatus('')).toBe(false)
  })
})

describe('validateStatusTransition (CK-P1-014) — all 6 non-identity combinations', () => {
  it('allows entwurf → freigegeben', () => {
    expect(validateStatusTransition('entwurf', 'freigegeben')).toBe(true)
  })
  it('allows freigegeben → abgeloest', () => {
    expect(validateStatusTransition('freigegeben', 'abgeloest')).toBe(true)
  })
  it('forbids freigegeben → entwurf', () => {
    expect(validateStatusTransition('freigegeben', 'entwurf')).toBe(false)
  })
  it('forbids abgeloest → entwurf', () => {
    expect(validateStatusTransition('abgeloest', 'entwurf')).toBe(false)
  })
  it('forbids abgeloest → freigegeben', () => {
    expect(validateStatusTransition('abgeloest', 'freigegeben')).toBe(false)
  })
  it('forbids entwurf → abgeloest (not a valid workflow step)', () => {
    expect(validateStatusTransition('entwurf', 'abgeloest')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run tests/p1-frontmatter.test.ts
```

Expected: `Error: Cannot find module '../src/main/p1/status-validator'`

---

## Task 2: Implement Status Validator

**Files:**
- Create: `src/main/p1/status-validator.ts`

- [ ] **Step 1: Create the module**

```typescript
// src/main/p1/status-validator.ts
/**
 * status-validator.ts — DokumentStatus enum and transition rules.
 * CK-P1-014: Only three status values; forbidden transitions enforced.
 */

export const DOKUMENT_STATUSES = ['entwurf', 'freigegeben', 'abgeloest'] as const
export type DokumentStatus = (typeof DOKUMENT_STATUSES)[number]

export function isValidDokumentStatus(value: string): value is DokumentStatus {
  return (DOKUMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * Returns true if the transition from → to is permitted.
 * Allowed:   entwurf → freigegeben, freigegeben → abgeloest
 * Forbidden: everything else (including reverse transitions and entwurf → abgeloest)
 */
export function validateStatusTransition(from: DokumentStatus, to: DokumentStatus): boolean {
  if (from === 'entwurf' && to === 'freigegeben') return true
  if (from === 'freigegeben' && to === 'abgeloest') return true
  return false
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npx vitest run tests/p1-frontmatter.test.ts
```

Expected: all 9 status tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/p1/status-validator.ts tests/p1-frontmatter.test.ts
git commit -m "feat(p1): status validator enum + transition rules (CK-P1-014)"
```

---

## Task 3: Frontmatter Schema — Failing Tests

**Files:**
- Modify: `tests/p1-frontmatter.test.ts` (append schema section)

- [ ] **Step 1: Append schema imports and tests to the test file**

Add these imports at the top of the file (after the existing imports):

```typescript
import {
  validateFrontmatter,
  REQUIRED_FIELDS_NIVEAU_A,
  REQUIRED_FIELDS_NIVEAU_C,
} from '../src/main/p1/frontmatter-schema'
```

Then append at the bottom:

```typescript
// ============================================================
// CK-P1-002 / CK-P1-003 / CK-P1-011 — Frontmatter Schema
// ============================================================

function validFmA(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'dokument-typ': 'spec',
    'phase': 'requirements',
    'phasenuebergang': 'requirements->architecture',
    'stand': '2026-06-05',
    'status': 'entwurf',
    'version': 'v1.0',
    'projekt': 'cipher-keel',
    'adressat': 'architect',
    'req-ids': ['REQ-001'],
    'graph-knoten-id': '01J000000000000000000000AA',
    ...overrides,
  }
}

describe('validateFrontmatter — Niveau A (CK-P1-002)', () => {
  it('accepts a fully populated Niveau-A frontmatter', () => {
    const result = validateFrontmatter(validFmA(), 'A')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts optional fields without error', () => {
    const result = validateFrontmatter(
      validFmA({ subsystem: 'auth', 'strang-id': 'S-01' }),
      'A'
    )
    expect(result.valid).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(validateFrontmatter(null, 'A').valid).toBe(false)
    expect(validateFrontmatter('string', 'A').valid).toBe(false)
    expect(validateFrontmatter(42, 'A').valid).toBe(false)
  })

  // One test per required field
  const requiredFields = [
    'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status',
    'version', 'projekt', 'adressat', 'req-ids', 'graph-knoten-id',
  ]
  for (const field of requiredFields) {
    it(`rejects frontmatter missing required field '${field}'`, () => {
      const fm = validFmA()
      delete fm[field]
      const result = validateFrontmatter(fm, 'A')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === field)).toBe(true)
    })
  }

  it('error for missing field includes field name and expectedType', () => {
    const fm = validFmA()
    delete fm['dokument-typ']
    const result = validateFrontmatter(fm, 'A')
    const err = result.errors.find(e => e.field === 'dokument-typ')
    expect(err).toBeDefined()
    expect(err?.expectedType).toBeDefined()
  })

  it('rejects invalid status value', () => {
    const result = validateFrontmatter(validFmA({ status: 'in-review' }), 'A')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'status')).toBe(true)
  })
})

describe('validateFrontmatter — Niveau B (CK-P1-003)', () => {
  it('accepts frontmatter without graph-knoten-id on Niveau B', () => {
    const fm = validFmA()
    delete fm['graph-knoten-id']
    expect(validateFrontmatter(fm, 'B').valid).toBe(true)
  })

  it('still requires the other 9 fields on Niveau B', () => {
    const fm = validFmA()
    delete fm['graph-knoten-id']
    delete fm['adressat']
    const result = validateFrontmatter(fm, 'B')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'adressat')).toBe(true)
  })
})

describe('validateFrontmatter — Niveau C (CK-P1-003)', () => {
  it('accepts frontmatter with only 7 core fields', () => {
    const fm: Record<string, unknown> = {
      'dokument-typ': 'spec',
      'phase': 'requirements',
      'phasenuebergang': 'requirements->architecture',
      'stand': '2026-06-05',
      'status': 'entwurf',
      'version': 'v1.0',
      'projekt': 'cipher-keel',
    }
    expect(validateFrontmatter(fm, 'C').valid).toBe(true)
  })

  it('rejects Niveau-C frontmatter missing one of the 7 core fields', () => {
    const fm: Record<string, unknown> = {
      'dokument-typ': 'spec',
      'phase': 'requirements',
      'phasenuebergang': 'requirements->architecture',
      'stand': '2026-06-05',
      'status': 'entwurf',
      'version': 'v1.0',
      // missing 'projekt'
    }
    const result = validateFrontmatter(fm, 'C')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'projekt')).toBe(true)
  })
})

describe('validateFrontmatter — Quereinstieg (CK-P1-011)', () => {
  it('accepts quereinstieg: true as an optional field', () => {
    const result = validateFrontmatter(validFmA({ quereinstieg: true }), 'A')
    expect(result.valid).toBe(true)
  })

  it('validates without vorgaenger-dokument when quereinstieg: true', () => {
    // vorgaenger-dokument is optional; quereinstieg: true must not require it
    const fm = validFmA({
      'dokument-typ': 'architektur-paket',
      quereinstieg: true,
      'quereinstieg-begruendung': 'Direkteinstieg aus Legacy-System',
      'phaseninput-quelle': '01J000000000000000000000BB',
    })
    expect(validateFrontmatter(fm, 'A').valid).toBe(true)
  })

  it('accepts all three quereinstieg-related optional fields together', () => {
    const fm = validFmA({
      quereinstieg: true,
      'quereinstieg-begruendung': 'Direkt aus Architektur-Paket',
      'phaseninput-quelle': '01J000000000000000000000CC',
    })
    expect(validateFrontmatter(fm, 'A').valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
npx vitest run tests/p1-frontmatter.test.ts
```

Expected: `Error: Cannot find module '../src/main/p1/frontmatter-schema'`

---

## Task 4: Implement Frontmatter Schema

**Files:**
- Create: `src/main/p1/frontmatter-schema.ts`

- [ ] **Step 1: Create the module**

```typescript
// src/main/p1/frontmatter-schema.ts
/**
 * frontmatter-schema.ts — Frontmatter field definitions and validation.
 * CK-P1-002: 10 required + 4+ optional fields, ValidationResult per niveau.
 * CK-P1-003: Niveau A/B/C require different field sets.
 * CK-P1-011: Quereinstieg optional fields accepted.
 */

import { isValidDokumentStatus } from './status-validator'

export type Niveau = 'A' | 'B' | 'C'

export interface FrontmatterValidationError {
  field: string
  message: string
  expectedType?: string
}

export interface ValidationResult {
  valid: boolean
  errors: FrontmatterValidationError[]
}

// Niveau A: all 10 fields required
export const REQUIRED_FIELDS_NIVEAU_A = [
  'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status',
  'version', 'projekt', 'adressat', 'req-ids', 'graph-knoten-id',
] as const

// Niveau B: 9 fields (graph-knoten-id optional)
export const REQUIRED_FIELDS_NIVEAU_B = [
  'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status',
  'version', 'projekt', 'adressat', 'req-ids',
] as const

// Niveau C: 7 core fields only
export const REQUIRED_FIELDS_NIVEAU_C = [
  'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status', 'version', 'projekt',
] as const

// All optional fields (including CK-P1-011 quereinstieg fields)
export const OPTIONAL_FIELDS = [
  'subsystem', 'strang-id', 'vorgaenger-dokument', 'quereinstieg',
  'quereinstieg-begruendung', 'phaseninput-quelle',
] as const

function requiredFieldsFor(niveau: Niveau): readonly string[] {
  if (niveau === 'A') return REQUIRED_FIELDS_NIVEAU_A
  if (niveau === 'B') return REQUIRED_FIELDS_NIVEAU_B
  return REQUIRED_FIELDS_NIVEAU_C
}

export function validateFrontmatter(fm: unknown, niveau: Niveau): ValidationResult {
  const errors: FrontmatterValidationError[] = []

  if (typeof fm !== 'object' || fm === null || Array.isArray(fm)) {
    return {
      valid: false,
      errors: [{ field: 'frontmatter', message: 'must be a non-null object', expectedType: 'object' }],
    }
  }

  const obj = fm as Record<string, unknown>

  for (const field of requiredFieldsFor(niveau)) {
    const val = obj[field]
    if (val === undefined || val === null || val === '') {
      errors.push({ field, message: `missing required field '${field}'`, expectedType: 'string' })
    }
  }

  // Validate status enum if present and non-empty
  if (obj['status'] !== undefined && obj['status'] !== null && obj['status'] !== '') {
    if (!isValidDokumentStatus(String(obj['status']))) {
      errors.push({
        field: 'status',
        message: `invalid status value '${obj['status']}'`,
        expectedType: 'entwurf | freigegeben | abgeloest',
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npx vitest run tests/p1-frontmatter.test.ts
```

Expected: all status + schema tests PASS (the missing-field loop generates 10 individual tests for Niveau A alone).

- [ ] **Step 3: Commit**

```bash
git add src/main/p1/frontmatter-schema.ts tests/p1-frontmatter.test.ts
git commit -m "feat(p1): frontmatter schema validator niveau A/B/C + quereinstieg (CK-P1-002, CK-P1-003, CK-P1-011)"
```

---

## Task 5: Filename Convention — Failing Tests

**Files:**
- Modify: `tests/p1-frontmatter.test.ts` (append filename section)

- [ ] **Step 1: Append filename imports and tests**

Add to the imports at the top of the test file:

```typescript
import {
  generateFilename,
  validateFilename,
  parseFilename,
  DOKUMENT_TYPEN,
} from '../src/main/p1/filename-convention'
```

Then append at the bottom:

```typescript
// ============================================================
// CK-P1-005 — Filename Convention
// ============================================================

describe('DOKUMENT_TYPEN', () => {
  it('contains all 7 document types', () => {
    expect(DOKUMENT_TYPEN).toContain('anforderungen')
    expect(DOKUMENT_TYPEN).toContain('spec')
    expect(DOKUMENT_TYPEN).toContain('architektur-paket')
    expect(DOKUMENT_TYPEN).toContain('build-paket')
    expect(DOKUMENT_TYPEN).toContain('test-findings')
    expect(DOKUMENT_TYPEN).toContain('fix-report')
    expect(DOKUMENT_TYPEN).toContain('audit-summary')
    expect(DOKUMENT_TYPEN).toHaveLength(7)
  })
})

describe('generateFilename (CK-P1-005)', () => {
  it('generates filename without subsystem', () => {
    expect(generateFilename('anforderungen')).toBe('anforderungen.md')
  })

  it('generates filename with subsystem', () => {
    expect(generateFilename('test-findings', 'api')).toBe('test-findings_api.md')
  })

  it('generates filename with subsystem and version', () => {
    expect(generateFilename('test-findings', 'api', 'v1.1')).toBe('test-findings_api_v1.1.md')
  })

  it('generates filename with version but no subsystem', () => {
    expect(generateFilename('spec', undefined, 'v1.1')).toBe('spec_v1.1.md')
  })

  it('generates correct filenames for all 7 document types', () => {
    for (const typ of DOKUMENT_TYPEN) {
      expect(generateFilename(typ)).toBe(`${typ}.md`)
    }
  })
})

describe('validateFilename (CK-P1-005)', () => {
  it('accepts valid filename without subsystem: spec.md', () => {
    expect(validateFilename('spec.md')).toBe(true)
  })

  it('accepts valid filename with subsystem: test-findings_api.md', () => {
    expect(validateFilename('test-findings_api.md')).toBe(true)
  })

  it('accepts valid filename with subsystem and version: test-findings_api_v1.1.md', () => {
    expect(validateFilename('test-findings_api_v1.1.md')).toBe(true)
  })

  it('rejects filename with invalid document type', () => {
    expect(validateFilename('unknown-type.md')).toBe(false)
  })

  it('rejects filename without .md extension', () => {
    expect(validateFilename('spec.txt')).toBe(false)
    expect(validateFilename('spec')).toBe(false)
  })

  it('rejects empty filename', () => {
    expect(validateFilename('')).toBe(false)
  })
})

describe('parseFilename (CK-P1-005)', () => {
  it('parses filename without subsystem or version', () => {
    expect(parseFilename('spec.md')).toEqual({ dokumentTyp: 'spec' })
  })

  it('parses filename with subsystem', () => {
    expect(parseFilename('test-findings_api.md')).toEqual({
      dokumentTyp: 'test-findings',
      subsystem: 'api',
    })
  })

  it('parses filename with subsystem and version', () => {
    expect(parseFilename('test-findings_api_v1.1.md')).toEqual({
      dokumentTyp: 'test-findings',
      subsystem: 'api',
      version: 'v1.1',
    })
  })

  it('parses anforderungen.md correctly', () => {
    expect(parseFilename('anforderungen.md')).toEqual({ dokumentTyp: 'anforderungen' })
  })

  it('parses architektur-paket_auth.md correctly', () => {
    expect(parseFilename('architektur-paket_auth.md')).toEqual({
      dokumentTyp: 'architektur-paket',
      subsystem: 'auth',
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
npx vitest run tests/p1-frontmatter.test.ts
```

Expected: `Error: Cannot find module '../src/main/p1/filename-convention'`

---

## Task 6: Implement Filename Convention

**Files:**
- Create: `src/main/p1/filename-convention.ts`

- [ ] **Step 1: Create the module**

```typescript
// src/main/p1/filename-convention.ts
/**
 * filename-convention.ts — Filename generator, validator, and parser.
 * CK-P1-005: <dokument-typ>.md or <dokument-typ>_<subsystem>.md
 *            with optional _<version> suffix for testing-fixing loops.
 */

export const DOKUMENT_TYPEN = [
  'anforderungen',
  'spec',
  'architektur-paket',
  'build-paket',
  'test-findings',
  'fix-report',
  'audit-summary',
] as const

export type DokumentTyp = (typeof DOKUMENT_TYPEN)[number]

/**
 * Generates a filename following the P1 naming convention.
 * - `<dokument-typ>.md`
 * - `<dokument-typ>_<subsystem>.md`
 * - `<dokument-typ>_<subsystem>_<version>.md`  (Testing-Fixing-Loop)
 * - `<dokument-typ>_<version>.md`              (version without subsystem)
 */
export function generateFilename(
  dokumentTyp: string,
  subsystem?: string,
  version?: string,
): string {
  let name = dokumentTyp
  if (subsystem) name += `_${subsystem}`
  if (version) name += `_${version}`
  return `${name}.md`
}

/**
 * Returns true if `filename` follows the P1 naming convention:
 * - ends with .md
 * - first segment (before first `_`) is a valid DOKUMENT_TYP
 */
export function validateFilename(filename: string): boolean {
  if (!filename.endsWith('.md')) return false
  const base = filename.slice(0, -3)
  if (!base) return false
  const firstSegment = base.split('_')[0]
  return (DOKUMENT_TYPEN as readonly string[]).includes(firstSegment)
}

/**
 * Parses a P1 filename back into its components.
 * Assumes the filename is well-formed (caller may validate first).
 * Version is detected by pattern /^v\d+\.\d+$/.
 */
export function parseFilename(filename: string): {
  dokumentTyp: string
  subsystem?: string
  version?: string
} {
  const base = filename.replace(/\.md$/, '')
  const parts = base.split('_')
  const dokumentTyp = parts[0]

  if (parts.length === 1) return { dokumentTyp }

  const lastPart = parts[parts.length - 1]
  const isVersion = /^v\d+\.\d+$/.test(lastPart)

  if (parts.length === 2) {
    return isVersion
      ? { dokumentTyp, version: lastPart }
      : { dokumentTyp, subsystem: lastPart }
  }

  // 3+ parts
  if (isVersion) {
    const subsystem = parts.slice(1, -1).join('_')
    return { dokumentTyp, subsystem, version: lastPart }
  }

  return { dokumentTyp, subsystem: parts.slice(1).join('_') }
}
```

- [ ] **Step 2: Run full test suite — expect all PASS**

```bash
npx vitest run tests/p1-frontmatter.test.ts
```

Expected: all tests PASS. Count should be roughly 35+ tests.

- [ ] **Step 3: Run complete project test suite**

```bash
npm test
```

Expected: all existing tests still PASS, new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/p1/filename-convention.ts tests/p1-frontmatter.test.ts
git commit -m "feat(p1): filename convention generator/validator/parser (CK-P1-005)"
```

---

## Task 7: Finalize — mux_send notification

- [ ] **Step 1: Confirm all tests pass**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 2: Send completion report via mux_send**

Call `mux_send` to session `01KTBQD9DJZQT19XTJ8FHGTQKE`:

```
W2B fertig: [src/main/p1/status-validator.ts, src/main/p1/frontmatter-schema.ts, src/main/p1/filename-convention.ts, tests/p1-frontmatter.test.ts] [35+ Tests, alle gruen]
```

---

## Self-Review

**Spec coverage:**
- CK-P1-002 (10 Pflichtfelder, Validierungsfehler mit Feld+Typ): Task 3+4 ✓
- CK-P1-003 (Niveau A/B/C): Task 3+4 ✓
- CK-P1-005 (Dateiname-Konvention, Generator, Validator, Parser): Task 5+6 ✓
- CK-P1-011 (Quereinstieg-Felder, Validierung ohne Vorgaenger): Task 3+4 ✓
- CK-P1-014 (Status-Enum, 3 Werte, Uebergangsregeln): Task 1+2 ✓

**Type consistency check:**
- `validateFrontmatter` used consistently in Tasks 3+4
- `REQUIRED_FIELDS_NIVEAU_A` / `REQUIRED_FIELDS_NIVEAU_C` exported and used in tests
- `DOKUMENT_TYPEN` exported and used in tests
- `DokumentStatus` type used by `validateStatusTransition` — consistent throughout
- `ValidationResult` interface matches what `validateFrontmatter` returns

**Placeholder scan:** No TBDs, all code is complete.
