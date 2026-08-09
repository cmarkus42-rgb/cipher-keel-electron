/**
 * Packaging-Konfiguration — Regressionswächter.
 * Phase 8 / Task 1. Jede Zusicherung hier hat einen gemessenen Befund als Anlass
 * (siehe docs/superpowers/plans/2026-08-09-phase-8-packaging.md, „Ausgangslage").
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
    mac: { target: MacTarget[]; category: string; icon?: string }
    dmg?: unknown
  }
}

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as PkgJson

describe('electron-builder configuration', () => {
  it('does not write its output into the electron-vite build directory', () => {
    // Befund 1: Default 'dist' kollidiert mit electron-vite. electron-builder
    // schliesst sein Ausgabeverzeichnis aus dem Archiv aus — die App fehlte.
    expect(pkg.build.directories?.output).toBe('release')
  })

  it('ships only the built app, not sources, tests or local settings', () => {
    // Befund 6: ohne files-Allowlist landeten src/, tests/, docs/ und die nicht
    // versionierte .claude/settings.local.json im Archiv.
    expect(pkg.build.files).toEqual(['dist/**', 'package.json'])
  })

  it('covers the declared entry point with the files allowlist', () => {
    expect(pkg.main).toBe('dist/main/index.js')
  })

  it('targets Apple Silicon only', () => {
    // Befund 5: ein x64-Paket enthielt arm64-Binaries und waere tot ausgeliefert.
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
})
