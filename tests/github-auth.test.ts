import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock execFile for all tests
const mockExecFile = vi.fn()
vi.mock('../src/main/util/exec-util', () => ({
  execFileAsync: (...args: unknown[]) => mockExecFile(...args)
}))

import { detectGhCli, checkAuthStatus, getToken } from '../src/main/github/auth'

beforeEach(() => { mockExecFile.mockReset() })

describe('detectGhCli (GH-001)', () => {
  it('returns true when gh is installed', async () => {
    mockExecFile.mockResolvedValue({ stdout: '/usr/local/bin/gh\n', stderr: '' })
    expect(await detectGhCli()).toBe(true)
  })
  it('returns false when gh is not found', async () => {
    mockExecFile.mockRejectedValue(new Error('not found'))
    expect(await detectGhCli()).toBe(false)
  })
})

describe('checkAuthStatus (GH-001)', () => {
  it('returns authenticated status with username', async () => {
    mockExecFile.mockResolvedValue({
      stdout: 'github.com\n  Logged in to github.com account testuser\n',
      stderr: ''
    })
    const status = await checkAuthStatus()
    expect(status.authenticated).toBe(true)
    expect(status.username).toBe('testuser')
  })
  it('returns unauthenticated when gh auth status fails', async () => {
    mockExecFile.mockRejectedValue(new Error('not logged in'))
    const status = await checkAuthStatus()
    expect(status.authenticated).toBe(false)
  })
})

describe('getToken (GH-001, GH-002)', () => {
  it('returns token from gh auth token', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'ghp_abc123\n', stderr: '' })
    const token = await getToken()
    expect(token).toBe('ghp_abc123')
  })
  it('falls back to keychain PAT when gh auth token fails', async () => {
    // First call (gh auth token) fails, second call (security find-generic-password) succeeds
    mockExecFile
      .mockRejectedValueOnce(new Error('no gh token'))
      .mockResolvedValueOnce({ stdout: 'ghp_keychain789\n', stderr: '' })
    const token = await getToken()
    expect(token).toBe('ghp_keychain789')
  })
  it('returns null when both gh and keychain fail', async () => {
    mockExecFile.mockRejectedValue(new Error('no token'))
    const token = await getToken()
    expect(token).toBeNull()
  })
})
