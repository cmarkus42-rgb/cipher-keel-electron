/**
 * Phase B tests — Node Types.
 * CK-GRAPH-003 to 011, CK-GRAPH-041
 */

import { describe, it, expect } from 'vitest'
import {
  NODE_KINDS,
  NODE_STATUSES,
  REQUIRED_FRONTMATTER_FIELDS,
  ALLOWED_FRONTMATTER_FIELDS,
  isValidKind,
  isValidStatus,
  type NodeKind
} from '../../src/main/graph/node-types'

describe('NODE_KINDS', () => {
  it('contains all 11 types', () => {
    expect(NODE_KINDS).toHaveLength(11)
    const expected: NodeKind[] = [
      'anforderung', 'entscheidung', 'artefakt', 'test',
      'note', 'phase_subsystem', 'anlass', 'github_repo', 'phase',
      'uebergabedokument'
    ]
    for (const k of expected) {
      expect(NODE_KINDS).toContain(k)
    }
  })
})

describe('NODE_STATUSES (CK-GRAPH-016)', () => {
  it('contains exactly aktiv, abgeloest, verworfen', () => {
    expect(NODE_STATUSES).toEqual(['aktiv', 'abgeloest', 'verworfen'])
  })
})

describe('isValidKind', () => {
  it('accepts all 10 types', () => {
    for (const k of NODE_KINDS) {
      expect(isValidKind(k)).toBe(true)
    }
  })
  it('rejects unknown type', () => {
    expect(isValidKind('widget')).toBe(false)
  })
})

describe('isValidStatus', () => {
  it('accepts valid statuses', () => {
    for (const s of NODE_STATUSES) {
      expect(isValidStatus(s)).toBe(true)
    }
  })
  it('rejects invalid status', () => {
    expect(isValidStatus('archived')).toBe(false)
  })
})

describe('Schema registry (CK-GRAPH-041)', () => {
  it('every kind has an entry in REQUIRED_FRONTMATTER_FIELDS', () => {
    for (const k of NODE_KINDS) {
      expect(REQUIRED_FRONTMATTER_FIELDS).toHaveProperty(k)
    }
  })

  it('every kind has an entry in ALLOWED_FRONTMATTER_FIELDS', () => {
    for (const k of NODE_KINDS) {
      expect(ALLOWED_FRONTMATTER_FIELDS).toHaveProperty(k)
    }
  })

  it('github_repo requires url (CK-GRAPH-010)', () => {
    expect(REQUIRED_FRONTMATTER_FIELDS.github_repo).toContain('url')
  })

  it('anforderung has quelle and prioritaet fields (CK-GRAPH-003)', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.anforderung).toContain('quelle')
    expect(ALLOWED_FRONTMATTER_FIELDS.anforderung).toContain('prioritaet')
  })

  it('entscheidung has begruendung and alternativen fields (CK-GRAPH-004)', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.entscheidung).toContain('begruendung')
    expect(ALLOWED_FRONTMATTER_FIELDS.entscheidung).toContain('alternativen')
  })

  it('artefakt has pfad and sprache_art fields (CK-GRAPH-005)', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.artefakt).toContain('artefakt_pfad')
    expect(ALLOWED_FRONTMATTER_FIELDS.artefakt).toContain('sprache_art')
  })

  it('test has testart and ergebnis fields (CK-GRAPH-006)', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.test).toContain('testart')
    expect(ALLOWED_FRONTMATTER_FIELDS.test).toContain('ergebnis')
  })

  it('note has notetyp field (CK-GRAPH-007)', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.note).toContain('notetyp')
  })

  it('phase_subsystem has ebene field (CK-GRAPH-008)', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.phase_subsystem).toContain('ebene')
  })

  it('anlass has session, zeitpunkt, handoff_referenz fields (CK-GRAPH-009)', () => {
    const fields = ALLOWED_FRONTMATTER_FIELDS.anlass
    expect(fields).toContain('session')
    expect(fields).toContain('zeitpunkt')
    expect(fields).toContain('handoff_referenz')
  })
})
