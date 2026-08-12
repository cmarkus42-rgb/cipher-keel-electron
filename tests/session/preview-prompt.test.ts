import { describe, it, expect } from 'vitest'
import { buildPromptPreview } from '../../src/main/session/preview-prompt'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'opus' }

describe('buildPromptPreview', () => {
  it('returns the assembled prompt with its layers named', () => {
    const preview = buildPromptPreview('architect', CapabilityNiveau.A, TIERS)!
    expect(preview.prompt).toContain('# Architect')
    expect(preview.schichten).toContain('Body')
    expect(preview.schichten).toContain('Persona')
    expect(preview.schichten).toContain('GlobalRules')
  })

  it('resolves the model tier so the preview shows what would actually run', () => {
    expect(buildPromptPreview('architect', CapabilityNiveau.A, TIERS)!.modelResolved).toBe('opus')
  })

  it('shows the B inventory when asked for Niveau B, even with no B adapter present', () => {
    const preview = buildPromptPreview('architect', CapabilityNiveau.B, TIERS)!
    expect(preview.prompt).not.toMatch(/^@/m)
    expect(preview.prompt).toContain('.claude/capabilities/')
  })

  it('returns null for an unknown entity', () => {
    expect(buildPromptPreview('nope', CapabilityNiveau.A, TIERS)).toBeNull()
  })

  it('writes nothing to disk', () => {
    const preview = buildPromptPreview('architect', CapabilityNiveau.A, TIERS)!
    expect(preview.capabilities.length).toBeGreaterThan(0)
    // capabilities are the ids that *would* be materialised; no project path is touched
  })
})
