/**
 * native-binding.ts — Aufloesung der nativen Artefakte des Knowledge Graph.
 *
 * Zwei getrennte Probleme, dieselbe Ursache:
 *
 * 1. ABI. vitest laeuft unter Node, die App unter Electron — verschiedene
 *    NODE_MODULE_VERSION. electron-rebuild legt den Electron-Build unter
 *    bin/<platform>-<arch>-<abi>/ ab, waehrend die Standardaufloesung zuerst
 *    build/Release findet (den Node-Build). Ein expliziter nativeBinding laesst
 *    beide nebeneinander bestehen.
 *
 * 2. asar. Im gepackten Build liegen beide Artefakte nominell in app.asar.
 *    Electron biegt process.dlopen selbst auf app.asar.unpacked um, sqlite3s
 *    eigenes dlopen (fuer die vec0-Erweiterung) tut das nicht. Und existsSync
 *    beantwortet innerhalb von app.asar den Archiv-Index statt die Platte —
 *    gemessen 2026-08-09. Deshalb wird jeder Pfad vor Pruefung und Rueckgabe
 *    auf das entpackte Verzeichnis gebogen.
 */

import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'

const ASAR_SEGMENT = `${sep}app.asar${sep}`
const UNPACKED_SEGMENT = `${sep}app.asar.unpacked${sep}`

/**
 * Biegt einen Pfad innerhalb von app.asar auf app.asar.unpacked um.
 * Idempotent; ausserhalb eines gepackten Builds ein No-op.
 */
export function toUnpackedPath(p: string): string {
  if (p.includes(UNPACKED_SEGMENT)) return p
  return p.replace(ASAR_SEGMENT, UNPACKED_SEGMENT)
}

/**
 * Liefert den Pfad zum ABI-passenden better-sqlite3-Addon, oder undefined, wenn
 * keines existiert — dann faellt der Aufrufer auf die Standardaufloesung zurueck.
 *
 * @param moduleRoot Pfad zum better-sqlite3-Paketverzeichnis.
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
      'falling back to default resolution, which will load the Node-ABI build and throw',
  )
  return undefined
}

/**
 * Liefert den ladbaren Pfad der sqlite-vec-Erweiterung. sqlite3 laedt sie ueber
 * sein eigenes dlopen, das kein asar kennt — der Pfad muss deshalb auf das
 * entpackte Verzeichnis zeigen.
 *
 * @param loadablePath Rueckgabe von sqliteVec.getLoadablePath().
 */
export function resolveVecExtensionPath(loadablePath: string): string {
  return toUnpackedPath(loadablePath)
}
