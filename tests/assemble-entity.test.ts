/**
 * Tests for assembleEntityClaudeMd (CK-INF-021)
 */
import { describe, it, expect } from 'vitest'
import { assembleEntityClaudeMd } from '../src/main/session/assemble-entity'

describe('assembleEntityClaudeMd', () => {
  it('body is the first content in the output', () => {
    const result = assembleEntityClaudeMd({
      body: '# Preset Body',
      persona: 'You are Mimir.',
    })
    expect(result.startsWith('# Preset Body')).toBe(true)
  })

  it('includes all four layers when provided', () => {
    const result = assembleEntityClaudeMd({
      body: 'body',
      persona: 'persona text',
      globalRules: 'global rules text',
      phaseInput: 'phase input text',
    })
    expect(result).toContain('<!-- BEGIN:Persona -->')
    expect(result).toContain('persona text')
    expect(result).toContain('<!-- END:Persona -->')
    expect(result).toContain('<!-- BEGIN:GlobalRules -->')
    expect(result).toContain('global rules text')
    expect(result).toContain('<!-- END:GlobalRules -->')
    expect(result).toContain('<!-- BEGIN:PhaseInput -->')
    expect(result).toContain('phase input text')
    expect(result).toContain('<!-- END:PhaseInput -->')
  })

  it('output order: Body → Persona → GlobalRules → PhaseInput', () => {
    const result = assembleEntityClaudeMd({
      body: 'body',
      persona: 'persona',
      globalRules: 'rules',
      phaseInput: 'phase',
    })
    const bodyIdx = result.indexOf('body')
    const personaIdx = result.indexOf('<!-- BEGIN:Persona -->')
    const globalIdx = result.indexOf('<!-- BEGIN:GlobalRules -->')
    const phaseIdx = result.indexOf('<!-- BEGIN:PhaseInput -->')
    expect(bodyIdx).toBeLessThan(personaIdx)
    expect(personaIdx).toBeLessThan(globalIdx)
    expect(globalIdx).toBeLessThan(phaseIdx)
  })

  it('body-only yields no sections', () => {
    const result = assembleEntityClaudeMd({ body: 'body only' })
    expect(result).toBe('body only')
    expect(result).not.toContain('<!-- BEGIN:')
  })

  it('omits empty optional layers', () => {
    const result = assembleEntityClaudeMd({ body: 'body', persona: 'p' })
    expect(result).not.toContain('<!-- BEGIN:GlobalRules -->')
    expect(result).not.toContain('<!-- BEGIN:PhaseInput -->')
  })

  it('no capability content in output', () => {
    const result = assembleEntityClaudeMd({
      body: 'body',
      persona: 'persona',
      globalRules: 'rules',
      phaseInput: 'phase',
    })
    expect(result.toLowerCase()).not.toContain('capability')
  })
})
