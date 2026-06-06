import { describe, it, expect } from 'vitest'
import {
  EDGE_TYPES,
  isValidEdgeType,
  deriveEdgeType,
  validateEdgeForPair,
} from '../../src/main/graph/edge-types'

describe('Phase 4a EdgeKinds', () => {
  const NEW_EDGES = [
    'schnittstellen_vertrag_fuer',
    'adr_fuer',
    'beantwortet',
  ] as const

  for (const edge of NEW_EDGES) {
    it(`EDGE_TYPES contains '${edge}'`, () => {
      expect(EDGE_TYPES).toContain(edge)
    })

    it(`isValidEdgeType('${edge}') returns true`, () => {
      expect(isValidEdgeType(edge)).toBe(true)
    })
  }

  it('schnittstellen_vertrag -> phase_subsystem derives schnittstellen_vertrag_fuer', () => {
    expect(deriveEdgeType('schnittstellen_vertrag', 'phase_subsystem'))
      .toBe('schnittstellen_vertrag_fuer')
  })

  it('adr -> phase_subsystem derives adr_fuer', () => {
    expect(deriveEdgeType('adr', 'phase_subsystem')).toBe('adr_fuer')
  })

  it('antwort_knoten -> frage_knoten derives beantwortet', () => {
    expect(deriveEdgeType('antwort_knoten', 'frage_knoten')).toBe('beantwortet')
  })

  it('validates schnittstellen_vertrag_fuer for correct pair', () => {
    const err = validateEdgeForPair('schnittstellen_vertrag_fuer', 'schnittstellen_vertrag', 'phase_subsystem')
    expect(err).toBeNull()
  })

  it('rejects schnittstellen_vertrag_fuer for wrong source', () => {
    const err = validateEdgeForPair('schnittstellen_vertrag_fuer', 'anforderung', 'phase_subsystem')
    expect(err).not.toBeNull()
  })

  it('validates adr_fuer for correct pair', () => {
    const err = validateEdgeForPair('adr_fuer', 'adr', 'phase_subsystem')
    expect(err).toBeNull()
  })

  it('validates beantwortet for correct pair', () => {
    const err = validateEdgeForPair('beantwortet', 'antwort_knoten', 'frage_knoten')
    expect(err).toBeNull()
  })
})
