/**
 * Aufloesung nativer Artefakte unter asar.
 * Phase 8 / Task 3. Anlass: im gepackten Build zeigen beide Pfade in app.asar,
 * aus dem sich weder ein .node noch ein .dylib laden laesst.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  toUnpackedPath,
  resolveBetterSqliteBinding,
  resolveVecExtensionPath,
} from '../src/main/graph/native-binding'

describe('toUnpackedPath', () => {
  it('redirects a path inside app.asar to the unpacked directory', () => {
    expect(
      toUnpackedPath('/Apps/keel.app/Contents/Resources/app.asar/node_modules/x/y.node'),
    ).toBe('/Apps/keel.app/Contents/Resources/app.asar.unpacked/node_modules/x/y.node')
  })

  it('leaves an ordinary development path untouched', () => {
    expect(toUnpackedPath('/repo/node_modules/x/y.node')).toBe('/repo/node_modules/x/y.node')
  })

  it('is idempotent — an already unpacked path is not rewritten twice', () => {
    const p = '/Apps/keel.app/Contents/Resources/app.asar.unpacked/node_modules/x/y.node'
    expect(toUnpackedPath(p)).toBe(p)
  })

  it('does not match a directory that merely starts with app.asar', () => {
    const p = '/repo/app.asarbackup/node_modules/x/y.node'
    expect(toUnpackedPath(p)).toBe(p)
  })
})

describe('resolveBetterSqliteBinding', () => {
  it('returns the addon path when an ABI-matching build exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
    const dir = join(root, 'bin', 'darwin-arm64-146')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    expect(resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')).toBe(
      join(dir, 'better-sqlite3.node'),
    )
  })

  it('returns undefined when no ABI-matching build exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
    expect(resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')).toBeUndefined()
  })

  it('checks the unpacked location, not the archive index', () => {
    // Gemessen 2026-08-09: existsSync beantwortet innerhalb von app.asar den
    // Archiv-Index statt die Platte. Geprueft werden muss deshalb der entpackte
    // Pfad — hier nachgestellt: die Datei liegt NUR unter app.asar.unpacked,
    // der uebergebene moduleRoot zeigt aber nach app.asar.
    const tmp = mkdtempSync(join(tmpdir(), 'keel-asar-'))
    const unpackedDir = join(
      tmp, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'bin', 'darwin-arm64-146',
    )
    mkdirSync(unpackedDir, { recursive: true })
    writeFileSync(join(unpackedDir, 'better-sqlite3.node'), '')

    const moduleRoot = join(tmp, 'app.asar', 'node_modules', 'better-sqlite3')
    expect(resolveBetterSqliteBinding(moduleRoot, 'darwin', 'arm64', '146')).toBe(
      join(unpackedDir, 'better-sqlite3.node'),
    )
  })
})

describe('resolveVecExtensionPath', () => {
  it('redirects the sqlite-vec loadable path out of the archive', () => {
    expect(
      resolveVecExtensionPath(
        '/Apps/keel.app/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib',
      ),
    ).toBe(
      '/Apps/keel.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib',
    )
  })

  it('leaves the development path untouched', () => {
    const p = '/repo/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'
    expect(resolveVecExtensionPath(p)).toBe(p)
  })
})
