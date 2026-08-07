import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecFile = vi.fn()
vi.mock('../src/main/util/exec-util', () => ({
  execFileAsync: (...args: unknown[]) => mockExecFile(...args)
}))

import { createRepo, linkRepo, listUserRepos, switchRepo } from '../src/main/github/repo'

const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
const ciSelftestUnusedVariable = 'deliberately unused, to prove the lint gate turns red'

const apiRepoResponse = JSON.stringify({
  html_url: 'https://github.com/user/my-repo',
  name: 'my-repo',
  owner: { login: 'user' },
  private: false,
})

beforeEach(() => { mockExecFile.mockReset() })

// ---------------------------------------------------------------------------
// createRepo (GH-004)
// ---------------------------------------------------------------------------
describe('createRepo (GH-004)', () => {
  it('calls gh repo create with correct args', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: 'https://github.com/user/my-project\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await createRepo('my-project', 'A project', 'private', '/tmp/proj')

    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repo', 'create', 'my-project', '--private']),
      expect.anything()
    )
  })

  it('calls git remote add origin with the repo URL', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: 'https://github.com/user/my-project\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await createRepo('my-project', 'A project', 'public', '/tmp/proj')

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['remote', 'add', 'origin', 'https://github.com/user/my-project']),
      expect.anything()
    )
  })

  it('never calls git clone (GH-006)', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: 'https://github.com/user/my-project\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await createRepo('my-project', 'A project', 'public', '/tmp/proj')

    for (const call of mockExecFile.mock.calls) {
      expect(call[1] as string[]).not.toContain('clone')
    }
  })

  it('returns ok:true with RepoInfo on success', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: 'https://github.com/user/my-project\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await createRepo('my-project', 'desc', 'private', '/tmp/proj')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repo.fullName).toBe('user/my-project')
      expect(result.repo.private).toBe(true)
    }
  })

  it('returns github_unreachable on timeout (GH-013)', async () => {
    mockExecFile.mockRejectedValue(abortError)
    const result = await createRepo('my-project', 'desc', 'private', '/tmp/proj')
    expect(result).toEqual({ ok: false, error: 'github_unreachable' })
  })

  it('masks ghp_ tokens in error messages (GH-014)', async () => {
    mockExecFile.mockRejectedValue(new Error('request failed with token ghp_abc123secret'))
    const result = await createRepo('my-project', 'desc', 'private', '/tmp/proj')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain('ghp_abc123secret')
      expect(result.error).toContain('gh***')
    }
  })

  it('masks gho_ tokens in error messages (GH-014)', async () => {
    mockExecFile.mockRejectedValue(new Error('oauth error gho_secrettoken99'))
    const result = await createRepo('my-project', 'desc', 'private', '/tmp/proj')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain('gho_secrettoken99')
      expect(result.error).toContain('gh***')
    }
  })
})

// ---------------------------------------------------------------------------
// linkRepo (GH-005)
// ---------------------------------------------------------------------------
describe('linkRepo (GH-005)', () => {
  it('validates repo via gh api /repos/{owner}/{repo}', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: apiRepoResponse, stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await linkRepo('user/my-repo', '/tmp/proj')

    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['api', '/repos/user/my-repo']),
      expect.anything()
    )
  })

  it('sets git remote to the validated URL', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: apiRepoResponse, stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    await linkRepo('user/my-repo', '/tmp/proj')

    const gitCall = mockExecFile.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[]).includes('origin')
    )
    expect(gitCall).toBeDefined()
    expect(gitCall![1]).toContain('https://github.com/user/my-repo')
  })

  it('returns ok:true with RepoInfo on success', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: apiRepoResponse, stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await linkRepo('user/my-repo', '/tmp/proj')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repo.fullName).toBe('user/my-repo')
      expect(result.repo.url).toBe('https://github.com/user/my-repo')
    }
  })

  it('returns github_unreachable on timeout (GH-013)', async () => {
    mockExecFile.mockRejectedValue(abortError)
    const result = await linkRepo('user/my-repo', '/tmp/proj')
    expect(result).toEqual({ ok: false, error: 'github_unreachable' })
  })
})

// ---------------------------------------------------------------------------
// listUserRepos (GH-015)
// ---------------------------------------------------------------------------
describe('listUserRepos (GH-015)', () => {
  const apiList = [
    { name: 'repo1', full_name: 'user/repo1', html_url: 'https://github.com/user/repo1', private: false },
    { name: 'repo2', full_name: 'user/repo2', html_url: 'https://github.com/user/repo2', private: true },
  ]

  it('calls gh api /user/repos and returns parsed list', async () => {
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(apiList), stderr: '' })

    const repos = await listUserRepos()
    expect(repos).toHaveLength(2)
    expect(repos[0].name).toBe('repo1')
    expect(repos[1].fullName).toBe('user/repo2')
    expect(repos[1].private).toBe(true)

    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['api']),
      expect.anything()
    )
  })

  it('passes page parameter in API URL', async () => {
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify([]), stderr: '' })

    await listUserRepos(undefined, 2)

    const ghCall = mockExecFile.mock.calls[0]
    const url = (ghCall[1] as string[]).find(a => a.includes('/user/repos'))
    expect(url).toContain('page=2')
  })

  it('returns empty array on timeout (GH-013)', async () => {
    mockExecFile.mockRejectedValue(abortError)
    const repos = await listUserRepos()
    expect(repos).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// switchRepo (GH-005)
// ---------------------------------------------------------------------------
describe('switchRepo (GH-005)', () => {
  it('delegates to linkRepo — validates via gh api', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: JSON.stringify({
        html_url: 'https://github.com/user/other',
        name: 'other',
        owner: { login: 'user' },
        private: false,
      }), stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await switchRepo('user/other', '/tmp/proj')
    expect(result.ok).toBe(true)
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['api', '/repos/user/other']),
      expect.anything()
    )
  })

  it('returns github_unreachable on timeout (GH-013)', async () => {
    mockExecFile.mockRejectedValue(abortError)
    const result = await switchRepo('user/other', '/tmp/proj')
    expect(result).toEqual({ ok: false, error: 'github_unreachable' })
  })
})
