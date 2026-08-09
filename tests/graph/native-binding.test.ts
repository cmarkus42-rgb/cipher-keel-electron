/**
 * tests/graph/native-binding.test.ts — resolution of native artefacts under asar.
 *
 * Background: vitest runs under Node (ABI 141), the app runs under Electron
 * (ABI 146). Both binaries coexist; resolution decides which one loads. Phase 8 /
 * Task 3 additionally covers asar: in a packaged build both native artefacts
 * nominally resolve into app.asar, from which neither a .node addon nor a .dylib
 * extension can be loaded.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  toUnpackedPath,
  resolveBetterSqliteBinding,
  resolveVecExtensionPath,
} from '../../src/main/graph/native-binding'

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
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns the ABI-specific path when that binary exists', () => {
    const dir = join(root, 'bin', 'darwin-arm64-146')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    const result = resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')

    expect(result).toBe(join(dir, 'better-sqlite3.node'))
  })

  it('returns undefined when no ABI-specific binary exists', () => {
    const result = resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')

    expect(result).toBeUndefined()
  })

  it('does not return a binary built for a different ABI', () => {
    const dir = join(root, 'bin', 'darwin-arm64-141')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    const result = resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')

    expect(result).toBeUndefined()
  })

  it('defaults to the running process platform, arch and ABI', () => {
    const dir = join(root, 'bin', `${process.platform}-${process.arch}-${process.versions.modules}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    expect(resolveBetterSqliteBinding(root)).toBe(join(dir, 'better-sqlite3.node'))
  })

  it('checks the unpacked location, not the archive index', () => {
    // Measured 2026-08-09: existsSync inside app.asar answers from the archive
    // index rather than from disk. The check must therefore hit the unpacked
    // path — reproduced here: the file exists only under app.asar.unpacked, but
    // the moduleRoot passed in points at app.asar.
    const unpackedDir = join(
      root, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'bin', 'darwin-arm64-146',
    )
    mkdirSync(unpackedDir, { recursive: true })
    writeFileSync(join(unpackedDir, 'better-sqlite3.node'), '')

    const moduleRoot = join(root, 'app.asar', 'node_modules', 'better-sqlite3')
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
