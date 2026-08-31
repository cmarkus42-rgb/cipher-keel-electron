/**
 * Packaging configuration — regression guard.
 * Phase 8 / Task 1. Every assertion here has a measured finding as its reason
 * (see docs/superpowers/plans/2026-08-09-phase-8-packaging.md, "Starting point").
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface MacTarget { target: string; arch: string[] }
interface PkgJson {
  main: string
  scripts: Record<string, string>
  build: {
    appId: string
    productName: string
    directories?: { output?: string; buildResources?: string }
    files?: string[]
    asarUnpack?: string[]
    mac: { target: MacTarget[]; category: string; icon?: string }
    dmg?: unknown
  }
}

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as PkgJson

describe('electron-builder configuration', () => {
  it('does not write its output into the electron-vite build directory', () => {
    // Finding 1: the default 'dist' collides with electron-vite. electron-builder
    // excludes its own output directory from the archive — the app was missing.
    expect(pkg.build.directories?.output).toBe('release')
  })

  it('ships only the built app, not sources, tests or local settings', () => {
    // Finding 6: without a files allowlist, src/, tests/, docs/ and the
    // unversioned .claude/settings.local.json ended up in the archive. Narrowed to
    // the three directories electron-vite actually writes (dist/main, dist/preload,
    // dist/renderer — see electron.vite.config.ts) rather than 'dist/**', which also
    // swept in a stray dist/test/tsconfig.test.tsbuildinfo and a stale
    // dist/builder-debug.yml left over from a build-machine run.
    // `resources/**` kam mit Paket D dazu: dort liegt die stdio-Bruecke zum MCP-Socket,
    // und ohne sie im Paket haette eine gestartete Sitzung die zehn Werkzeuge nicht.
    expect(pkg.build.files).toEqual([
      'dist/main/**',
      'dist/preload/**',
      'dist/renderer/**',
      'resources/**',
      'package.json',
    ])
  })

  it('packt die MCP-Bruecke aus dem asar-Archiv heraus', () => {
    // Paket D. Die Bruecke wird von einem FREMDEN Prozess gestartet — dem CLI-Harness —,
    // und der hat keine asar-Kenntnis: er bekommt einen Pfad und ruft `spawn`. Laege die
    // Datei nur im Archiv, faende er sie nicht, und der Fehler kaeme erst im gepackten
    // Programm zum Vorschein, nie in der Entwicklung. `brueckenPfad` (mcp-http-server.ts)
    // schreibt den Pfad auf `app.asar.unpacked` um und rechnet damit, dass hier etwas liegt.
    expect(pkg.build.asarUnpack).toEqual(['resources/**'])
  })

  it('hat die Bruecke wirklich auf der Platte, nicht nur in der Konfiguration', () => {
    // Eine Allowlist, die auf eine fehlende Datei zeigt, ist stumm: electron-builder packt
    // dann nichts und sagt nichts. Der Fehler faellt erst im gestarteten Programm auf.
    expect(existsSync(join(process.cwd(), 'resources', 'mcp-bridge.mjs'))).toBe(true)
  })

  it('covers the declared entry point with the files allowlist', () => {
    expect(pkg.main).toBe('dist/main/index.js')
  })

  it('targets Apple Silicon only', () => {
    // Finding 5: an x64 package contained arm64 binaries and would have shipped dead on arrival.
    expect(pkg.build.mac.target).toHaveLength(1)
    expect(pkg.build.mac.target[0].arch).toEqual(['arm64'])
  })

  it('never lets electron-builder search for a signing identity', () => {
    for (const script of ['pack', 'dist']) {
      expect(pkg.scripts[script]).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false')
    }
  })

  it('rebuilds the renderer before packaging', () => {
    for (const script of ['pack', 'dist']) {
      expect(pkg.scripts[script]).toContain('npm run build')
    }
  })

  it('exposes the packaged smoke test as a script', () => {
    expect(pkg.scripts['smoke:packaged']).toBe('node scripts/smoke-packaged.mjs')
  })

  it('ships an app icon rather than the Electron default', () => {
    expect(pkg.build.mac.icon).toBe('build/icon.icns')
    expect(existsSync(join(process.cwd(), 'build', 'icon.icns'))).toBe(true)
  })
})
