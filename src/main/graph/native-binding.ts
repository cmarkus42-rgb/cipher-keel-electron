/**
 * native-binding.ts — resolution of the Knowledge Graph's native artefacts.
 *
 * Two separate problems, one root cause:
 *
 * 1. ABI. vitest runs under Node, the app runs under Electron — different
 *    NODE_MODULE_VERSION. electron-rebuild places the Electron build under
 *    bin/<platform>-<arch>-<abi>/, while the default resolution finds
 *    build/Release first (the Node build). An explicit nativeBinding lets both
 *    coexist without a rebuild toggle.
 *
 * 2. asar. In a packaged build both artefacts nominally live inside app.asar.
 *    Electron's own process.dlopen patch copes with a .node file inside the
 *    archive by extracting it to a temp file; the separate redirect to
 *    app.asar.unpacked applies to files electron-builder actually unpacked onto
 *    disk. sqlite3's own dlopen (used to load the vec0 extension) has neither
 *    mechanism — it hands the raw path straight to the OS loader. And existsSync
 *    inside app.asar answers from the archive index, not from disk — measured
 *    2026-08-09. So every path is rewritten to the unpacked directory before it
 *    is checked and before it is returned.
 */

import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'

const ASAR_SEGMENT = `${sep}app.asar${sep}`
const UNPACKED_SEGMENT = `${sep}app.asar.unpacked${sep}`

/**
 * Rewrites a path inside app.asar to app.asar.unpacked. A no-op outside a
 * packaged build, and naturally idempotent: once rewritten, the path no longer
 * contains an app.asar segment, since the character after "app.asar" is then
 * "." rather than a separator, so a second call finds nothing to replace.
 */
export function toUnpackedPath(p: string): string {
  return p.replace(ASAR_SEGMENT, UNPACKED_SEGMENT)
}

/**
 * Returns the path to the ABI-matching better-sqlite3 addon, or undefined when
 * none exists — the caller should then fall back to default resolution.
 *
 * @param moduleRoot Path to the better-sqlite3 package directory.
 */
export function resolveBetterSqliteBinding(
  moduleRoot: string,
  platform: string = process.platform,
  arch: string = process.arch,
  abi: string = process.versions.modules,
): string | undefined {
  const candidate = toUnpackedPath(
    join(moduleRoot, 'bin', `${platform}-${arch}-${abi}`, 'better-sqlite3.node'),
  )
  if (existsSync(candidate)) return candidate

  console.warn(
    `[native-binding] no ABI-matching better-sqlite3 addon at ${candidate} — ` +
      'falling back to default resolution, which under Electron will likely load ' +
      'the Node-ABI build and fail to open',
  )
  return undefined
}

/**
 * Returns the loadable path for the sqlite-vec extension. sqlite3 loads it
 * through its own dlopen, which has no asar awareness — the path must
 * therefore point at the unpacked directory.
 *
 * @param loadablePath Return value of sqliteVec.getLoadablePath().
 */
export function resolveVecExtensionPath(loadablePath: string): string {
  return toUnpackedPath(loadablePath)
}
