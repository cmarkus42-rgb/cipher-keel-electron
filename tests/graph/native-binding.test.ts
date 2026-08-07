/**
 * tests/graph/native-binding.test.ts — ABI-korrekte Aufloesung der better-sqlite3-Binary.
 *
 * Hintergrund: vitest laeuft unter Node (ABI 141), die App unter Electron (ABI 146).
 * Beide Binaries koexistieren; die Aufloesung entscheidet, welche geladen wird.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBetterSqliteBinding } from '../../src/main/graph/native-binding'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveBetterSqliteBinding', () => {
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
})
