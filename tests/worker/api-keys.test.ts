import { describe, it, expect } from 'vitest'
import {
  resolveApiKey,
  envVarName,
  keychainService,
} from '../../src/main/worker/api-keys'

describe('naming', () => {
  it('derives a keychain service from the reference', () => {
    expect(keychainService('openrouter')).toBe('cipher-keel-api-openrouter')
  })

  it('derives an environment variable, folding punctuation to underscores', () => {
    expect(envVarName('openrouter')).toBe('CIPHER_KEEL_API_OPENROUTER')
    expect(envVarName('together.ai')).toBe('CIPHER_KEEL_API_TOGETHER_AI')
  })
})

describe('resolveApiKey', () => {
  it('prefers the keychain', async () => {
    const key = await resolveApiKey('x', {
      keychain: async () => 'aus-dem-keychain',
      env: () => 'aus-der-umgebung',
    })
    expect(key).toBe('aus-dem-keychain')
  })

  // Deliberate order: a forgotten variable in a shell profile must not silently override
  // the key a user believes they stored — the failure would look like a provider problem.
  it('falls back to the environment only when the keychain has nothing', async () => {
    const key = await resolveApiKey('x', {
      keychain: async () => null,
      env: () => 'aus-der-umgebung',
    })
    expect(key).toBe('aus-der-umgebung')
  })

  it('returns null when neither source has a key, rather than throwing', async () => {
    const key = await resolveApiKey('x', { keychain: async () => null, env: () => null })
    expect(key).toBeNull()
  })

  it('treats an empty keychain answer as absent', async () => {
    const key = await resolveApiKey('x', { keychain: async () => '', env: () => 'env' })
    expect(key).toBe('env')
  })
})
