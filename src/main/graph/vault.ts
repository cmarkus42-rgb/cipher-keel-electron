/**
 * vault.ts — Vault integration: parse, index, write-back, atomic write.
 *
 * CK-GRAPH-025: Vault as source — parse YAML frontmatter + wikilinks.
 * CK-GRAPH-026: Write inferred edges back to vault as frontmatter.
 * CK-GRAPH-029: Atomic vault writing (temp file + rename).
 * CK-GRAPH-030: Incremental re-index and full rebuild.
 * CK-GRAPH-034: Delete semantics — removed vault files vanish from index.
 */

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, renameSync, readdirSync, statSync, existsSync, unlinkSync } from 'fs'
import { join, relative, extname, basename } from 'path'
import type Database from 'better-sqlite3'
import { GraphWriter } from './writer'
import type { NodeKind } from './node-types'
import { isValidKind } from './node-types'
import { isValidEdgeType } from './edge-types'

// ---------------------------------------------------------------------------
// Frontmatter + Wikilink parser (CK-GRAPH-025)
// ---------------------------------------------------------------------------

export interface ParsedVaultFile {
  frontmatter: Record<string, unknown>
  body: string
  wikilinks: string[]
}

/**
 * Parse a Markdown file into frontmatter, body, and wikilinks.
 *
 * Frontmatter is YAML between --- delimiters at the top of the file.
 * Wikilinks are [[target]] or [[target|alias]] in the body.
 */
export function parseVaultFile(content: string): ParsedVaultFile {
  let frontmatter: Record<string, unknown> = {}
  let body = content

  // Parse YAML frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (fmMatch) {
    frontmatter = parseSimpleYaml(fmMatch[1])
    body = content.slice(fmMatch[0].length)
  }

  // Extract wikilinks from body
  const wikilinks: string[] = []
  const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = wikiRe.exec(body)) !== null) {
    wikilinks.push(match[1].trim())
  }

  return { frontmatter, body, wikilinks }
}

/**
 * Simple YAML parser for frontmatter — handles flat key-value pairs and arrays.
 * Not a full YAML parser, covers the vault frontmatter use case.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let currentKey = ''
  let currentArray: string[] | null = null

  for (const line of lines) {
    // Array item
    const arrayMatch = line.match(/^  - (.+)$/)
    if (arrayMatch && currentKey) {
      if (!currentArray) currentArray = []
      currentArray.push(arrayMatch[1].trim())
      continue
    }

    // Flush previous array
    if (currentArray && currentKey) {
      result[currentKey] = currentArray
      currentArray = null
    }

    // Key: value
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      currentKey = kvMatch[1]
      const value = kvMatch[2].trim()
      if (value === '' || value === '[]') {
        // May be followed by array items
        currentArray = value === '[]' ? [] : null
        if (value === '[]') result[currentKey] = []
      } else if (value === 'true') {
        result[currentKey] = true
      } else if (value === 'false') {
        result[currentKey] = false
      } else if (value === 'null') {
        result[currentKey] = null
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        result[currentKey] = Number(value)
      } else {
        // Strip quotes if present
        result[currentKey] = value.replace(/^["']|["']$/g, '')
      }
    }
  }

  // Flush trailing array
  if (currentArray && currentKey) {
    result[currentKey] = currentArray
  }

  return result
}

// ---------------------------------------------------------------------------
// Content hash
// ---------------------------------------------------------------------------

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------------------
// Atomic vault writing (CK-GRAPH-029)
// ---------------------------------------------------------------------------

export class VaultConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'VaultConflictError' }
}

/**
 * Write content to a vault file atomically via temp file + rename.
 *
 * CK-GRAPH-029: No in-place write. Optimistic version check via content_hash.
 * If expectedHash is provided and doesn't match current file, throws VaultConflictError.
 */
export function atomicVaultWrite(
  filePath: string,
  content: string,
  expectedHash?: string
): void {
  // Optimistic version check
  if (expectedHash && existsSync(filePath)) {
    const current = readFileSync(filePath, 'utf-8')
    const currentHash = contentHash(current)
    if (currentHash !== expectedHash) {
      throw new VaultConflictError(
        `Content hash mismatch for '${filePath}': ` +
        `expected '${expectedHash}', found '${currentHash}'. ` +
        `File was modified externally. No silent last-write-wins.`
      )
    }
  }

  // Write to temp file, then rename (atomic on POSIX)
  const tmpPath = filePath + '.tmp.' + Date.now()
  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, filePath)
}

// ---------------------------------------------------------------------------
// Frontmatter serialization
// ---------------------------------------------------------------------------

