import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecFile = vi.fn()
vi.mock('../src/main/util/exec-util', () => ({
  execFileAsync: (...args: unknown[]) => mockExecFile(...args)
}))

import { storePat, retrievePat, deletePat } from '../src/main/github/token-store'

beforeEach(() => { mockExecFile.mockReset() })

describe('Token Store — macOS Keychain (GH-002, GH-014)', () => {
  it('storePat calls security add-generic-password', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    await storePat('ghp_test123')
    expect(mockExecFile).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['add-generic-password', '-w', 'ghp_test123'])
    )
  })

  it('storePat gibt die Kommandozeile aus err.message niemals weiter', async () => {
    mockExecFile.mockRejectedValue(
      Object.assign(new Error(
        'Command failed: security add-generic-password -s cipher-keel-github -a pat -w ghp_SUPER_GEHEIM -U'
      ), { stderr: 'security: SecKeychainItemCreateFromContent: User interaction is not allowed.' })
    )
    await expect(storePat('ghp_SUPER_GEHEIM')).rejects.toThrow(/User interaction is not allowed/)
    await expect(storePat('ghp_SUPER_GEHEIM')).rejects.not.toThrow(/ghp_SUPER_GEHEIM/)
  })

  it('storePat unterdrueckt auch ein stderr, das den Token selbst enthaelt', async () => {
    mockExecFile.mockRejectedValue(
      Object.assign(new Error('Command failed'), { stderr: 'echo ghp_SUPER_GEHEIM' })
    )
    await expect(storePat('ghp_SUPER_GEHEIM')).rejects.toThrow(/unterdrueckt/)
  })

  it('storePat sagt es, wenn der Aufruf gar keinen Fehlertext lieferte', async () => {
    mockExecFile.mockRejectedValue(new Error('Command failed'))
    await expect(storePat('ghp_test')).rejects.toThrow(/kein Fehlertext/)
  })

  it('retrievePat returns token from keychain', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'ghp_stored456\n', stderr: '' })
    expect(await retrievePat()).toBe('ghp_stored456')
  })

  it('retrievePat returns null when not found', async () => {
    mockExecFile.mockRejectedValue(new Error('could not be found'))
    expect(await retrievePat()).toBeNull()
  })

  it('deletePat calls security delete-generic-password', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    await deletePat()
    expect(mockExecFile).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['delete-generic-password'])
    )
  })
})
