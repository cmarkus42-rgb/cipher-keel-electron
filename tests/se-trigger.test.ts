/**
 * SE Trigger Node + SE Edge Types — type-level tests.
 * Phase 3c / Task 1
 */

import { describe, it, expect } from 'vitest'
import {
  NODE_KINDS,
  isValidKind,
  REQUIRED_FRONTMATTER_FIELDS,
  ALLOWED_FRONTMATTER_FIELDS,
  type TriggerAttrs,
  type NodeAttrMap,
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES,
  isValidEdgeType,
  deriveEdgeType,
  validateEdgeForPair,
} from '../src/main/graph/edge-types'

// ---------------------------------------------------------------------------
// trigger NodeKind
// ---------------------------------------------------------------------------

describe('trigger NodeKind', () => {
  it('trigger is included in NODE_KINDS', () => {
    expect(NODE_KINDS).toContain('trigger')
  })

  it('isValidKind returns true for trigger', () => {
    expect(isValidKind('trigger')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TriggerAttrs interface (type-level — verified via compile + runtime checks)
// ---------------------------------------------------------------------------

describe('TriggerAttrs interface', () => {
  it('accepts a valid full TriggerAttrs object', () => {
    const attrs: TriggerAttrs = {
      entitaets_id: 'se-001',
      phasen_ziel: 'requirements',
      subsystem: 'backend',
      input_quelle: 'gate-befund-42',
      erwarteter_output: 'spec-v1',
      niveau: 'A',
      gate_befund_id: 'gb-001',
    }
    expect(attrs.entitaets_id).toBe('se-001')
    expect(attrs.niveau).toBe('A')
    expect(attrs.gate_befund_id).toBe('gb-001')
  })

  it('accepts TriggerAttrs with null gate_befund_id', () => {
    const attrs: TriggerAttrs = {
      entitaets_id: 'se-002',
      phasen_ziel: 'design',
      subsystem: 'frontend',
      input_quelle: 'manual',
      erwarteter_output: 'architektur-paket',
      niveau: 'B',
      gate_befund_id: null,
    }
    expect(attrs.gate_befund_id).toBeNull()
  })

  it('niveau values A, B, C are all valid strings', () => {
    const levels: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
    for (const n of levels) {
      const attrs: TriggerAttrs = {
        entitaets_id: 'x',
        phasen_ziel: 'y',
        subsystem: 'z',
        input_quelle: 'q',
        erwarteter_output: 'r',
        niveau: n,
        gate_befund_id: null,
      }
      expect(attrs.niveau).toBe(n)
    }
  })
})

// ---------------------------------------------------------------------------
// NodeAttrMap — trigger entry
// ---------------------------------------------------------------------------

describe('NodeAttrMap trigger entry', () => {
  it('NodeAttrMap has a trigger key (type-level compile check)', () => {
    // This test verifies via TypeScript compilation that the NodeAttrMap
    // includes a trigger entry. At runtime we confirm NODE_KINDS includes trigger.
    const kindInMap: keyof NodeAttrMap = 'trigger'
    expect(kindInMap).toBe('trigger')
  })
})

// ---------------------------------------------------------------------------
// REQUIRED_FRONTMATTER_FIELDS for trigger
// ---------------------------------------------------------------------------

describe('REQUIRED_FRONTMATTER_FIELDS[trigger]', () => {
  it('contains exactly entitaets_id, phasen_ziel, niveau', () => {
    const required = REQUIRED_FRONTMATTER_FIELDS['trigger']
    expect(required).toContain('entitaets_id')
    expect(required).toContain('phasen_ziel')
    expect(required).toContain('niveau')
    expect(required).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// ALLOWED_FRONTMATTER_FIELDS for trigger
// ---------------------------------------------------------------------------

describe('ALLOWED_FRONTMATTER_FIELDS[trigger]', () => {
  it('contains all 7 TriggerAttrs fields', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS['trigger']
    const expected = [
      'entitaets_id', 'phasen_ziel', 'subsystem',
      'input_quelle', 'erwarteter_output', 'niveau', 'gate_befund_id',
    ]
    for (const field of expected) {
      expect(allowed).toContain(field)
    }
    expect(allowed).toHaveLength(7)
  })
})

// ---------------------------------------------------------------------------
// New SE edge types
// ---------------------------------------------------------------------------

describe('SE edge types', () => {
  it('triggert is in EDGE_TYPES', () => {
    expect(EDGE_TYPES).toContain('triggert')
  })

  it('teilprojekt_von is in EDGE_TYPES', () => {
    expect(EDGE_TYPES).toContain('teilprojekt_von')
  })

  it('uebergibt_an is in EDGE_TYPES', () => {
    expect(EDGE_TYPES).toContain('uebergibt_an')
  })

  it('sammelt_ein is in EDGE_TYPES', () => {
    expect(EDGE_TYPES).toContain('sammelt_ein')
  })

  it('isValidEdgeType returns true for all 4 new types', () => {
    expect(isValidEdgeType('triggert')).toBe(true)
    expect(isValidEdgeType('teilprojekt_von')).toBe(true)
    expect(isValidEdgeType('uebergibt_an')).toBe(true)
    expect(isValidEdgeType('sammelt_ein')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Pair derivation: trigger->phase = triggert
// ---------------------------------------------------------------------------

describe('deriveEdgeType — trigger pair', () => {
  it('trigger->phase derives to triggert', () => {
    expect(deriveEdgeType('trigger', 'phase')).toBe('triggert')
  })

  it('trigger->anforderung falls back to verweist_auf', () => {
    expect(deriveEdgeType('trigger', 'anforderung')).toBe('verweist_auf')
  })
})

// ---------------------------------------------------------------------------
// validateEdgeForPair — triggert
// ---------------------------------------------------------------------------

describe('validateEdgeForPair — triggert', () => {
  it('triggert with trigger->phase is valid', () => {
    expect(validateEdgeForPair('triggert', 'trigger', 'phase')).toBeNull()
  })

  it('triggert with wrong dst returns error', () => {
    const err = validateEdgeForPair('triggert', 'trigger', 'anforderung')
    expect(err).not.toBeNull()
    expect(err).toContain('triggert')
    expect(err).toContain('phase')
  })
})

// ---------------------------------------------------------------------------
// validateEdgeForPair — SE hierarchy edges (flexible, no strict enforcement)
// ---------------------------------------------------------------------------

describe('validateEdgeForPair — SE hierarchy edges (flexible)', () => {
  it('teilprojekt_von is allowed for any pair (flexible)', () => {
    expect(validateEdgeForPair('teilprojekt_von', 'anlass', 'artefakt')).toBeNull()
    expect(validateEdgeForPair('teilprojekt_von', 'trigger', 'trigger')).toBeNull()
  })

  it('uebergibt_an is allowed for any pair (flexible)', () => {
    expect(validateEdgeForPair('uebergibt_an', 'artefakt', 'artefakt')).toBeNull()
    expect(validateEdgeForPair('uebergibt_an', 'trigger', 'phase')).toBeNull()
  })

  it('sammelt_ein is allowed for any pair (flexible)', () => {
    expect(validateEdgeForPair('sammelt_ein', 'phase', 'trigger')).toBeNull()
    expect(validateEdgeForPair('sammelt_ein', 'artefakt', 'note')).toBeNull()
  })
})
