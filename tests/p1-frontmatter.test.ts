/**
 * P1 Frontmatter System Tests
 * CK-P1-002, CK-P1-003, CK-P1-005, CK-P1-011, CK-P1-014
 */

import { describe, it, expect } from 'vitest'
import {
  DOKUMENT_STATUSES,
  isValidDokumentStatus,
  validateStatusTransition,
} from '../src/main/p1/status-validator'
import {
  validateFrontmatter,
  REQUIRED_FIELDS_NIVEAU_A,
  REQUIRED_FIELDS_NIVEAU_C,
} from '../src/main/p1/frontmatter-schema'
import {
  generateFilename,
  validateFilename,
  parseFilename,
  DOKUMENT_TYPEN,
} from '../src/main/p1/filename-convention'

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
    // Guard against drift: the per-field loop below is parameterized over
    // REQUIRED_FIELDS_NIVEAU_A, so it cannot detect that constant itself shrinking or
    // growing (a dropped field would just generate no test case for it, silently). This
    // literal is an independent oracle, deliberately not derived from the constant.
    expect([...REQUIRED_FIELDS_NIVEAU_A].sort()).toEqual([
      'dokument-typ', 'phase', 'phasenuebergang', 'stand', 'status',
      'version', 'projekt', 'adressat', 'req-ids', 'graph-knoten-id',
    ].sort())

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
  for (const field of REQUIRED_FIELDS_NIVEAU_A) {
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
    // Guard against drift: this literal must cover exactly the real Niveau-C field set.
    expect(Object.keys(fm).sort()).toEqual([...REQUIRED_FIELDS_NIVEAU_C].sort())
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

// ============================================================
// CK-P1-005 — Filename Convention
// ============================================================

describe('DOKUMENT_TYPEN', () => {
  it('contains all 9 document types', () => {
    expect(DOKUMENT_TYPEN).toContain('anforderungen')
    expect(DOKUMENT_TYPEN).toContain('spec')
    expect(DOKUMENT_TYPEN).toContain('architektur-paket')
    expect(DOKUMENT_TYPEN).toContain('build-paket')
    expect(DOKUMENT_TYPEN).toContain('test-findings')
    expect(DOKUMENT_TYPEN).toContain('fix-report')
    expect(DOKUMENT_TYPEN).toContain('audit-summary')
    expect(DOKUMENT_TYPEN).toContain('rueckweg-befund')
    expect(DOKUMENT_TYPEN).toContain('architect-handoff')
    expect(DOKUMENT_TYPEN).toHaveLength(9)
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
