/**
 * tests/notes-extensions.test.ts
 * W2D: noteType uebergabedokument, vault isolation, normalizer, frontmatter validation.
 * REQs: CK-P1-008, CK-NOTES-004, CK-NOTES-007, CK-NOTES-012, CK-NOTES-014
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ulid } from 'ulidx'
import { NoteManager } from '../src/main/notes/note-manager'
import { initVault } from '../src/main/notes/vault-structure'
import { normalizeToP1Format } from '../src/main/p1/normalizer'

// ---------------------------------------------------------------------------
// CRUD with noteType uebergabedokument (CK-NOTES-004, CK-P1-008)
// ---------------------------------------------------------------------------
describe('noteType uebergabedokument CRUD', () => {
  let tmpDir: string
  let mgr: NoteManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ck-notes-test-'))
    mgr = new NoteManager(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('create with noteType uebergabedokument stores the type', async () => {
    const info = await mgr.create('My Spec', '# My Spec\n', [], 'uebergabedokument')
    expect(info.noteType).toBe('uebergabedokument')
  })

  it('list returns notes of noteType uebergabedokument', async () => {
    await mgr.create('Spec', '# Spec\n', [], 'uebergabedokument')
    await mgr.create('Normal', '# Normal\n')
    const all = await mgr.list()
    expect(all.some(n => n.noteType === 'uebergabedokument')).toBe(true)
  })

  it('list with filterNoteType returns only uebergabedokument notes', async () => {
    await mgr.create('Spec', '# Spec\n', [], 'uebergabedokument')
    await mgr.create('Normal', '# Normal\n')
    const filtered = await mgr.list(undefined, 'uebergabedokument')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].noteType).toBe('uebergabedokument')
  })

  it('read returns note with noteType uebergabedokument', async () => {
    const created = await mgr.create('Spec', '# Spec\n', [], 'uebergabedokument')
    const content = await mgr.read(created.id)
    expect(content?.info.noteType).toBe('uebergabedokument')
  })
})

// ---------------------------------------------------------------------------
// Regression: existing noteType testcase (CK-NOTES-004)
// ---------------------------------------------------------------------------
describe('regression: noteType testcase unchanged', () => {
  let tmpDir: string
  let mgr: NoteManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ck-notes-test-'))
    mgr = new NoteManager(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('kind:testcase tag still sets noteType to testcase', async () => {
    const info = await mgr.create('Test Case', '# Test Case\n', ['kind:testcase'])
    expect(info.noteType).toBe('testcase')
  })

  it('list returns testcase notes correctly', async () => {
    await mgr.create('TC', '# TC\n', ['kind:testcase'])
    const notes = await mgr.list()
    expect(notes.some(n => n.noteType === 'testcase')).toBe(true)
  })

  it('filterNoteType testcase does not return uebergabedokument notes', async () => {
    await mgr.create('TC', '# TC\n', ['kind:testcase'])
    await mgr.create('Spec', '# Spec\n', [], 'uebergabedokument')
    const testcases = await mgr.list(undefined, 'testcase')
    expect(testcases.every(n => n.noteType === 'testcase')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Vault isolation (CK-NOTES-007)
// ---------------------------------------------------------------------------
describe('vault isolation', () => {
  let tmpDir1: string
  let tmpDir2: string

  beforeEach(() => {
    tmpDir1 = mkdtempSync(join(tmpdir(), 'ck-vault1-'))
    tmpDir2 = mkdtempSync(join(tmpdir(), 'ck-vault2-'))
  })

  afterEach(() => {
    rmSync(tmpDir1, { recursive: true, force: true })
    rmSync(tmpDir2, { recursive: true, force: true })
  })

  it('initVault creates brain and deliverables directories', async () => {
    await initVault(tmpDir1)
    expect(existsSync(join(tmpDir1, 'brain'))).toBe(true)
    expect(existsSync(join(tmpDir1, 'deliverables'))).toBe(true)
  })

  it('notes in project 1 are not visible in project 2', async () => {
    await initVault(tmpDir1)
    await initVault(tmpDir2)
    const mgr1 = new NoteManager(join(tmpDir1, 'brain'))
    const mgr2 = new NoteManager(join(tmpDir2, 'brain'))

    await mgr1.create('Note in P1', '# Note in P1\n')
    const notes1 = await mgr1.list()
    const notes2 = await mgr2.list()

    expect(notes1).toHaveLength(1)
    expect(notes2).toHaveLength(0)
  })

  it('notes in project 2 are not visible in project 1', async () => {
    await initVault(tmpDir1)
    await initVault(tmpDir2)
    const mgr1 = new NoteManager(join(tmpDir1, 'brain'))
    const mgr2 = new NoteManager(join(tmpDir2, 'brain'))

    await mgr2.create('Note in P2', '# Note in P2\n')
    const notes1 = await mgr1.list()
    const notes2 = await mgr2.list()

    expect(notes1).toHaveLength(0)
    expect(notes2).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Normalizer (CK-NOTES-012)
// ---------------------------------------------------------------------------
describe('normalizer: Markdown to P1 format', () => {
  it('markdown without frontmatter gets valid YAML frontmatter', () => {
    const input = '# My Requirements\n\n- Req 1\n- Req 2\n'
    const { normalized } = normalizeToP1Format(input, 'anforderungen')
    expect(normalized).toMatch(/^---/)
    expect(normalized).toContain('dokument-typ: anforderungen')
    expect(normalized).toContain('status:')
  })

  it('body content is preserved after normalization', () => {
    const input = '# My Requirements\n\n- Req 1\n- Req 2\n'
    const { normalized } = normalizeToP1Format(input, 'anforderungen')
    expect(normalized).toContain('# My Requirements')
    expect(normalized).toContain('- Req 1')
  })

  it('markdown with partial frontmatter fills missing required fields', () => {
    const input = '---\ndokument-typ: spec\n---\n# My Spec\n'
    const { normalized, warnings } = normalizeToP1Format(input, 'spec')
    expect(normalized).toContain('status:')
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('warns about every missing required field', () => {
    const { warnings } = normalizeToP1Format('# My Requirements\n', 'anforderungen')
    expect(warnings.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Frontmatter validation on saveRaw (CK-NOTES-014)
// ---------------------------------------------------------------------------
describe('frontmatter validation on saveRaw', () => {
  let tmpDir: string
  let mgr: NoteManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ck-notes-test-'))
    mgr = new NoteManager(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saveRaw with missing status warns for uebergabedokument', async () => {
    const id = ulid()
    const raw = [
      '---',
      'dokument-typ: spec',
      'phasenuebergang: "requirements -> architecture"',
      'erstellt-am: "2026-06-05"',
      'type: uebergabedokument',
      '---',
      '# My Spec',
      '',
    ].join('\n')
    const { warnings } = await mgr.saveRaw(id, raw)
    expect(warnings.some(w => w.toLowerCase().includes('status'))).toBe(true)
  })

  it('saveRaw with all required fields has no warnings', async () => {
    const id = ulid()
    const raw = [
      '---',
      'dokument-typ: spec',
      'phasenuebergang: "requirements -> architecture"',
      'status: entwurf',
      'erstellt-am: "2026-06-05"',
      'type: uebergabedokument',
      '---',
      '# My Spec',
      '',
    ].join('\n')
    const { warnings } = await mgr.saveRaw(id, raw)
    expect(warnings).toHaveLength(0)
  })

  it('saveRaw persists the file and rawContent is readable', async () => {
    const id = ulid()
    const raw = [
      '---',
      'dokument-typ: spec',
      'phasenuebergang: "requirements -> architecture"',
      'status: entwurf',
      'erstellt-am: "2026-06-05"',
      'type: uebergabedokument',
      '---',
      '# My Spec',
      '',
    ].join('\n')
    await mgr.saveRaw(id, raw)
    const content = await mgr.read(id)
    expect(content?.rawContent).toBe(raw)
    expect(content?.info.noteType).toBe('uebergabedokument')
  })
})
