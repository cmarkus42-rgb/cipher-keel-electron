/**
 * ENT Config Template tests (H-1: previously untested dead code).
 * Verifies constants are defined, non-empty, and structurally sound.
 */

import { describe, it, expect } from 'vitest'
import {
  D13_HINWEIS,
  NIVEAU_BEDIENUNG_SECTION,
  GRANULARITAETS_PFLICHT_SECTION,
  PRUEFFRAGE_CHECKPOINT,
} from '../src/main/preset/shared/ent-config-templates'

describe('D13_HINWEIS (ENT-013)', () => {
  it('is a non-empty string', () => {
    expect(typeof D13_HINWEIS).toBe('string')
    expect(D13_HINWEIS.length).toBeGreaterThan(0)
  })
  it('mentions Niveau C', () => {
    expect(D13_HINWEIS).toContain('Niveau C')
  })
})

describe('NIVEAU_BEDIENUNG_SECTION (ENT-014)', () => {
  it('is a non-empty string', () => {
    expect(typeof NIVEAU_BEDIENUNG_SECTION).toBe('string')
    expect(NIVEAU_BEDIENUNG_SECTION.length).toBeGreaterThan(0)
  })
  it('contains markdown table with A/B/C rows', () => {
    expect(NIVEAU_BEDIENUNG_SECTION).toContain('| A |')
    expect(NIVEAU_BEDIENUNG_SECTION).toContain('| B |')
    expect(NIVEAU_BEDIENUNG_SECTION).toContain('| C |')
  })
})

describe('GRANULARITAETS_PFLICHT_SECTION (ENT-015)', () => {
  it('is a non-empty string', () => {
    expect(typeof GRANULARITAETS_PFLICHT_SECTION).toBe('string')
    expect(GRANULARITAETS_PFLICHT_SECTION.length).toBeGreaterThan(0)
  })
  it('contains heading', () => {
    expect(GRANULARITAETS_PFLICHT_SECTION).toContain('## Granularit')
  })
})

describe('PRUEFFRAGE_CHECKPOINT (ENT-016)', () => {
  it('is a non-empty string', () => {
    expect(typeof PRUEFFRAGE_CHECKPOINT).toBe('string')
    expect(PRUEFFRAGE_CHECKPOINT.length).toBeGreaterThan(0)
  })
  it('contains checklist items', () => {
    expect(PRUEFFRAGE_CHECKPOINT).toContain('- [ ]')
  })
  it('has at least 4 checklist items', () => {
    const checkboxCount = (PRUEFFRAGE_CHECKPOINT.match(/- \[ \]/g) || []).length
    expect(checkboxCount).toBeGreaterThanOrEqual(4)
  })
})