function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of value) {
          lines.push(`  - ${item}`)
        }
      }
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${value}`)
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }
  return lines.join('\n')
}

/**
 * Reconstruct a vault file from frontmatter + body.
 */
export function buildVaultContent(fm: Record<string, unknown>, body: string): string {
  const fmStr = serializeFrontmatter(fm)
  return `---\n${fmStr}\n---\n${body}`
}

// ---------------------------------------------------------------------------
// Inferred edge write-back (CK-GRAPH-026)
// ---------------------------------------------------------------------------

export interface InferredEdge {
  sourceFile: string  // vault path of the source file
  targetUid: string   // uid of the target node
  edgeType: string    // edge type
}

/**
 * Write inferred edges back to vault files as frontmatter entries.
 *
 * CK-GRAPH-026: Batch write — collected edges written in one pass.
 * Frontmatter additions are additive and mergeable.
 *
 * Adds an `inferred_edges` array to the frontmatter of each source file.
 */
export function writeInferredEdges(
  vaultRoot: string,
  edges: InferredEdge[],
  hashMap?: Map<string, string>
): { written: number; skipped: number } {
  // Group by source file
  const byFile = new Map<string, InferredEdge[]>()
  for (const edge of edges) {
    const group = byFile.get(edge.sourceFile) ?? []
    group.push(edge)
    byFile.set(edge.sourceFile, group)
  }

  let written = 0
  let skipped = 0

  for (const [relPath, fileEdges] of byFile) {
    const fullPath = join(vaultRoot, relPath)
    if (!existsSync(fullPath)) { skipped += fileEdges.length; continue }

    const content = readFileSync(fullPath, 'utf-8')
    const parsed = parseVaultFile(content)

    // Get existing inferred edges
    const existing = (parsed.frontmatter.inferred_edges as string[] | undefined) ?? []
    const existingSet = new Set(existing)

    // Add new edges (additive, mergeable)
    let added = 0
    for (const edge of fileEdges) {
      const entry = `${edge.edgeType}:${edge.targetUid}`
      if (!existingSet.has(entry)) {
        existing.push(entry)
        existingSet.add(entry)
        added++
      }
    }

    if (added === 0) { skipped += fileEdges.length; continue }

    parsed.frontmatter.inferred_edges = existing
    const newContent = buildVaultContent(parsed.frontmatter, parsed.body)
    const currentHash = hashMap?.get(relPath) ?? contentHash(content)

    try {
      atomicVaultWrite(fullPath, newContent, currentHash)
      written += added
    } catch {
      skipped += fileEdges.length
    }
  }

  return { written, skipped }
}

// ---------------------------------------------------------------------------
// Indexer: Vault → DB (CK-GRAPH-025, CK-GRAPH-030)
// ---------------------------------------------------------------------------

export interface IndexResult {
  nodesIndexed: number
  edgesCreated: number
  filesSkipped: number
  version: number
}

/**
 * Full re-index: scan entire vault and rebuild the index from scratch.
 *
 * CK-GRAPH-030: Full rebuild as repair/divergence path.
 * Deletes all existing data first, then re-indexes.
 */
export function fullReindex(
  db: Database.Database,
  vaultRoot: string
): IndexResult {
  // Wipe index
  db.prepare('DELETE FROM node_fts').run()
  db.prepare('DELETE FROM edge').run()
  db.prepare('DELETE FROM vec_chunks WHERE 1=1').run()
  db.prepare('DELETE FROM node').run()

  // Bump version
  ensureVersionTable(db)
  const version = bumpVersion(db)

  // Scan and index all .md files
  const mdFiles = scanVaultFiles(vaultRoot)
  return indexFiles(db, vaultRoot, mdFiles, version)
}

/**
 * Incremental re-index: index only the given file paths.
 *
 * CK-GRAPH-030: Watcher-triggered update — only changed nodes re-projected.
 * On divergence: file wins, index is re-projected.
 */
export function incrementalIndex(
  db: Database.Database,
  vaultRoot: string,
  changedPaths: string[]
): IndexResult {
  ensureVersionTable(db)
  const version = bumpVersion(db)
  return indexFiles(db, vaultRoot, changedPaths, version)
}

/**
 * Handle a vault file deletion.
 *
 * CK-GRAPH-034: Deleted vault file → node removed from index,
 * edges to it are removed, dead references remain in surviving files.
 */
export function handleVaultDeletion(
  db: Database.Database,
  deletedPath: string
): { removed: boolean; uid: string | null } {
  const node = db.prepare('SELECT uid FROM node WHERE path = ?').get(deletedPath) as { uid: string } | undefined
  if (!node) return { removed: false, uid: null }

  // Remove edges
  db.prepare('DELETE FROM edge WHERE src = ? OR dst = ?').run(node.uid, node.uid)
  // Remove FTS
  db.prepare('DELETE FROM node_fts WHERE uid = ?').run(node.uid)
  // Remove vec chunks
  db.prepare('DELETE FROM vec_chunks WHERE node_uid = ?').run(node.uid)
  // Remove node
  db.prepare('DELETE FROM node WHERE uid = ?').run(node.uid)

  return { removed: true, uid: node.uid }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scanVaultFiles(vaultRoot: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (extname(entry) === '.md') {
        results.push(relative(vaultRoot, fullPath))
      }
    }
  }
  walk(vaultRoot)
  return results
}

function indexFiles(
  db: Database.Database,
  vaultRoot: string,
  filePaths: string[],
  version: number
): IndexResult {
  const writer = new GraphWriter(db)
  let nodesIndexed = 0
  let edgesCreated = 0
  let filesSkipped = 0

  // First pass: index nodes
  const uidByPath = new Map<string, string>()
  for (const relPath of filePaths) {
    const fullPath = join(vaultRoot, relPath)
    if (!existsSync(fullPath)) { filesSkipped++; continue }

    const content = readFileSync(fullPath, 'utf-8')
    const parsed = parseVaultFile(content)

    // Determine kind from frontmatter or skip
    const kind = parsed.frontmatter.kind as string | undefined
    if (!kind || !isValidKind(kind)) { filesSkipped++; continue }

    const title = (parsed.frontmatter.title as string) ?? basename(relPath, '.md')
    const hash = contentHash(content)

    try {
      const result = writer.upsertNode({
        kind,
        title,
        path: relPath,
        status: (parsed.frontmatter.status as string) ?? 'aktiv',
        body: parsed.body,
        content_hash: hash,
        frontmatter: parsed.frontmatter,
        url: parsed.frontmatter.url as string,
        session: parsed.frontmatter.session as string,
        zeitpunkt: parsed.frontmatter.zeitpunkt as string
      })
      uidByPath.set(relPath, result.uid)
      nodesIndexed++
    } catch {
      filesSkipped++
    }
  }

  // Second pass: resolve wikilinks and frontmatter edges
  for (const relPath of filePaths) {
    const srcUid = uidByPath.get(relPath)
    if (!srcUid) continue

    const fullPath = join(vaultRoot, relPath)
    if (!existsSync(fullPath)) continue

    const content = readFileSync(fullPath, 'utf-8')
    const parsed = parseVaultFile(content)

    // Wikilinks → edges (source: wikilink)
    for (const link of parsed.wikilinks) {
      // Resolve wikilink to a uid
      const targetPath = resolveWikilink(link, filePaths)
      const targetUid = targetPath ? uidByPath.get(targetPath) : null
      if (!targetUid || targetUid === srcUid) continue

      try {
        writer.linkEdge({ src: srcUid, dst: targetUid, source: 'wikilink' })
        edgesCreated++
      } catch { /* skip invalid edges */ }
    }

    // Frontmatter edge references (refs field)
    const refs = parsed.frontmatter.refs as string[] | undefined
    if (refs) {
      for (const ref of refs) {
        const targetPath = resolveWikilink(ref, filePaths)
        const targetUid = targetPath ? uidByPath.get(targetPath) : null
        if (!targetUid || targetUid === srcUid) continue

        try {
          writer.linkEdge({ src: srcUid, dst: targetUid, source: 'frontmatter' })
          edgesCreated++
        } catch { /* skip invalid edges */ }
      }
    }

    // Inferred edges from frontmatter (written back by CK-GRAPH-026)
    const inferredEdges = parsed.frontmatter.inferred_edges as string[] | undefined
    if (inferredEdges) {
      for (const entry of inferredEdges) {
        const [edgeType, targetUid] = entry.split(':')
        if (!targetUid || !isValidEdgeType(edgeType)) continue

        // Check target exists
        const targetExists = db.prepare('SELECT uid FROM node WHERE uid = ?').get(targetUid)
        if (!targetExists) continue

        try {
          writer.linkEdge({ src: srcUid, dst: targetUid, type: edgeType, source: 'inferred' })
          edgesCreated++
        } catch { /* skip invalid edges */ }
      }
    }
  }

  return { nodesIndexed, edgesCreated, filesSkipped, version }
}

function resolveWikilink(link: string, knownPaths: string[]): string | null {
  // Try exact match
  if (knownPaths.includes(link)) return link

  // Try with .md extension
  const withMd = link.endsWith('.md') ? link : link + '.md'
  if (knownPaths.includes(withMd)) return withMd

  // Try basename match
  for (const path of knownPaths) {
    if (basename(path, '.md') === link || basename(path) === link) {
      return path
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Version counter (CK-GRAPH-030)
// ---------------------------------------------------------------------------

function ensureVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `)
}

function bumpVersion(db: Database.Database): number {
  const row = db.prepare("SELECT value FROM graph_meta WHERE key = 'index_version'").get() as { value: string } | undefined
  const current = row ? parseInt(row.value, 10) : 0
  const next = current + 1
  db.prepare(
    "INSERT INTO graph_meta (key, value) VALUES ('index_version', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
  ).run(String(next), String(next))
  return next
}

export function getIndexVersion(db: Database.Database): number {
  ensureVersionTable(db)
  const row = db.prepare("SELECT value FROM graph_meta WHERE key = 'index_version'").get() as { value: string } | undefined
  return row ? parseInt(row.value, 10) : 0
}
