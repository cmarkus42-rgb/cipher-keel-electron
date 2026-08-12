// tests/preset/builtin-personas.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

  // Corrected after review: the original passed '/nonexistent-dir' and therefore
  // exercised the FALLBACK, not the precedence its name claims — deleting the
  // `if (personasDir)` branch outright would still have passed.
  it('resolvePersona prefers a user directory over the builtin', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-personas-'))
    try {
      fs.writeFileSync(path.join(dir, 'cipher.md'), '# Cipher (user override)\n', 'utf-8')
      const resolved = resolvePersona('cipher', dir)
      expect(resolved).toBe('# Cipher (user override)\n')
      expect(resolved).not.toBe(getBuiltinPersona('cipher'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to the builtin when the user directory lacks the persona', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-personas-'))
    try {
      expect(resolvePersona('cipher', dir)).toBe(getBuiltinPersona('cipher'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
