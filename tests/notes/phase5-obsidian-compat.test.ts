import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { validateObsidianCompat } from '../../src/main/notes/obsidian-compat'

describe('Obsidian Compatibility (CK-NOTES-013)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('valid vault with correct frontmatter and wiki-links passes', () => {
    fs.writeFileSync(path.join(tmpDir, 'note.md'), '---\ntitle: Test\n---\n\nSee [[other]]')
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('detects invalid YAML frontmatter', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.md'), '---\ntitle: [unclosed\n---\n')
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.type === 'invalid-frontmatter')).toBe(true)
  })

  it('reports file with no frontmatter as info (not error)', () => {
    fs.writeFileSync(path.join(tmpDir, 'plain.md'), '# Just text\nNo frontmatter here')
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(true) // missing frontmatter is OK for Obsidian
  })

  it('handles empty vault', () => {
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})
