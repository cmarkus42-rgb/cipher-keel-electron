import { execFileAsync } from '../util/exec-util'

const SERVICE = 'cipher-keel-github'
const ACCOUNT = 'pat'

export async function storePat(token: string): Promise<void> {
  await execFileAsync('security', [
    'add-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w', token, '-U'
  ])
}

export async function retrievePat(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function deletePat(): Promise<void> {
  try {
    await execFileAsync('security', [
      'delete-generic-password', '-s', SERVICE, '-a', ACCOUNT
    ])
  } catch { /* ignore if not found */ }
}
