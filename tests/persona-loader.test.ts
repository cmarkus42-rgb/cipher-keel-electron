/**
 * Persona Loader tests.
 * Phase 3c / Task 8: loadPersona, getDefaultPersona
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadPersona,
  getDefaultPersona,
  PERSONA_DEFAULTS,
} from '../src/main/preset/shared/persona-loader'

// ---------------------------------------------------------------------------
// Temp directory helpers for loadPersona tests
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// loadPersona — known persona
// ---------------------------------------------------------------------------

describe('loadPersona — known persona', () => {
  it('returns file content for a known persona', () => {
    fs.writeFileSync(path.join(tmpDir, 'cipher.md'), '# Cipher\nDu bist Cipher.')

    const content = loadPersona('cipher', tmpDir)

    expect(content).not.toBeNull()
    expect(content).toContain('Cipher')
  })

  it('returns full file content unchanged', () => {
    const body = '# Theaitetos\nSocratic dialogue partner.'
    fs.writeFileSync(path.join(tmpDir, 'theaitetos.md'), body)

    expect(loadPersona('theaitetos', tmpDir)).toBe(body)
  })

  it('handles multi-line persona files', () => {
    const body = '# Cipher\n\n## Rolle\n\nDu bist...\n\n## Regeln\n\n1. Keine Fuellphrasen.'
    fs.writeFileSync(path.join(tmpDir, 'cipher.md'), body)

    expect(loadPersona('cipher', tmpDir)).toBe(body)
  })
})

// ---------------------------------------------------------------------------
// loadPersona — unknown persona returns null
// ---------------------------------------------------------------------------

describe('loadPersona — unknown persona', () => {
  it('returns null when persona file does not exist', () => {
    expect(loadPersona('nonexistent', tmpDir)).toBeNull()
  })

  it('returns null for empty string vorgabe', () => {
    expect(loadPersona('', tmpDir)).toBeNull()
  })

  it('returns null when directory does not exist', () => {
    expect(loadPersona('cipher', '/tmp/does-not-exist-keel-test')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// M-1: Path traversal adversarial tests
// ---------------------------------------------------------------------------

describe('loadPersona — path traversal prevention (F-001)', () => {
  it('rejects ../ traversal', () => {
    expect(loadPersona('../etc/passwd', tmpDir)).toBeNull()
  })

  it('rejects absolute path with /', () => {
    expect(loadPersona('/etc/passwd', tmpDir)).toBeNull()
  })

  it('rejects backslash traversal', () => {
    expect(loadPersona('..\\windows\\system32', tmpDir)).toBeNull()
  })

  it('rejects nested traversal', () => {
    expect(loadPersona('foo/../../../etc/passwd', tmpDir)).toBeNull()
  })

  it('rejects path with embedded slash', () => {
    expect(loadPersona('sub/cipher', tmpDir)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// PERSONA_DEFAULTS constant
// ---------------------------------------------------------------------------

describe('PERSONA_DEFAULTS constant', () => {
  it('maps systems-engineer to cipher', () => {
    expect(PERSONA_DEFAULTS['systems-engineer']).toBe('cipher')
  })

  it('maps architect to theaitetos', () => {
    expect(PERSONA_DEFAULTS['architect']).toBe('theaitetos')
  })

  it('maps workshop to cipher', () => {
    expect(PERSONA_DEFAULTS['workshop']).toBe('cipher')
  })

  it('maps debugger to cipher', () => {
    expect(PERSONA_DEFAULTS['debugger']).toBe('cipher')
  })

  it('maps testing-assistant to cipher', () => {
    expect(PERSONA_DEFAULTS['testing-assistant']).toBe('cipher')
  })

  it('maps cyber-factory to cipher', () => {
    expect(PERSONA_DEFAULTS['cyber-factory']).toBe('cipher')
  })

  it('contains exactly 6 entries', () => {
    expect(Object.keys(PERSONA_DEFAULTS)).toHaveLength(6)
  })
})

// ---------------------------------------------------------------------------
// getDefaultPersona
// ---------------------------------------------------------------------------

describe('getDefaultPersona', () => {
  it('returns cipher for systems-engineer', () => {
    expect(getDefaultPersona('systems-engineer')).toBe('cipher')
  })

  it('returns theaitetos for architect', () => {
    expect(getDefaultPersona('architect')).toBe('theaitetos')
  })

  it('returns cipher for workshop', () => {
    expect(getDefaultPersona('workshop')).toBe('cipher')
  })

  it('returns cipher for debugger', () => {
    expect(getDefaultPersona('debugger')).toBe('cipher')
  })

  it('returns cipher for testing-assistant', () => {
    expect(getDefaultPersona('testing-assistant')).toBe('cipher')
  })

  it('returns null for unknown presetId', () => {
    expect(getDefaultPersona('unknown-preset')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getDefaultPersona('')).toBeNull()
  })
})
