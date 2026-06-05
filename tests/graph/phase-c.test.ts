/**
 * Phase C tests — Edge Types + Constraints.
 * CK-GRAPH-015, 016, 017, 046
 */

import { describe, it, expect } from 'vitest'
import {
  EDGE_TYPES,
  EDGE_SOURCES,
  deriveEdgeType,
  isValidEdgeType,
  isValidEdgeSource,
  validateEdgeForPair
} from '../../src/main/graph/edge-types'
import type { NodeKind } from '../../src/main/graph/node-types'

describe('EDGE_TYPES (CK-GRAPH-015)', () => {
  it('contains all 7 types', () => {
    expect(EDGE_TYPES).toHaveLength(7)
    const expected = [
      'verweist_auf', 'verfeinert', 'begruendet',
      'setzt_um', 'verifiziert', 'erzeugt_von', 'abgeloest_durch'
    ]
    for (const t of expected) {
      expect(EDGE_TYPES).toContain(t)
    }
  })
})

describe('EDGE_SOURCES (CK-GRAPH-046)', () => {
  it('contains wikilink, frontmatter, inferred', () => {
    expect(EDGE_SOURCES).toEqual(['wikilink', 'frontmatter', 'inferred'])
  })
})

describe('isValidEdgeType', () => {
  it('accepts valid types', () => {
    for (const t of EDGE_TYPES) {
      expect(isValidEdgeType(t)).toBe(true)
    }
  })
  it('rejects unknown type', () => {
    expect(isValidEdgeType('depends_on')).toBe(false)
  })
})

describe('isValidEdgeSource', () => {
  it('accepts valid sources', () => {
    for (const s of EDGE_SOURCES) {
      expect(isValidEdgeSource(s)).toBe(true)
    }
  })
  it('rejects unknown source', () => {
    expect(isValidEdgeSource('manual')).toBe(false)
  })
})

describe('deriveEdgeType (CK-GRAPH-017)', () => {
  it('anforderung → anforderung = verfeinert', () => {
    expect(deriveEdgeType('anforderung', 'anforderung')).toBe('verfeinert')
  })

  it('entscheidung → anforderung = begruendet', () => {
    expect(deriveEdgeType('entscheidung', 'anforderung')).toBe('begruendet')
  })

  it('artefakt → anforderung = setzt_um', () => {
    expect(deriveEdgeType('artefakt', 'anforderung')).toBe('setzt_um')
  })

  it('artefakt → entscheidung = setzt_um', () => {
    expect(deriveEdgeType('artefakt', 'entscheidung')).toBe('setzt_um')
  })

  it('test → anforderung = verifiziert', () => {
    expect(deriveEdgeType('test', 'anforderung')).toBe('verifiziert')
  })

  it('test → artefakt = verifiziert', () => {
    expect(deriveEdgeType('test', 'artefakt')).toBe('verifiziert')
  })

  it('any → anlass = erzeugt_von', () => {
    const kinds: NodeKind[] = [
      'anforderung', 'entscheidung', 'artefakt', 'test',
      'note', 'phase_subsystem', 'github_repo'
    ]
    for (const k of kinds) {
      expect(deriveEdgeType(k, 'anlass')).toBe('erzeugt_von')
    }
  })

  it('other pairs → verweist_auf (default)', () => {
    expect(deriveEdgeType('note', 'artefakt')).toBe('verweist_auf')
    expect(deriveEdgeType('note', 'note')).toBe('verweist_auf')
    expect(deriveEdgeType('github_repo', 'artefakt')).toBe('verweist_auf')
  })

  it('NEVER returns abgeloest_durch', () => {
    // Exhaustive check: no pair combination should derive abgeloest_durch
    const kinds: NodeKind[] = [
      'anforderung', 'entscheidung', 'artefakt', 'test',
      'note', 'phase_subsystem', 'anlass', 'github_repo'
    ]
    for (const src of kinds) {
      for (const dst of kinds) {
        expect(deriveEdgeType(src, dst)).not.toBe('abgeloest_durch')
      }
    }
  })
})

describe('validateEdgeForPair', () => {
  it('accepts correctly derived edges', () => {
    expect(validateEdgeForPair('verfeinert', 'anforderung', 'anforderung')).toBeNull()
    expect(validateEdgeForPair('begruendet', 'entscheidung', 'anforderung')).toBeNull()
    expect(validateEdgeForPair('setzt_um', 'artefakt', 'anforderung')).toBeNull()
    expect(validateEdgeForPair('verifiziert', 'test', 'artefakt')).toBeNull()
    expect(validateEdgeForPair('erzeugt_von', 'note', 'anlass')).toBeNull()
  })

  it('accepts verweist_auf for any pair', () => {
    expect(validateEdgeForPair('verweist_auf', 'note', 'artefakt')).toBeNull()
    expect(validateEdgeForPair('verweist_auf', 'anforderung', 'anforderung')).toBeNull()
  })

  it('accepts abgeloest_durch for any pair (CK-GRAPH-016)', () => {
    expect(validateEdgeForPair('abgeloest_durch', 'entscheidung', 'entscheidung')).toBeNull()
    expect(validateEdgeForPair('abgeloest_durch', 'anforderung', 'anforderung')).toBeNull()
  })

  it('rejects erzeugt_von when dst is not anlass', () => {
    const err = validateEdgeForPair('erzeugt_von', 'artefakt', 'note')
    expect(err).toContain("requires destination kind 'anlass'")
  })

  it('rejects mismatched typed edge', () => {
    const err = validateEdgeForPair('verfeinert', 'test', 'anforderung')
    expect(err).toContain('not valid for pair')
  })
})
