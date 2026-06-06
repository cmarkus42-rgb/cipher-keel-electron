import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { generateVaultIndex } from '../../src/main/notes/vault-index'
import type Database from 'better-sqlite3'

describe('Vault Index (CK-NOTES-008)', () => {
  let db: Database.Database
  let writer: GraphWriter
  let tmpDir: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  })

  afterEach(() => {
    db?.open && db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('generates index.md with wiki links to uebergabedokumente', () => {
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Spec Auth', path: '/deliverables/spec-auth.md',
      frontmatter: { dokumentTyp: 'spec' },
    })
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Build Auth', path: '/deliverables/build-auth.md',
      frontmatter: { dokumentTyp: 'build-paket' },
    })

    generateVaultIndex(db, tmpDir)

    const indexPath = path.join(tmpDir, 'index.md')
    expect(fs.existsSync(indexPath)).toBe(true)
    const content = fs.readFileSync(indexPath, 'utf-8')
    expect(content).toContain('[[Spec Auth]]')
    expect(content).toContain('[[Build Auth]]')
  })

  it('marks abgeloeste documents with strikethrough', () => {
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Old Spec', path: '/deliverables/old.md',
      status: 'abgeloest',
      frontmatter: { dokumentTyp: 'spec' },
    })

    generateVaultIndex(db, tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8')
    expect(content).toContain('~~[[Old Spec]]~~')
  })

  it('creates graph node with notetyp vault-index', () => {
    generateVaultIndex(db, tmpDir)

    const nodes = db.prepare("SELECT * FROM node WHERE kind = 'note' AND json_extract(frontmatter, '$.notetyp') = 'vault-index'").all()
    expect(nodes).toHaveLength(1)
  })

  it('handles empty vault (no documents)', () => {
    generateVaultIndex(db, tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8')
    expect(content).toContain('# Vault Index')
    expect(content).not.toContain('[[')
  })
})
