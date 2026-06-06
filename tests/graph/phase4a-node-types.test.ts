import { describe, it, expect } from 'vitest'
import {
  NODE_KINDS,
  isValidKind,
  REQUIRED_FRONTMATTER_FIELDS,
  ALLOWED_FRONTMATTER_FIELDS,
} from '../../src/main/graph/node-types'

describe('Phase 4a NodeKinds', () => {
  const NEW_KINDS = [
    'adr',
    'schnittstellen_vertrag',
    'anforderungspaket',
    'frage_knoten',
    'antwort_knoten',
  ] as const

  for (const kind of NEW_KINDS) {
    it(`NODE_KINDS contains '${kind}'`, () => {
      expect(NODE_KINDS).toContain(kind)
    })

    it(`isValidKind('${kind}') returns true`, () => {
      expect(isValidKind(kind)).toBe(true)
    })

    it(`REQUIRED_FRONTMATTER_FIELDS has entry for '${kind}'`, () => {
      expect(REQUIRED_FRONTMATTER_FIELDS).toHaveProperty(kind)
      expect(Array.isArray(REQUIRED_FRONTMATTER_FIELDS[kind as keyof typeof REQUIRED_FRONTMATTER_FIELDS])).toBe(true)
    })

    it(`ALLOWED_FRONTMATTER_FIELDS has entry for '${kind}'`, () => {
      expect(ALLOWED_FRONTMATTER_FIELDS).toHaveProperty(kind)
      expect(Array.isArray(ALLOWED_FRONTMATTER_FIELDS[kind as keyof typeof ALLOWED_FRONTMATTER_FIELDS])).toBe(true)
    })
  }

  // ADR required fields
  it('adr requires title, context, options, decision, consequences, tiefen, version', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['adr' as keyof typeof REQUIRED_FRONTMATTER_FIELDS]
    expect(req).toContain('title')
    expect(req).toContain('context')
    expect(req).toContain('options')
    expect(req).toContain('decision')
    expect(req).toContain('consequences')
    expect(req).toContain('tiefen')
    expect(req).toContain('version')
  })

  // schnittstellen_vertrag required fields
  it('schnittstellen_vertrag requires subsystem_a, subsystem_b, input_schema, output_schema, fehlerverhalten, template_version', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['schnittstellen_vertrag' as keyof typeof REQUIRED_FRONTMATTER_FIELDS]
    expect(req).toContain('subsystem_a')
    expect(req).toContain('subsystem_b')
    expect(req).toContain('input_schema')
    expect(req).toContain('output_schema')
    expect(req).toContain('fehlerverhalten')
    expect(req).toContain('template_version')
  })

  // anforderungspaket required fields
  it('anforderungspaket requires subsystem, req_ids, code_anker, akzeptanzkriterium, testcase_verweis', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['anforderungspaket' as keyof typeof REQUIRED_FRONTMATTER_FIELDS]
    expect(req).toContain('subsystem')
    expect(req).toContain('req_ids')
    expect(req).toContain('code_anker')
    expect(req).toContain('akzeptanzkriterium')
    expect(req).toContain('testcase_verweis')
  })

  // anforderungspaket allows optional niveau_c_extrakt
  it('anforderungspaket allows niveau_c_extrakt', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS['anforderungspaket' as keyof typeof ALLOWED_FRONTMATTER_FIELDS]
    expect(allowed).toContain('niveau_c_extrakt')
  })

  // frage_knoten required fields
  it('frage_knoten requires subsystem, frage, worker_id, status', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['frage_knoten' as keyof typeof REQUIRED_FRONTMATTER_FIELDS]
    expect(req).toContain('subsystem')
    expect(req).toContain('frage')
    expect(req).toContain('worker_id')
    expect(req).toContain('status')
  })

  // antwort_knoten required fields
  it('antwort_knoten requires frage_uid, antwort, architect_session', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['antwort_knoten' as keyof typeof REQUIRED_FRONTMATTER_FIELDS]
    expect(req).toContain('frage_uid')
    expect(req).toContain('antwort')
    expect(req).toContain('architect_session')
  })
})
