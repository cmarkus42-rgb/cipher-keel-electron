import { execFileAsync } from '../util/exec-util'
import { ursacheOhneArgv } from '../worker/api-keys'

const SERVICE = 'cipher-keel-github'
const ACCOUNT = 'pat'

/**
 * Store the GitHub PAT in the keychain.
 *
 * The original error from `execFile` must never reach a caller: it carries the whole
 * argv, including the token itself, in `err.message`. `ipc-handlers.ts` returns caught
 * errors' `.message` straight to the renderer (GITHUB_STORE_PAT), which is reachable from
 * the kickoff wizard -- an unguarded catch here would render the user's PAT into the UI on
 * a locked or unavailable keychain. Reuses `ursacheOhneArgv` from `worker/api-keys.ts`,
 * which fixed the identical shape of leak on `storeInKeychain` -- one implementation, not
 * a second idiom for the same redaction.
 */
export async function storePat(token: string): Promise<void> {
  try {
    await execFileAsync('security', [
      'add-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w', token, '-U'
    ])
  } catch (err) {
    throw new Error(
      `Der Schluesselbund hat den GitHub-Token nicht angenommen. Ist er entsperrt? ` +
      `(${ursacheOhneArgv(err, token)})`
    )
  }
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
