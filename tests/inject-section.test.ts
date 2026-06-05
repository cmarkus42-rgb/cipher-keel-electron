/**
 * Tests for injectSection (CK-INF-012)
 */
import { describe, it, expect } from 'vitest'
import { injectSection } from '../src/main/session/inject-section'

describe('injectSection', () => {
  it('injects a section into an empty document', () => {
    const result = injectSection('', 'Persona', 'You are Mimir.')
    expect(result).toBe('<!-- BEGIN:Persona -->\nYou are Mimir.\n<!-- END:Persona -->')
  })

  it('appends a section after existing content (no existing sections)', () => {
    const base = '# My CLAUDE.md\n\nSome content.'
    const result = injectSection(base, 'Persona', 'You are Mimir.')
    expect(result).toContain('<!-- BEGIN:Persona -->')
    expect(result).toContain('You are Mimir.')
    expect(result).toContain('<!-- END:Persona -->')
    expect(result.startsWith(base)).toBe(true)
  })

  it('is idempotent — injecting the same section twice has no effect', () => {
    const base = '# CLAUDE.md'
    const once = injectSection(base, 'Persona', 'You are Mimir.')
    const twice = injectSection(once, 'Persona', 'DIFFERENT content')
    expect(once).toBe(twice)
  })

  it('maintains alphabetical order — A section before Z section', () => {
    const withA = injectSection('', 'Alpha', 'alpha content')
    const withAZ = injectSection(withA, 'Zeta', 'zeta content')
    expect(withAZ.indexOf('<!-- BEGIN:Alpha -->')).toBeLessThan(withAZ.indexOf('<!-- BEGIN:Zeta -->'))
  })

  it('inserts before an alphabetically later section', () => {
    const withZ = injectSection('', 'Zeta', 'zeta content')
    const withAZ = injectSection(withZ, 'Alpha', 'alpha content')
    expect(withAZ.indexOf('<!-- BEGIN:Alpha -->')).toBeLessThan(withAZ.indexOf('<!-- BEGIN:Zeta -->'))
  })

  it('inserts between sections in correct alphabetical position', () => {
    const withA = injectSection('', 'Alpha', 'a')
    const withAZ = injectSection(withA, 'Zeta', 'z')
    const withAMZ = injectSection(withAZ, 'Mu', 'm')
    const alphaIdx = withAMZ.indexOf('<!-- BEGIN:Alpha -->')
    const muIdx = withAMZ.indexOf('<!-- BEGIN:Mu -->')
    const zetaIdx = withAMZ.indexOf('<!-- BEGIN:Zeta -->')
    expect(alphaIdx).toBeLessThan(muIdx)
    expect(muIdx).toBeLessThan(zetaIdx)
  })
})
