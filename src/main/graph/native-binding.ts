/**
 * native-binding.ts — ABI-correct resolution of the better-sqlite3 native addon.
 *
 * vitest runs under Node, the app runs under Electron — different NODE_MODULE_VERSION.
 * electron-rebuild places the Electron build in bin/<platform>-<arch>-<abi>/, while the
 * default `bindings()` lookup finds build/Release first (the Node build). Passing an
 * explicit nativeBinding lets both coexist without a rebuild toggle.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Returns the path to the ABI-matching better-sqlite3 addon, or undefined when none
 * exists — in which case the caller should fall back to default resolution.
 *
 * @param moduleRoot Path to the better-sqlite3 package directory.
 */
export function resolveBetterSqliteBinding(
  moduleRoot: string,
  platform: string = process.platform,
  arch: string = process.arch,
  abi: string = process.versions.modules,
): string | undefined {
  const candidate = join(moduleRoot, 'bin', `${platform}-${arch}-${abi}`, 'better-sqlite3.node')
  return existsSync(candidate) ? candidate : undefined
}
