import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  // No registry assignment at all (config-store falls back to its defaults because
  // electron's `app` is not mocked in this describe block): the natural "unassigned
  // tier" case, covered here without the withConfig ceremony below.
  it('carries no modelHinweis when no tier assignment exists', async () => {
    const preview = (await buildPromptPreview('architect', CapabilityNiveau.A, TIERS))!
    expect(preview.modelResolved).toBe('opus')
    expect(preview.modelHinweis).toBeNull()
  })
})

// F2: a tier assignment that names an entry which is not a cli-harness must not vanish
// into a console.warn nobody in a packaged app will ever see. The preview is a surface
// the user opens deliberately, and it already carries modelResolved — the natural place
// for the reason a fallback happened.
describe('buildPromptPreview — modelHinweis on a wrong-shaped tier assignment', () => {
  // architect's Rahmen.model resolves to the 'heavy' tier on Niveau A (see the
  // 'resolves the model tier' test above) — so assigning 'heavy' exercises this path.
  const LEGACY_TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'alter-heavy-wert' }

  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-preview-hinweis-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function withConfig(cfg: unknown) {
    fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), JSON.stringify(cfg))
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    return import('../../src/main/session/preview-prompt')
  }

  it('falls back to the legacy handle and names the tier and entry when mis-assigned', async () => {
    const { buildPromptPreview: build } = await withConfig({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'spark-gemma4-26b' } } },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const preview = (await build('architect', CapabilityNiveau.A, LEGACY_TIERS))!
      expect(preview.modelResolved).toBe('alter-heavy-wert')
      expect(preview.modelHinweis).toContain('heavy')
      expect(preview.modelHinweis).toContain('spark-gemma4-26b')
    } finally {
      warn.mockRestore()
    }
  })

  it('resolves to the registry handle and carries no hinweis when correctly assigned', async () => {
    const { buildPromptPreview: build } = await withConfig({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    const preview = (await build('architect', CapabilityNiveau.A, LEGACY_TIERS))!
    expect(preview.modelResolved).toBe('opus')
    expect(preview.modelHinweis).toBeNull()
  })

  it('carries neither an overridden handle nor a hinweis, and does not warn, when unassigned', async () => {
    const { buildPromptPreview: build } = await withConfig({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: '' } } },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const preview = (await build('architect', CapabilityNiveau.A, LEGACY_TIERS))!
      expect(preview.modelResolved).toBe('alter-heavy-wert')
      expect(preview.modelHinweis).toBeNull()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
