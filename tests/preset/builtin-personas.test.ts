// tests/preset/builtin-personas.test.ts
import { describe, it, expect } from 'vitest'
import {
  getBuiltinPersona,
  resolvePersona,
  PERSONA_DEFAULTS,
} from '../../src/main/preset/shared/persona-loader'

describe('builtin personas', () => {
  it('resolves every persona referenced by persona-defaults.json', () => {
    for (const [presetId, vorgabe] of Object.entries(PERSONA_DEFAULTS)) {
      expect(getBuiltinPersona(vorgabe), `${presetId} -> ${vorgabe}`).not.toBeNull()
    }
  })

  it('returns null for an unknown persona', () => {
    expect(getBuiltinPersona('nonexistent')).toBeNull()
  })

  it('returns null for an empty identifier', () => {
    expect(getBuiltinPersona('')).toBeNull()
  })

  it('cipher carries its defining traits', () => {
    const cipher = getBuiltinPersona('cipher')!
    expect(cipher).toMatch(/Cipher/)
    expect(cipher.length).toBeGreaterThan(200)
  })

  it('resolvePersona falls back to the builtin when no directory is given', () => {
    expect(resolvePersona('theaitetos')).toBe(getBuiltinPersona('theaitetos'))
  })

  it('resolvePersona prefers a user directory over the builtin', () => {
    // A directory that does not contain the persona falls through to the builtin.
    expect(resolvePersona('cipher', '/nonexistent-dir')).toBe(getBuiltinPersona('cipher'))
  })
})
