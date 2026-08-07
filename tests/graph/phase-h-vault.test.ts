/**
 * Phase H tests — Vault integration.
 * CK-GRAPH-025, 026, 029, 030, 034
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, unlinkSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import {
  parseVaultFile,
  contentHash,
  atomicVaultWrite,
  buildVaultContent,
  writeInferredEdges,
  fullReindex,
  incrementalIndex,
  handleVaultDeletion,
  getIndexVersion,
  VaultConflictError
} from '../../src/main/graph/vault'

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function createTempVault(): string {
  return mkdtempSync(join(tmpdir(), 'ck-vault-test-'))
}

function writeVaultFile(vaultRoot: string, relPath: string, content: string): string {
  const fullPath = join(vaultRoot, relPath)
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  return fullPath
}

// -------------------------------------------------------------------
// parseVaultFile (CK-GRAPH-025)
// -------------------------------------------------------------------

describe('parseVaultFile (CK-GRAPH-025)', () => {
  it('parses frontmatter key-value pairs', () => {
    const content = `---
kind: anforderung
title: REQ-001
status: aktiv
prioritaet: muss
---
Body text here.`

    const parsed = parseVaultFile(content)
    expect(parsed.frontmatter.kind).toBe('anforderung')
    expect(parsed.frontmatter.title).toBe('REQ-001')
    expect(parsed.frontmatter.status).toBe('aktiv')
    expect(parsed.frontmatter.prioritaet).toBe('muss')
    expect(parsed.body).toContain('Body text here')
  })

  it('parses frontmatter arrays', () => {
    const content = `---
kind: entscheidung
title: DEC-001
alternativen:
  - Neo4j
  - Kuzu
  - ArcadeDB
---
Body.`

    const parsed = parseVaultFile(content)
    expect(parsed.frontmatter.alternativen).toEqual(['Neo4j', 'Kuzu', 'ArcadeDB'])
  })

  it('parses boolean and number values', () => {
    const content = `---
kind: note
title: Test
active: true
count: 42
---
Body.`

    const parsed = parseVaultFile(content)
    expect(parsed.frontmatter.active).toBe(true)
    expect(parsed.frontmatter.count).toBe(42)
  })

  it('extracts wikilinks', () => {
    const content = `---
kind: note
title: Note with links
---
See [[REQ-001]] and [[DEC-001|Decision One]] for details.
Also [[artefakt/schema.ts]].`

    const parsed = parseVaultFile(content)
    expect(parsed.wikilinks).toEqual(['REQ-001', 'DEC-001', 'artefakt/schema.ts'])
  })

  it('handles file without frontmatter (skip)', () => {
    const content = 'Just plain markdown without frontmatter.'
    const parsed = parseVaultFile(content)
    expect(parsed.frontmatter).toEqual({})
    expect(parsed.body).toBe(content)
    expect(parsed.wikilinks).toEqual([])
  })

  it('handles empty file', () => {
    const parsed = parseVaultFile('')
    expect(parsed.frontmatter).toEqual({})
    expect(parsed.body).toBe('')
  })
})

// -------------------------------------------------------------------
// contentHash
// -------------------------------------------------------------------

describe('contentHash', () => {
  it('produces consistent hash', () => {
    const h1 = contentHash('hello world')
    const h2 = contentHash('hello world')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(16)
  })

  it('different content produces different hash', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'))
  })
})

// -------------------------------------------------------------------
// atomicVaultWrite (CK-GRAPH-029)
// -------------------------------------------------------------------

describe('atomicVaultWrite (CK-GRAPH-029)', () => {
  let vaultRoot: string

  beforeEach(() => { vaultRoot = createTempVault() })
  afterEach(() => { rmSync(vaultRoot, { recursive: true, force: true }) })

  it('writes file atomically (no partial state)', () => {
    const filePath = join(vaultRoot, 'test.md')
    atomicVaultWrite(filePath, 'content here')
    expect(readFileSync(filePath, 'utf-8')).toBe('content here')
  })

  it('succeeds when expectedHash matches', () => {
    const filePath = join(vaultRoot, 'versioned.md')
    writeFileSync(filePath, 'original', 'utf-8')
    const hash = contentHash('original')

    atomicVaultWrite(filePath, 'updated', hash)
    expect(readFileSync(filePath, 'utf-8')).toBe('updated')
  })

  it('throws VaultConflictError on hash mismatch', () => {
    const filePath = join(vaultRoot, 'conflict.md')
    writeFileSync(filePath, 'version A', 'utf-8')

    expect(() => atomicVaultWrite(filePath, 'version C', 'wrong_hash_00000'))
      .toThrow(VaultConflictError)
  })

  it('no temp files left behind', () => {
    const filePath = join(vaultRoot, 'clean.md')
    atomicVaultWrite(filePath, 'clean write')

    const files = readdirSync(vaultRoot) as string[]
    const tmpFiles = files.filter((f: string) => f.includes('.tmp.'))
    expect(tmpFiles).toHaveLength(0)
  })
})

// -------------------------------------------------------------------
// buildVaultContent
// -------------------------------------------------------------------

describe('buildVaultContent', () => {
  it('produces valid frontmatter + body', () => {
    const content = buildVaultContent(
      { kind: 'note', title: 'Test', status: 'aktiv' },
      'Body text.'
    )
    const parsed = parseVaultFile(content)
    expect(parsed.frontmatter.kind).toBe('note')
    expect(parsed.frontmatter.title).toBe('Test')
    expect(parsed.body).toContain('Body text.')
  })

  it('round-trips arrays', () => {
    const fm = { kind: 'entscheidung', alternativen: ['A', 'B', 'C'] }
    const content = buildVaultContent(fm, 'Body.')
    const parsed = parseVaultFile(content)
    expect(parsed.frontmatter.alternativen).toEqual(['A', 'B', 'C'])
  })
})

// -------------------------------------------------------------------
// writeInferredEdges (CK-GRAPH-026)
// -------------------------------------------------------------------

describe('writeInferredEdges (CK-GRAPH-026)', () => {
  let vaultRoot: string

  beforeEach(() => { vaultRoot = createTempVault() })
  afterEach(() => { rmSync(vaultRoot, { recursive: true, force: true }) })

  it('writes inferred edges to frontmatter in batch', () => {
    const content = buildVaultContent(
      { kind: 'artefakt', title: 'Art1' },
      'Some body.'
    )
    writeVaultFile(vaultRoot, 'art1.md', content)

    const result = writeInferredEdges(vaultRoot, [
      { sourceFile: 'art1.md', targetUid: 'UID001', edgeType: 'setzt_um' },
      { sourceFile: 'art1.md', targetUid: 'UID002', edgeType: 'verifiziert' }
    ])

    expect(result.written).toBe(2)
    expect(result.skipped).toBe(0)

    // Verify file was updated
    const updated = readFileSync(join(vaultRoot, 'art1.md'), 'utf-8')
    const parsed = parseVaultFile(updated)
    expect(parsed.frontmatter.inferred_edges).toEqual([
      'setzt_um:UID001',
      'verifiziert:UID002'
    ])
  })

  it('is additive — does not duplicate existing edges', () => {
    const content = buildVaultContent(
      { kind: 'artefakt', title: 'Art1', inferred_edges: ['setzt_um:UID001'] },
      'Body.'
    )
    writeVaultFile(vaultRoot, 'art1.md', content)

    const result = writeInferredEdges(vaultRoot, [
      { sourceFile: 'art1.md', targetUid: 'UID001', edgeType: 'setzt_um' },
      { sourceFile: 'art1.md', targetUid: 'UID003', edgeType: 'verweist_auf' }
    ])

    expect(result.written).toBe(1) // Only UID003 is new
    const updated = readFileSync(join(vaultRoot, 'art1.md'), 'utf-8')
    const parsed = parseVaultFile(updated)
    const edges = parsed.frontmatter.inferred_edges as string[]
    expect(edges).toContain('setzt_um:UID001')
    expect(edges).toContain('verweist_auf:UID003')
    expect(edges).toHaveLength(2)
  })

  it('skips non-existent files', () => {
    const result = writeInferredEdges(vaultRoot, [
      { sourceFile: 'nonexistent.md', targetUid: 'UID001', edgeType: 'setzt_um' }
    ])
    expect(result.written).toBe(0)
    expect(result.skipped).toBe(1)
  })
})

// -------------------------------------------------------------------
// fullReindex + incrementalIndex (CK-GRAPH-030)
// -------------------------------------------------------------------

describe('Vault indexing (CK-GRAPH-030)', () => {
  let db: Database.Database
  let vaultRoot: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    vaultRoot = createTempVault()
  })
  afterEach(() => {
    db.close()
    rmSync(vaultRoot, { recursive: true, force: true })
  })

  function setupTestVault() {
    writeVaultFile(vaultRoot, 'reqs/R001.md', buildVaultContent(
      { kind: 'anforderung', title: 'REQ-001', status: 'aktiv', quelle: 'M1' },
      'Der Graph muss 8 Knotentypen haben.'
    ))
    writeVaultFile(vaultRoot, 'entsch/E001.md', buildVaultContent(
      { kind: 'entscheidung', title: 'SQLite-Entscheidung', status: 'aktiv',
        refs: ['R001'] },
      'Entschieden: SQLite. Siehe [[R001]] fuer Details.'
    ))
    writeVaultFile(vaultRoot, 'art/schema.ts.md', buildVaultContent(
      { kind: 'artefakt', title: 'schema.ts', status: 'aktiv', sprache_art: 'TypeScript' },
      'CREATE TABLE node (...). Siehe [[E001]].'
    ))
  }

  it('full reindex creates nodes from vault files', () => {
    setupTestVault()
    const result = fullReindex(db, vaultRoot)
    expect(result.nodesIndexed).toBe(3)
    expect(result.version).toBe(1)
  })

  it('full reindex creates edges from wikilinks', () => {
    setupTestVault()
    const result = fullReindex(db, vaultRoot)
    expect(result.edgesCreated).toBeGreaterThan(0)
  })

  it('full reindex creates edges from frontmatter refs', () => {
    // E001 references R001 only via refs frontmatter (no wikilink in body)
    writeVaultFile(vaultRoot, 'reqs/R001.md', buildVaultContent(
      { kind: 'anforderung', title: 'REQ-001', status: 'aktiv' },
      'Some requirement.'
    ))
    writeVaultFile(vaultRoot, 'entsch/E001.md', buildVaultContent(
      { kind: 'entscheidung', title: 'DEC-001', status: 'aktiv',
        refs: ['R001'] },
      'Decision body without wikilinks.'
    ))
    fullReindex(db, vaultRoot)
    const edges = db.prepare(
      "SELECT * FROM edge WHERE source = 'frontmatter'"
    ).all()
    expect(edges.length).toBeGreaterThan(0)
  })

  it('files without valid kind are skipped', () => {
    writeVaultFile(vaultRoot, 'plain.md', 'No frontmatter, just text.')
    writeVaultFile(vaultRoot, 'bad.md', buildVaultContent(
      { kind: 'invalid_type', title: 'Bad' }, 'Body.'
    ))
    const result = fullReindex(db, vaultRoot)
    expect(result.nodesIndexed).toBe(0)
    expect(result.filesSkipped).toBe(2)
  })

  it('version counter increases monotonically', () => {
    setupTestVault()
    const r1 = fullReindex(db, vaultRoot)
    expect(r1.version).toBe(1)
    const r2 = fullReindex(db, vaultRoot)
    expect(r2.version).toBe(2)
    expect(getIndexVersion(db)).toBe(2)
  })

  it('incremental index updates only specified files', () => {
    setupTestVault()
    fullReindex(db, vaultRoot)

    // Add a new file
    writeVaultFile(vaultRoot, 'notes/N001.md', buildVaultContent(
      { kind: 'note', title: 'New Note', status: 'aktiv' },
      'Fresh note content.'
    ))

    const result = incrementalIndex(db, vaultRoot, ['notes/N001.md'])
    expect(result.nodesIndexed).toBe(1)

    // Total should now be 4
    const count = db.prepare('SELECT COUNT(*) as c FROM node').get() as any
    expect(count.c).toBe(4)
  })

  it('FTS is populated during indexing', () => {
    setupTestVault()
    fullReindex(db, vaultRoot)

    const fts = db.prepare("SELECT uid FROM node_fts WHERE node_fts MATCH 'Knotentypen'").all()
    expect(fts.length).toBeGreaterThan(0)
  })

  // --- Round-trip test (from assignment) ---

  it('vault round-trip: index → delete DB → re-index → same state', () => {
    setupTestVault()
    const r1 = fullReindex(db, vaultRoot)
    const nodesBefore = db.prepare('SELECT uid, title FROM node ORDER BY uid').all()
    const edgesBefore = db.prepare('SELECT src, dst, type FROM edge ORDER BY src, dst').all()

    // Wipe DB
    db.prepare('DELETE FROM node_fts').run()
    db.prepare('DELETE FROM edge').run()
    db.prepare('DELETE FROM vec_chunks WHERE 1=1').run()
    db.prepare('DELETE FROM node').run()

    // Re-index
    const r2 = fullReindex(db, vaultRoot)
    const nodesAfter = db.prepare('SELECT uid, title FROM node ORDER BY uid').all()
    const edgesAfter = db.prepare('SELECT src, dst, type FROM edge ORDER BY src, dst').all()

    expect(nodesAfter).toEqual(nodesBefore)
    expect(edgesAfter).toEqual(edgesBefore)
    expect(r2.nodesIndexed).toBe(r1.nodesIndexed)
  })
})

// -------------------------------------------------------------------
// handleVaultDeletion (CK-GRAPH-034)
// -------------------------------------------------------------------

describe('handleVaultDeletion (CK-GRAPH-034)', () => {
  let db: Database.Database
  let vaultRoot: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    vaultRoot = createTempVault()
  })
  afterEach(() => {
    db.close()
    rmSync(vaultRoot, { recursive: true, force: true })
  })

  it('removes node and edges when vault file is deleted', () => {
    writeVaultFile(vaultRoot, 'reqs/R001.md', buildVaultContent(
      { kind: 'anforderung', title: 'REQ-001' },
      'Body.'
    ))
    writeVaultFile(vaultRoot, 'art/A001.md', buildVaultContent(
      { kind: 'artefakt', title: 'ART-001' },
      'Body. [[R001]]'
    ))

    fullReindex(db, vaultRoot)

    // Delete the req file from vault
    unlinkSync(join(vaultRoot, 'reqs/R001.md'))

    // Handle deletion in index
    const result = handleVaultDeletion(db, 'reqs/R001.md')
    expect(result.removed).toBe(true)
    expect(result.uid).toBeTruthy()

    // Node should be gone
    const node = db.prepare("SELECT * FROM node WHERE path = 'reqs/R001.md'").get()
    expect(node).toBeUndefined()

    // Edges to/from deleted node should be gone
    const edges = db.prepare('SELECT * FROM edge WHERE src = ? OR dst = ?')
      .all(result.uid!, result.uid!)
    expect(edges).toHaveLength(0)
  })

  it('returns removed=false for non-existent path', () => {
    const result = handleVaultDeletion(db, 'nonexistent.md')
    expect(result.removed).toBe(false)
    expect(result.uid).toBeNull()
  })

  it('dead references in surviving files stay as hygiene findings', () => {
    writeVaultFile(vaultRoot, 'reqs/R001.md', buildVaultContent(
      { kind: 'anforderung', title: 'REQ-001' },
      'Body.'
    ))
    writeVaultFile(vaultRoot, 'art/A001.md', buildVaultContent(
      { kind: 'artefakt', title: 'ART-001' },
      'Implements [[R001]].'
    ))

    fullReindex(db, vaultRoot)

    // Delete R001 from index
    handleVaultDeletion(db, 'reqs/R001.md')

    // The surviving art file still has [[R001]] in its body — this is a dead reference
    // but the FILE content is not touched (dead reference stays as hygiene finding)
    const artContent = readFileSync(join(vaultRoot, 'art/A001.md'), 'utf-8')
    expect(artContent).toContain('[[R001]]')
  })
})
