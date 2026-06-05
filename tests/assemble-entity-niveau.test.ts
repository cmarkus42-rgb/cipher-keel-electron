/**
 * assembleEntityClaudeMd — Niveau A/B/C + persona orthogonality (ENT-002)
 * Phase 3c Task 9 / CK-3C-009
 */
import { describe, it, expect } from 'vitest'
import { assembleEntityClaudeMd } from '../src/main/session/assemble-entity'
import { CapabilityNiveau } from '../src/main/preset/niveau'

const SAMPLE_CAPABILITIES = ['se-core-identity', 'gate-urteil-guide', 'rolling-summary']

// ---------------------------------------------------------------------------
// Niveau A — full CLAUDE.md with SKILL.md references
// ---------------------------------------------------------------------------

describe('Niveau A — full CLAUDE.md with SKILL.md references (CK-3C-009)', () => {
  it('includes a Capabilities section', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.A,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).toContain('<!-- BEGIN:Capabilities -->')
    expect(result).toContain('<!-- END:Capabilities -->')
  })

  it('each capability produces a SKILL.md reference line', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.A,
      capabilities: SAMPLE_CAPABILITIES,
    })
    for (const cap of SAMPLE_CAPABILITIES) {
      expect(result).toContain(`@.claude/capabilities/${cap}/SKILL.md`)
    }
  })

  it('Capabilities section appears after body', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.A,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result.indexOf('# SE Body')).toBeLessThan(result.indexOf('<!-- BEGIN:Capabilities -->'))
  })

  it('persona is still a separate section, not embedded in body', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      persona: 'You are Cipher.',
      niveau: CapabilityNiveau.A,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).toContain('<!-- BEGIN:Persona -->')
    expect(result).toContain('You are Cipher.')
    expect(result).toContain('<!-- END:Persona -->')
    // Persona block must not appear inside the body text itself
    const bodyEnd = result.indexOf('\n\n')
    const personaStart = result.indexOf('<!-- BEGIN:Persona -->')
    expect(personaStart).toBeGreaterThan(bodyEnd > 0 ? bodyEnd : 0)
  })

  it('empty capabilities list produces no SKILL.md lines', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.A,
      capabilities: [],
    })
    expect(result).not.toContain('SKILL.md')
  })
})

// ---------------------------------------------------------------------------
// Niveau B — compressed CLAUDE.md, no SKILL.md references
// ---------------------------------------------------------------------------

describe('Niveau B — compressed CLAUDE.md, no SKILL.md references (CK-3C-009)', () => {
  it('does NOT include SKILL.md references', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.B,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).not.toContain('SKILL.md')
  })

  it('does NOT include a Capabilities section', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.B,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).not.toContain('<!-- BEGIN:Capabilities -->')
  })

  it('body is present in output', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      niveau: CapabilityNiveau.B,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).toContain('# SE Body')
  })

  it('persona is still a separate section (ENT-002)', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      persona: 'You are Cipher.',
      niveau: CapabilityNiveau.B,
    })
    expect(result).toContain('<!-- BEGIN:Persona -->')
    expect(result).toContain('You are Cipher.')
    expect(result).not.toContain('SKILL.md')
  })

  it('globalRules and phaseInput still included', () => {
    const result = assembleEntityClaudeMd({
      body: '# SE Body',
      globalRules: 'be brief',
      phaseInput: 'context here',
      niveau: CapabilityNiveau.B,
    })
    expect(result).toContain('<!-- BEGIN:GlobalRules -->')
    expect(result).toContain('<!-- BEGIN:PhaseInput -->')
  })
})

// ---------------------------------------------------------------------------
// Niveau C — inline instruction, max 2000 tokens
// ---------------------------------------------------------------------------

describe('Niveau C — inline instruction, max 2000 tokens (CK-3C-009)', () => {
  it('short body passes through unchanged', () => {
    const body = '# Inline Instruction\nDo the thing.'
    const result = assembleEntityClaudeMd({
      body,
      niveau: CapabilityNiveau.C,
    })
    expect(result).toContain(body)
  })

  it('does NOT include SKILL.md references', () => {
    const result = assembleEntityClaudeMd({
      body: '# Short body',
      niveau: CapabilityNiveau.C,
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).not.toContain('SKILL.md')
  })

  it('very long body is truncated to fit within 2000-token estimate', () => {
    // ~3000 words → ~3900 tokens before truncation
    const longBody = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ')
    const result = assembleEntityClaudeMd({
      body: longBody,
      niveau: CapabilityNiveau.C,
    })
    // token estimate: words * 1.3
    const estimatedTokens = result.split(/\s+/).length * 1.3
    expect(estimatedTokens).toBeLessThanOrEqual(2000)
  })

  it('persona is still a separate section even at Niveau C (ENT-002)', () => {
    const result = assembleEntityClaudeMd({
      body: '# Short body',
      persona: 'You are Cipher.',
      niveau: CapabilityNiveau.C,
    })
    expect(result).toContain('<!-- BEGIN:Persona -->')
    expect(result).toContain('You are Cipher.')
  })
})

// ---------------------------------------------------------------------------
// Backward compatibility — no niveau behaves like before
// ---------------------------------------------------------------------------

describe('Backward compatibility — no niveau parameter', () => {
  it('no niveau: no Capabilities section', () => {
    const result = assembleEntityClaudeMd({
      body: 'body',
      capabilities: SAMPLE_CAPABILITIES,
    })
    expect(result).not.toContain('<!-- BEGIN:Capabilities -->')
    expect(result).not.toContain('SKILL.md')
  })

  it('no niveau: all existing layers still work', () => {
    const result = assembleEntityClaudeMd({
      body: 'body',
      persona: 'persona',
      globalRules: 'rules',
      phaseInput: 'input',
    })
    expect(result).toContain('<!-- BEGIN:Persona -->')
    expect(result).toContain('<!-- BEGIN:GlobalRules -->')
    expect(result).toContain('<!-- BEGIN:PhaseInput -->')
  })
})

// ---------------------------------------------------------------------------
// ENT-002 — Persona is always orthogonal (separate section, not in body)
// ---------------------------------------------------------------------------

describe('ENT-002 — persona is always a separate section', () => {
  it('Niveau A: persona in dedicated section', () => {
    const result = assembleEntityClaudeMd({
      body: 'body text',
      persona: 'persona text',
      niveau: CapabilityNiveau.A,
      capabilities: [],
    })
    expect(result).toContain('<!-- BEGIN:Persona -->\npersona text\n<!-- END:Persona -->')
  })

  it('Niveau B: persona in dedicated section', () => {
    const result = assembleEntityClaudeMd({
      body: 'body text',
      persona: 'persona text',
      niveau: CapabilityNiveau.B,
    })
    expect(result).toContain('<!-- BEGIN:Persona -->\npersona text\n<!-- END:Persona -->')
  })

  it('Niveau C: persona in dedicated section', () => {
    const result = assembleEntityClaudeMd({
      body: 'body text',
      persona: 'persona text',
      niveau: CapabilityNiveau.C,
    })
    expect(result).toContain('<!-- BEGIN:Persona -->\npersona text\n<!-- END:Persona -->')
  })
})
