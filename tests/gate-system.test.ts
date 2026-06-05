/**
 * Gate system type-level tests — Tasks 1/11 (PROC-005, PROC-007).
 * Only covers node/edge type definitions. Query tests are in Task 2/11.
 */

import { describe, it, expect } from 'vitest'
import {
  NODE_KINDS, isValidKind,
  REQUIRED_FRONTMATTER_FIELDS, ALLOWED_FRONTMATTER_FIELDS,
  type GateBefundAttrs
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES, isValidEdgeType, deriveEdgeType, validateEdgeForPair
} from '../src/main/graph/edge-types'

describe('gate_befund node type (PROC-005)', () => {
  it('gate_befund is a valid node kind', () => {
    expect(NODE_KINDS).toContain('gate_befund')
    expect(isValidKind('gate_befund')).toBe(true)
  })
  it('has required frontmatter fields', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS.gate_befund
    expect(req).toContain('phase_uid')
    expect(req).toContain('strukturell')
    expect(req).toContain('gate_typ')
  })
  it('has allowed frontmatter fields', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS.gate_befund
    expect(allowed).toContain('plausibilitaet')
    expect(allowed).toContain('gewichtung')
    expect(allowed).toContain('phase_uid')
    expect(allowed).toContain('strukturell')
    expect(allowed).toContain('gate_typ')
  })
})

describe('gate_fuer edge type (PROC-005)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('gate_fuer')
    expect(isValidEdgeType('gate_fuer')).toBe(true)
  })
  it('gate_befund->phase derives gate_fuer', () => {
    expect(deriveEdgeType('gate_befund', 'phase')).toBe('gate_fuer')
  })
  it('validates for gate_befund->phase', () => {
    expect(validateEdgeForPair('gate_fuer', 'gate_befund', 'phase')).toBeNull()
  })
  it('rejects non-phase destination', () => {
    expect(validateEdgeForPair('gate_fuer', 'gate_befund', 'anforderung')).not.toBeNull()
  })
})

describe('gate signals separate (PROC-007)', () => {
  it('strukturell and plausibilitaet are independent fields', () => {
    const befund: GateBefundAttrs = {
      phase_uid: 'uid', strukturell: 'gruen',
      plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
    }
    expect(befund.strukturell).toBe('gruen')
    expect(befund.plausibilitaet).toBeNull()
  })
})
