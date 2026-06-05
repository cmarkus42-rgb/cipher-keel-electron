import { execFileAsync } from '../util/exec-util'

const TIMEOUT_MS = 10_000

export interface RepoInfo {
  name: string
  fullName: string
  url: string
  private: boolean
}

export type RepoResult =
  | { ok: true; repo: RepoInfo }
  | { ok: false; error: string }

function maskToken(msg: string): string {
  return msg.replace(/gh[po]_[A-Za-z0-9]+/g, 'gh***')
}

/** Runs execFileAsync with an AbortController-based 10 s timeout (GH-013). */
async function spawnWithTimeout(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const result = await execFileAsync(cmd, args, { signal: controller.signal, ...opts })
    clearTimeout(timer)
    return result
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

export async function createRepo(
  name: string,
  desc: string,
  visibility: 'public' | 'private',
  projectDir: string,
): Promise<RepoResult> {
  try {
    const { stdout } = await spawnWithTimeout('gh', [
      'repo', 'create', name,
      '--description', desc,
      `--${visibility}`,
    ])

    // gh repo create outputs the repo URL as the last non-empty line
    const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    const url = lines.find((l) => l.startsWith('https://github.com/')) ?? lines[lines.length - 1]
    const parts = url.replace('https://github.com/', '').split('/')
    const owner = parts[0] ?? ''
    const repoName = parts[1] ?? name

    await spawnWithTimeout('git', ['-C', projectDir, 'remote', 'add', 'origin', url])

    return {
      ok: true,
      repo: { name: repoName, fullName: `${owner}/${repoName}`, url, private: visibility === 'private' },
    }
  } catch (err: unknown) {
    const e = err as Error
    if (e.name === 'AbortError') return { ok: false, error: 'github_unreachable' }
    return { ok: false, error: maskToken(e.message) }
  }
}

export async function linkRepo(ownerRepo: string, projectDir: string): Promise<RepoResult> {
  try {
    const { stdout } = await spawnWithTimeout('gh', ['api', `/repos/${ownerRepo}`])
    const data = JSON.parse(stdout) as {
      html_url: string
      name: string
      owner: { login: string }
      private: boolean
    }
    const url = data.html_url

    // Prefer set-url (remote already exists), fall back to add
    try {
      await spawnWithTimeout('git', ['-C', projectDir, 'remote', 'set-url', 'origin', url])
    } catch {
      await spawnWithTimeout('git', ['-C', projectDir, 'remote', 'add', 'origin', url])
    }

    return {
      ok: true,
      repo: {
        name: data.name,
        fullName: `${data.owner.login}/${data.name}`,
        url,
        private: data.private,
      },
    }
  } catch (err: unknown) {
    const e = err as Error
    if (e.name === 'AbortError') return { ok: false, error: 'github_unreachable' }
    return { ok: false, error: maskToken(e.message) }
  }
}

export async function listUserRepos(token?: string, page = 1): Promise<RepoInfo[]> {
  try {
    const args: string[] = ['api', `/user/repos?per_page=30&page=${page}`]
    if (token) args.push('--header', `Authorization: Bearer ${token}`)
    const { stdout } = await spawnWithTimeout('gh', args)
    const data = JSON.parse(stdout) as Array<{
      name: string
      full_name: string
      html_url: string
      private: boolean
    }>
    return data.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      private: r.private,
    }))
  } catch {
    return []
  }
}

export async function switchRepo(ownerRepo: string, projectDir: string): Promise<RepoResult> {
  return linkRepo(ownerRepo, projectDir)
}
