/**
 * api-keys — where an API key comes from, and where it deliberately does not.
 *
 * Not from the config file. `cipher-keel-config.json` is written with mode 0600, which
 * keeps it off other accounts and nothing more: it is plain text, it lands in backups, and
 * it is the file a user is most likely to paste into a chat when asking for help. An
 * endpoint therefore names a *reference*, and this module turns the reference into a key.
 *
 * Two sources, keychain first:
 *
 *   1. the macOS keychain, service `cipher-keel-api-<ref>` — the same `security`-CLI
 *      mechanism `github/token-store.ts` already uses, so there is one idiom rather than two
 *   2. the environment, `CIPHER_KEEL_API_<REF>` — for headless runs and for anyone who
 *      would rather manage keys their own way
 *
 * The order matters and is deliberate. If the environment won, a forgotten variable in a
 * shell profile would quietly override the key a user believes they stored — and the
 * failure would look like a provider problem rather than a local one.
 */

import { execFileAsync } from '../util/exec-util'

const SERVICE_PREFIX = 'cipher-keel-api-'
const ENV_PREFIX = 'CIPHER_KEEL_API_'

/** Keychain service name for a reference. Exported so the settings UI can name it too. */
export function keychainService(ref: string): string {
  return `${SERVICE_PREFIX}${ref}`
}

/** Environment variable name for a reference: `openrouter` → `CIPHER_KEEL_API_OPENROUTER`. */
export function envVarName(ref: string): string {
  return ENV_PREFIX + ref.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

export async function readFromKeychain(ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password', '-s', keychainService(ref), '-a', 'key', '-w',
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function storeInKeychain(ref: string, key: string): Promise<void> {
  await execFileAsync('security', [
    'add-generic-password', '-s', keychainService(ref), '-a', 'key', '-w', key, '-U',
  ])
}

export function readFromEnv(ref: string): string | null {
  return process.env[envVarName(ref)]?.trim() || null
}

/**
 * The key for a reference, or null when neither source has one. Never throws — the caller
 * turns the absence into a message that names what to do about it.
 */
export async function resolveApiKey(
  ref: string,
  sources: {
    keychain?: (ref: string) => Promise<string | null>
    env?: (ref: string) => string | null
  } = {},
): Promise<string | null> {
  const fromKeychain = await (sources.keychain ?? readFromKeychain)(ref)
  if (fromKeychain) return fromKeychain
  return (sources.env ?? readFromEnv)(ref)
}
