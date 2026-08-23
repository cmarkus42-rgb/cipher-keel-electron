import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CipherKeelConfig } from '../../src/main/config/config-store'

vi.mock('../../src/main/config/config-store', () => ({
  configStore: { get: vi.fn(() => zuordnung) },
}))

let zuordnung: CipherKeelConfig['modelle']
beforeEach(() => {
  zuordnung = {
    zuordnung: {
      tiers: { light: '', standard: '', heavy: '' },
      rollen: { tagging: '', worker: '', rechercheur: '' },
      sitzungen: { 'niveau-b': '' },
    },
    eintraege: [],
  }
})

describe('KeelHarnessAdapter', () => {
  it('ist ohne belegten Platz nicht verfuegbar und sagt warum', async () => {
    const { KeelHarnessAdapter } = await import('../../src/main/agent/adapters/keel-harness')
    const a = new KeelHarnessAdapter()
    expect(a.sitzungsart).toBe('eigene-schleife')
    expect(a.isAvailable()).toBe(false)
    expect(a.nichtVerfuegbarGrund()).toContain('Sitzung „Niveau B"')
    expect(a.nichtVerfuegbarGrund()).toContain('Einstellungen')
  })

  it('ist mit einem local-http-Eintrag verfuegbar', async () => {
    zuordnung.zuordnung.sitzungen['niveau-b'] = 'spark-qwen38-27b'
    const { KeelHarnessAdapter } = await import('../../src/main/agent/adapters/keel-harness')
    expect(new KeelHarnessAdapter().isAvailable()).toBe(true)
  })

  it('ist mit einem cli-harness-Eintrag gesperrt, mit dem Text aus eignung.ts', async () => {
    zuordnung.zuordnung.sitzungen['niveau-b'] = 'claude-opus-cli'
    const { KeelHarnessAdapter } = await import('../../src/main/agent/adapters/keel-harness')
    const a = new KeelHarnessAdapter()
    expect(a.isAvailable()).toBe(false)
    // Kein neuer Text: die Sperre hat schon einen, und zwei Formulierungen derselben Regel
    // sind zwei Stellen, an denen sie sich aendern kann.
    expect(a.nichtVerfuegbarGrund()).toContain('CLI-Harness')
  })
})
