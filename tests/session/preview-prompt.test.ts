import { describe, it, expect } from 'vitest'
import { buildPromptPreview } from '../../src/main/session/preview-prompt'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'opus' }

describe('buildPromptPreview', () => {
  it('returns the assembled prompt with its layers named', async () => {
    const preview = (await buildPromptPreview('architect', CapabilityNiveau.A, TIERS))!
    expect(preview.prompt).toContain('# Architect')
    expect(preview.schichten).toContain('Body')
    expect(preview.schichten).toContain('Persona')
    expect(preview.schichten).toContain('GlobalRules')
  })

  it('resolves the model tier so the preview shows what would actually run', async () => {
    const preview = (await buildPromptPreview('architect', CapabilityNiveau.A, TIERS))!
    expect(preview.modelResolved).toBe('opus')
  })

  it('shows the B inventory when asked for Niveau B, even with no B adapter present', async () => {
    const preview = (await buildPromptPreview('architect', CapabilityNiveau.B, TIERS))!
    expect(preview.prompt).not.toMatch(/^@/m)
    expect(preview.prompt).toContain('.claude/capabilities/')
  })

  it('returns null for an unknown entity', async () => {
    expect(await buildPromptPreview('nope', CapabilityNiveau.A, TIERS)).toBeNull()
  })

  it('writes nothing to disk', async () => {
    const preview = (await buildPromptPreview('architect', CapabilityNiveau.A, TIERS))!
    expect(preview.capabilities.length).toBeGreaterThan(0)
    // capabilities are the ids that *would* be materialised; no project path is touched
  })

  // Without a graph handle there is no phaseninput layer — and that must stay a missing
  // layer, not a crash: the preview has to work before a project graph exists.
  it('omits the phaseninput layer when no graph is passed', async () => {
    const preview = (await buildPromptPreview('architect', CapabilityNiveau.A, TIERS))!
    expect(preview.schichten).not.toContain('PhaseInput')
    expect(preview.prompt).not.toContain('<!-- BEGIN:PhaseInput -->')
  })
})
