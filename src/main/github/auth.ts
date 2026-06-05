import { execFileAsync } from '../util/exec-util'

export interface AuthStatus {
  ghInstalled: boolean
  authenticated: boolean
  username: string | null
}

export async function detectGhCli(): Promise<boolean> {
  try {
    await execFileAsync('which', ['gh'])
    return true
  } catch {
    return false
  }
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  const installed = await detectGhCli()
  if (!installed) return { ghInstalled: false, authenticated: false, username: null }
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'status'])
    const match = stdout.match(/account\s+(\S+)/)
    return { ghInstalled: true, authenticated: true, username: match?.[1] ?? null }
  } catch {
    return { ghInstalled: true, authenticated: false, username: null }
  }
}

export async function getToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'])
    const token = stdout.trim()
    return token || null
  } catch {
    // Fallback: try keychain PAT
    try {
      const { retrievePat } = await import('./token-store')
      return await retrievePat()
    } catch {
      return null
    }
  }
}

export async function triggerLogin(): Promise<void> {
  await execFileAsync('gh', ['auth', 'login', '--web'])
}
