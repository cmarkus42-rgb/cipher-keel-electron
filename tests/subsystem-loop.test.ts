/**
 * Subsystem edge type + attrs type-level tests — Task 5 (PROC-009).
 * Only covers edge type definitions and PhaseSubsystemAttrs extension.
 * Query tests (subsystem_list, subsystem_dependencies, quereinstieg) are Task 6.
 */

import { describe, it, expect } from 'vitest'
import {
  ALLOWED_FRONTMATTER_FIELDS,
  type PhaseSubsystemAttrs
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES, isValidEdgeType, validateEdgeForPair
} from '../src/main/graph/edge-types'

describe('subsystem_von edge type (PROC-009)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('subsystem_von')
    expect(isValidEdgeType('subsystem_von')).toBe(true)
  })
  it('validates for phase_subsystem->phase_subsystem', () => {
    expect(validateEdgeForPair('subsystem_von', 'phase_subsystem', 'phase_subsystem')).toBeNull()
  })
  it('rejects non-subsystem destination', () => {
    expect(validateEdgeForPair('subsystem_von', 'phase_subsystem', 'phase')).not.toBeNull()
  })
})

describe('haengt_ab_von edge type (PROC-009)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('haengt_ab_von')
    expect(isValidEdgeType('haengt_ab_von')).toBe(true)
  })
  it('validates for phase_subsystem->phase_subsystem', () => {
    expect(validateEdgeForPair('haengt_ab_von', 'phase_subsystem', 'phase_subsystem')).toBeNull()
  })
  it('rejects non-subsystem destination', () => {
    expect(validateEdgeForPair('haengt_ab_von', 'phase_subsystem', 'phase')).not.toBeNull()
  })
})

describe('PhaseSubsystemAttrs extensions (PROC-009)', () => {
  it('scope, status, blocked_grund are in ALLOWED_FRONTMATTER_FIELDS.phase_subsystem', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS.phase_subsystem
    expect(allowed).toContain('scope')
    expect(allowed).toContain('status')
    expect(allowed).toContain('blocked_grund')
  })

  it('PhaseSubsystemAttrs accepts scope, status, blocked_grund', () => {
    const attrs: PhaseSubsystemAttrs = {
      ebene: 'top',
      scope: 'backend',
      status: 'aktiv',
      blocked_grund: 'missing dependency'
    }
    expect(attrs.scope).toBe('backend')
    expect(attrs.status).toBe('aktiv')
    expect(attrs.blocked_grund).toBe('missing dependency')
  })

  it('PhaseSubsystemAttrs is valid without new optional fields', () => {
    const attrs: PhaseSubsystemAttrs = { ebene: 'component' }
    expect(attrs.scope).toBeUndefined()
    expect(attrs.blocked_grund).toBeUndefined()
  })
})
