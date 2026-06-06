/**
 * Obsidian Vault Compatibility — validate vault for Obsidian use.
 * CK-NOTES-013
 */

import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export interface ObsidianIssue {
  type: 'invalid-frontmatter' | 'invalid-dirname' | 'obsidian-conflict' | 'invalid-wikilink'
  file: string
  message: string
}

export interface ObsidianCompatResult {
  valid: boolean
  issues: ObsidianIssue[]
}

const INVALID_DIR_CHARS = /[<>:"|?*]/

export function validateObsidianCompat(vaultPath: string): ObsidianCompatResult {
  const issues: ObsidianIssue[] = []

  if (!fs.existsSync(vaultPath)) {
    return { valid: true, issues: [] }
  }

  const files = collectMarkdownFiles(vaultPath)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    // Check frontmatter validity only when frontmatter delimiter is present
    if (content.startsWith('---')) {
      try {
        matter(content)
      } catch {
        issues.push({
          type: 'invalid-frontmatter',
          file: path.relative(vaultPath, file),
          message: 'Invalid YAML frontmatter — Obsidian will show a parse error',
        })
      }
    }

    // Check wiki-link syntax
    const relFile = path.relative(vaultPath, file)
    const openCount = (content.match(/\[\[/g) ?? []).length
    const closeCount = (content.match(/\]\]/g) ?? []).length
    if (openCount !== closeCount) {
      issues.push({
        type: 'invalid-wikilink',
        file: relFile,
        message: 'Unmatched [[ or ]] — Obsidian will fail to resolve the link',
      })
    } else if (/\[\[\s*\]\]/.test(content)) {
      issues.push({
        type: 'invalid-wikilink',
        file: relFile,
        message: 'Empty wiki-link [[]] — link has no target',
      })
    }

    // Check directory names for invalid characters
    const relDir = path.relative(vaultPath, path.dirname(file))
    if (relDir && INVALID_DIR_CHARS.test(relDir)) {
      issues.push({
        type: 'invalid-dirname',
        file: relDir,
        message: 'Directory contains characters unsupported by Obsidian',
      })
    }
  }

  return { valid: issues.length === 0, issues }
}

function collectMarkdownFiles(dir: string): string[] {
  const result: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectMarkdownFiles(full))
    } else if (entry.name.endsWith('.md')) {
      result.push(full)
    }
  }
  return result
}
