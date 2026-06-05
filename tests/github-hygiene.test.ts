/**
 * tests/github-hygiene.test.ts — static constraint tests for GitHub module + wizard.
 *
 * These tests grep source files for forbidden patterns.
 * No mocks, no imports from src — purely readFileSync / readdirSync.
 *
 * GH-006: No git clone anywhere in src/main/github/
 * GH-014: No console.log leaking tokens in src/main/github/
 * CK-UI-020: No AI SDK imports in wizard components
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

function readAllTsFiles(dir: string): string[] {
  const contents: string[] = []
  for (const f of readdirSync(dir, { recursive: true }) as string[]) {
    if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      contents.push(readFileSync(join(dir, f), 'utf-8'))
    }
  }
  return contents
}

// ---------------------------------------------------------------------------
// GH-006: No git clone in github module
// ---------------------------------------------------------------------------

describe('GH-006: No git clone in src/main/github/', () => {
  it('contains no git clone call', () => {
    const files = readAllTsFiles('src/main/github')
    for (const content of files) {
      expect(content).not.toMatch(/git[\s,[].*clone|'clone'|"clone"/)
    }
  })

  it('github module files exist (sanity check)', () => {
    const files = readAllTsFiles('src/main/github')
    expect(files.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// GH-014: No token leakage via console.log in github module
// ---------------------------------------------------------------------------

describe('GH-014: No token leakage via console.log in src/main/github/', () => {
  it('no console.log with token-related patterns', () => {
    const files = readAllTsFiles('src/main/github')
    for (const content of files) {
      expect(content).not.toMatch(/console\.log.*token/i)
    }
  })

  it('no console.log containing ghp_ token prefix', () => {
    const files = readAllTsFiles('src/main/github')
    for (const content of files) {
      expect(content).not.toMatch(/console\.log.*ghp_/)
    }
  })

  it('no console.log containing gho_ token prefix', () => {
    const files = readAllTsFiles('src/main/github')
    for (const content of files) {
      expect(content).not.toMatch(/console\.log.*gho_/)
    }
  })
})

// ---------------------------------------------------------------------------
// CK-UI-020: No AI SDK imports in wizard components or KickoffWizard container
// ---------------------------------------------------------------------------

describe('CK-UI-020: No AI SDK imports in wizard UI', () => {
  it('wizard step components have no AI SDK imports', () => {
    const files = readAllTsFiles('src/renderer/components/wizard')
    expect(files.length).toBeGreaterThanOrEqual(1)
    for (const content of files) {
      expect(content).not.toMatch(/from ['"]anthropic['"]/)
      expect(content).not.toMatch(/from ['"]@anthropic-ai/)
      expect(content).not.toMatch(/from ['"]openai['"]/)
      expect(content).not.toMatch(/from ['"]ollama['"]/)
    }
  })

  it('KickoffWizard container has no AI SDK imports', () => {
    const content = readFileSync(
      'src/renderer/components/KickoffWizard.tsx',
      'utf-8',
    )
    expect(content).not.toMatch(/from ['"]anthropic['"]/)
    expect(content).not.toMatch(/from ['"]@anthropic-ai/)
    expect(content).not.toMatch(/from ['"]openai['"]/)
    expect(content).not.toMatch(/from ['"]ollama['"]/)
  })

  it('wizard has exactly 5 step files', () => {
    const files = readdirSync('src/renderer/components/wizard') as string[]
    const tsxFiles = files.filter((f) => f.endsWith('.tsx'))
    expect(tsxFiles).toHaveLength(5)
  })
})
