import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('storeInKeychain redigiert den Schluessel aus Fehlern', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.doUnmock('../../src/main/util/exec-util'))

  async function mitFehler(fehler: unknown) {
    vi.doMock('../../src/main/util/exec-util', () => ({
      execFileAsync: () => Promise.reject(fehler),
    }))
    return import('../../src/main/worker/api-keys')
  }

  it('gibt die Kommandozeile aus err.message niemals weiter', async () => {
    const { storeInKeychain } = await mitFehler(
      Object.assign(new Error(
        'Command failed: security add-generic-password -s x -a key -w SUPER-GEHEIM -U'
      ), { stderr: 'security: SecKeychainItemCreateFromContent: User interaction is not allowed.' })
    )
    await expect(storeInKeychain('probe', 'SUPER-GEHEIM')).rejects.toThrow(
      /User interaction is not allowed/
    )
    await expect(storeInKeychain('probe', 'SUPER-GEHEIM')).rejects.not.toThrow(/SUPER-GEHEIM/)
  })

  it('unterdrueckt auch ein stderr, das den Schluessel selbst enthaelt', async () => {
    const { storeInKeychain } = await mitFehler(
      Object.assign(new Error('Command failed'), { stderr: 'echo SUPER-GEHEIM' })
    )
    await expect(storeInKeychain('probe', 'SUPER-GEHEIM')).rejects.toThrow(/unterdrueckt/)
  })

  it('sagt es, wenn der Aufruf gar keinen Fehlertext lieferte', async () => {
    const { storeInKeychain } = await mitFehler(new Error('Command failed'))
    await expect(storeInKeychain('probe', 'geheim')).rejects.toThrow(/kein Fehlertext/)
  })
})
