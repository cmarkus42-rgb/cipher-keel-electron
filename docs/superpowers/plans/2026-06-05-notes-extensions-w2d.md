# Notes Extensions (W2D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Notes system with `noteType: uebergabedokument`, per-project vault isolation, raw-content editor support for Übergabedokumente, P1 normalizer, and frontmatter validation on save.

**Architecture:** NoteManager extended with uebergabedokument noteType, `saveRaw()` for raw-content editing, and validation logic. `vault-structure.ts` provides `initVault()` helpers. `src/main/p1/normalizer.ts` normalises external markdown into P1 format. NoteInfo type extended with `dokumentTyp`/`phasenuebergang`/`uebergabeStatus` fields. NotesCell sidebar groups uebergabedokument notes separately with type-label, status-badge, and phasenuebergang. New IPC channel `notes:save-raw` wires `saveRaw()` end-to-end.

**Tech Stack:** TypeScript, Node.js fs, gray-matter, vitest, CodeMirror 6, @codemirror/lang-yaml

**REQs covered:** CK-P1-008, CK-NOTES-004, CK-NOTES-005, CK-NOTES-007, CK-NOTES-010, CK-NOTES-012, CK-NOTES-014

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/main/notes/vault-structure.ts` | `initVault()`, vault path helpers |
| Create | `src/main/p1/normalizer.ts` | `normalizeToP1Format()` |
| Create | `tests/notes-extensions.test.ts` | All 16 automated tests |
| Modify | `src/shared/types.ts` | NoteInfo + NoteContent extensions |
| Modify | `src/shared/ipc-channels.ts` | Add `notes:save-raw`, `notes:validation-warning` |
| Modify | `src/main/notes/note-manager.ts` | noteType, `saveRaw()`, `list()` filter, validation |
| Modify | `src/main/ipc-handlers.ts` | NOTES_SAVE_RAW handler |
| Modify | `src/preload.ts` | `notes.saveRaw` + `notes.onValidationWarning` |
| Modify | `src/renderer/hooks/useNotes.ts` | `saveNoteRaw` |
| Modify | `src/renderer/components/NotesCell.tsx` | Sidebar categories, raw editor, warning display |

---

## Task 1: Write all failing tests

**Files:**
- Create: `tests/notes-extensions.test.ts`

- [ ] **Step 1: Create test file**

```typescript
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
    const input = `---\ndokument-typ: spec\n---\n# My Spec\n`
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
```

- [ ] **Step 2: Run tests to confirm all fail**

```bash
cd <repo-root>
npm test -- tests/notes-extensions.test.ts 2>&1 | head -30
```

Expected: failures referencing missing imports `vault-structure`, `normalizer`, and missing methods `saveRaw`, `list(undefined, ...)`.

- [ ] **Step 3: Commit test file**

```bash
git add tests/notes-extensions.test.ts
git commit -m "test(notes): add failing tests for W2D notes extensions"
```

---

## Task 2: vault-structure.ts

**Files:**
- Create: `src/main/notes/vault-structure.ts`

- [ ] **Step 1: Create vault-structure.ts**

```typescript
/**
 * vault-structure.ts — per-project Vault directory helpers.
 *
 * CK-NOTES-007: Ein Vault pro Projekt mit brain/ und deliverables/ Verzeichnissen.
 */

import { promises as fs } from 'fs'
import path from 'path'

/**
 * Initialises the Vault directory structure for a project.
 * Creates brain/ (for notes) and deliverables/ (for Übergabedokumente) if they
 * do not already exist.
 */
export async function initVault(projectRoot: string): Promise<void> {
  await fs.mkdir(path.join(projectRoot, 'brain'), { recursive: true })
  await fs.mkdir(path.join(projectRoot, 'deliverables'), { recursive: true })
}

/** Returns the path to the brain/ notes directory for a project. */
export function getVaultBrainDir(projectRoot: string): string {
  return path.join(projectRoot, 'brain')
}

/** Returns the path to the deliverables/ directory for a project. */
export function getVaultDeliverablesDir(projectRoot: string): string {
  return path.join(projectRoot, 'deliverables')
}
```

- [ ] **Step 2: Run vault isolation tests only**

```bash
npm test -- tests/notes-extensions.test.ts -t "vault isolation" 2>&1
```

Expected: 3 vault isolation tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/notes/vault-structure.ts
git commit -m "feat(notes): vault-structure initVault + helpers (CK-NOTES-007)"
```

---

## Task 3: Shared types — NoteInfo + NoteContent extensions

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add fields to NoteInfo and rawContent to NoteContent**

In `src/shared/types.ts`, replace the NoteInfo and NoteContent interfaces (lines 88–106):

```typescript
export interface NoteInfo {
  id: string
  title: string
  tags: string[]
  scope: string
  relativePath: string
  preview?: string
  noteType?: string
  createdAt: string
  modifiedAt: string
  fromSession?: string
  toEntity?: string
  handoffStatus?: HandoffStatus
  /** Frontmatter: dokument-typ (Übergabedokumente only) */
  dokumentTyp?: string
  /** Frontmatter: phasenuebergang, e.g. "requirements -> architecture" */
  phasenuebergang?: string
  /** Frontmatter: status (Übergabedokumente only) */
  uebergabeStatus?: 'entwurf' | 'freigegeben' | 'abgeloest'
}

export interface NoteContent {
  info: NoteInfo
  body: string
  /** Full file content including YAML frontmatter — always populated. */
  rawContent: string
}
```

- [ ] **Step 2: Run typecheck to ensure no regressions**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: No errors (NoteContent now has `rawContent` — existing code that destructures `{ info, body }` still works).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): extend NoteInfo with dokumentTyp/phasenuebergang/uebergabeStatus; NoteContent.rawContent (W2D)"
```

---

## Task 4: NoteManager — noteType uebergabedokument + list filter + parseFile

**Files:**
- Modify: `src/main/notes/note-manager.ts`

- [ ] **Step 1: Update parseFile() to extract new frontmatter fields and rawContent**

Replace the `private async parseFile(...)` method body. The key changes:
- Add `'dokument-typ'`, `'phasenuebergang'`, `'status'` to the `fm` type
- Map them to `dokumentTyp`, `phasenuebergang`, `uebergabeStatus` in NoteInfo
- Return `rawContent: raw` in the result

Full replacement of `parseFile()`:

```typescript
private async parseFile(filePath: string): Promise<NoteContent | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    return null
  }
  const fm = parsed.data as {
    title?: string
    tags?: string[]
    type?: string
    created?: string
    modified?: string
    from_session?: string
    to_entity?: string
    handoff_status?: HandoffStatus
    'dokument-typ'?: string
    'phasenuebergang'?: string
    'status'?: 'entwurf' | 'freigegeben' | 'abgeloest'
  }

  const id = path.basename(filePath, '.md')
  const body = parsed.content.trimStart()
  const preview = this.extractPreview(body)
  const info: NoteInfo = {
    id,
    title: fm.title ?? 'Untitled',
    tags: fm.tags ?? [],
    scope: 'global',
    relativePath: `${id}.md`,
    ...(preview ? { preview } : {}),
    ...(fm.type ? { noteType: fm.type } : {}),
    createdAt: fm.created ?? new Date().toISOString(),
    modifiedAt: fm.modified ?? new Date().toISOString(),
    ...(fm.from_session ? { fromSession: fm.from_session } : {}),
    ...(fm.to_entity ? { toEntity: fm.to_entity } : {}),
    ...(fm.handoff_status ? { handoffStatus: fm.handoff_status } : {}),
    ...(fm['dokument-typ'] ? { dokumentTyp: fm['dokument-typ'] } : {}),
    ...(fm['phasenuebergang'] ? { phasenuebergang: fm['phasenuebergang'] } : {}),
    ...(fm['status'] ? { uebergabeStatus: fm['status'] } : {}),
  }

  return { info, body, rawContent: raw }
}
```

- [ ] **Step 2: Update create() to accept noteType param**

Replace the `async create(...)` signature and body. The key change: add `noteType?: string` as 4th param; include it in the fm and return value:

```typescript
async create(title: string, body: string, tags?: string[], noteType?: string): Promise<NoteInfo> {
  const id = ulid()
  const now = new Date().toISOString()
  await fs.mkdir(this.notesDir, { recursive: true })

  const finalTitle = title || this.extractTitle(body)
  const tagList = tags ?? []

  // Resolve type: explicit noteType > tag-based
  const typeFromTag = tagList.includes('kind:testcase') ? 'testcase'
    : tagList.includes('kind:uebergabedokument') ? 'uebergabedokument'
    : noteType

  const fm: Record<string, unknown> = {
    title: finalTitle,
    ...(typeFromTag ? { type: typeFromTag } : {}),
    tags: tagList,
    created: now,
    modified: now,
  }

  const content = this.stringify(fm, body)
  await fs.writeFile(this.filePath(id), content, 'utf-8')

  return {
    id,
    title: finalTitle,
    tags: tagList,
    scope: 'global',
    relativePath: `${id}.md`,
    createdAt: now,
    modifiedAt: now,
    ...(typeFromTag ? { noteType: typeFromTag } : {}),
  }
}
```

- [ ] **Step 3: Update list() to accept filterNoteType**

Replace the `async list(...)` signature. After the existing `filterTags` block, add:

```typescript
async list(filterTags?: string[], filterNoteType?: string): Promise<NoteInfo[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(this.notesDir)
  } catch {
    return []
  }

  const mdFiles = entries.filter(e => e.endsWith('.md'))
  const notes = await Promise.all(
    mdFiles.map(async f => {
      const result = await this.parseFile(path.join(this.notesDir, f))
      return result?.info ?? null
    })
  )

  let filtered = notes.filter(Boolean) as NoteInfo[]

  if (filterTags && filterTags.length > 0) {
    const tagSet = new Set(filterTags.map(t => t.toLowerCase()))
    filtered = filtered.filter(n =>
      n.tags.some(t => tagSet.has(t.toLowerCase()))
    )
  }

  if (filterNoteType) {
    filtered = filtered.filter(n => n.noteType === filterNoteType)
  }

  return filtered.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}
```

- [ ] **Step 4: Run CRUD + regression tests**

```bash
npm test -- tests/notes-extensions.test.ts -t "noteType uebergabedokument CRUD|regression" 2>&1
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/notes/note-manager.ts
git commit -m "feat(notes): noteType uebergabedokument in create/list/parseFile (CK-NOTES-004)"
```

---

## Task 5: NoteManager — saveRaw + frontmatter validation

**Files:**
- Modify: `src/main/notes/note-manager.ts`

- [ ] **Step 1: Add validateUebergabedokument() private method**

Add after the existing `stringify()` method:

```typescript
private validateUebergabedokument(fm: Record<string, unknown>): string[] {
  const required = ['dokument-typ', 'status', 'phasenuebergang', 'erstellt-am'] as const
  return required
    .filter(field => !fm[field])
    .map(field => `Pflichtfeld '${field}' fehlt im Frontmatter`)
}
```

- [ ] **Step 2: Add saveRaw() public method**

Add after `save()`:

```typescript
/**
 * Saves raw file content (including YAML frontmatter) verbatim.
 * Used by the editor when displaying Übergabedokumente in full.
 * Returns NoteInfo derived from the parsed frontmatter and any validation warnings.
 * CK-NOTES-010, CK-NOTES-014
 */
async saveRaw(id: string, rawContent: string): Promise<{ info: NoteInfo; warnings: string[] }> {
  const filePath = this.filePath(id)
  await fs.mkdir(this.notesDir, { recursive: true })
  await fs.writeFile(filePath, rawContent, 'utf-8')

  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(rawContent)
  } catch {
    const noteId = path.basename(filePath, '.md')
    const info: NoteInfo = {
      id: noteId,
      title: 'Untitled',
      tags: [],
      scope: 'global',
      relativePath: `${noteId}.md`,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    }
    return { info, warnings: ['Frontmatter konnte nicht geparst werden'] }
  }

  const fm = parsed.data as Record<string, unknown>
  const body = parsed.content.trimStart()
  const now = new Date().toISOString()
  const noteId = id

  const info: NoteInfo = {
    id: noteId,
    title: (fm.title as string) ?? this.extractTitle(body),
    tags: (fm.tags as string[]) ?? [],
    scope: 'global',
    relativePath: `${noteId}.md`,
    ...(fm.type ? { noteType: fm.type as string } : {}),
    createdAt: (fm.created as string) ?? now,
    modifiedAt: (fm.modified as string) ?? now,
    ...(fm['dokument-typ'] ? { dokumentTyp: fm['dokument-typ'] as string } : {}),
    ...(fm['phasenuebergang'] ? { phasenuebergang: fm['phasenuebergang'] as string } : {}),
    ...(fm['status'] ? { uebergabeStatus: fm['status'] as 'entwurf' | 'freigegeben' | 'abgeloest' } : {}),
  }

  const warnings = fm.type === 'uebergabedokument'
    ? this.validateUebergabedokument(fm)
    : []

  return { info, warnings }
}
```

- [ ] **Step 3: Run frontmatter validation tests**

```bash
npm test -- tests/notes-extensions.test.ts -t "frontmatter validation" 2>&1
```

Expected: 3 tests PASS.

- [ ] **Step 4: Run full test suite for this file**

```bash
npm test -- tests/notes-extensions.test.ts 2>&1
```

Expected: 16/16 PASS (only normalizer tests still fail at this point since normalizer not yet created).

Actually expected at this point: vault + CRUD + regression + validation = 13 pass, normalizer = 4 fail.

- [ ] **Step 5: Commit**

```bash
git add src/main/notes/note-manager.ts
git commit -m "feat(notes): saveRaw + frontmatter validation for uebergabedokument (CK-NOTES-010, CK-NOTES-014)"
```

---

## Task 6: P1 Normalizer

**Files:**
- Create: `src/main/p1/normalizer.ts`

- [ ] **Step 1: Create src/main/p1/ directory and normalizer.ts**

```typescript
/**
 * normalizer.ts — Normalises external Markdown inputs into P1 Übergabedokument format.
 *
 * CK-NOTES-012: Normalisierungsfunktion fuer externe Inputs.
 */

import matter from 'gray-matter'

/** Required frontmatter fields for a P1 Übergabedokument. */
const REQUIRED_FIELDS = ['dokument-typ', 'status', 'phasenuebergang', 'erstellt-am'] as const

/** Default value factories for fields that have sensible defaults. */
const DEFAULTS: Partial<Record<string, () => unknown>> = {
  status: () => 'entwurf',
  'erstellt-am': () => new Date().toISOString().split('T')[0],
  'phasenuebergang': () => '?? -> ??',
}

/**
 * Normalises a Markdown string (with or without frontmatter) into a valid
 * P1 Übergabedokument format.
 *
 * - Generates YAML frontmatter if absent.
 * - Fills missing required fields with defaults where possible; warns otherwise.
 * - Preserves the body content unchanged.
 *
 * @param markdown  Input Markdown (may or may not have frontmatter).
 * @param dokumentTyp  The intended dokument-typ value (e.g. 'anforderungen', 'spec').
 * @returns `normalized` — the full Markdown with frontmatter;
 *          `warnings` — list of fields that were defaulted or are missing.
 */
export function normalizeToP1Format(
  markdown: string,
  dokumentTyp: string
): { normalized: string; warnings: string[] } {
  const warnings: string[] = []

  // Parse existing frontmatter (gray-matter handles missing frontmatter gracefully)
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(markdown)
  } catch {
    parsed = { data: {}, content: markdown } as matter.GrayMatterFile<string>
    warnings.push('Frontmatter konnte nicht geparst werden — wird komplett neu generiert')
  }

  const existing = parsed.data as Record<string, unknown>
  const body = parsed.content

  // Build merged frontmatter: existing fields take precedence
  const fm: Record<string, unknown> = {
    ...existing,
    'type': 'uebergabedokument',
    'dokument-typ': existing['dokument-typ'] ?? dokumentTyp,
  }

  // Fill missing required fields; warn for each
  for (const field of REQUIRED_FIELDS) {
    if (!fm[field]) {
      const defaultFn = DEFAULTS[field]
      if (defaultFn) {
        fm[field] = defaultFn()
        warnings.push(`'${field}' fehlte — Default-Wert gesetzt: "${String(fm[field])}"`)
      } else {
        warnings.push(`'${field}' fehlt und hat keinen Default — bitte manuell ergaenzen`)
      }
    }
  }

  const normalized = matter.stringify('\n' + body.trimStart(), fm)
  return { normalized, warnings }
}
```

- [ ] **Step 2: Run normalizer tests**

```bash
npm test -- tests/notes-extensions.test.ts -t "normalizer" 2>&1
```

Expected: 4 normalizer tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test -- tests/notes-extensions.test.ts 2>&1
```

Expected: 16/16 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/p1/normalizer.ts
git commit -m "feat(p1): normalizeToP1Format — external Markdown to P1 Ubergabedokument (CK-NOTES-012)"
```

---

## Task 7: IPC wiring — NOTES_SAVE_RAW channel

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload.ts`
- Modify: `src/renderer/hooks/useNotes.ts`

- [ ] **Step 1: Add channels to ipc-channels.ts**

In the Notes section (after `NOTES_CHANGED`), add:

```typescript
export const NOTES_SAVE_RAW = 'notes:save-raw' as const
export const NOTES_VALIDATION_WARNING = 'notes:validation-warning' as const
```

Add `typeof NOTES_SAVE_RAW` to `RendererToMainChannel` union.
Add `typeof NOTES_VALIDATION_WARNING` to `MainToRendererChannel` union.

- [ ] **Step 2: Add handler to ipc-handlers.ts**

Add these imports at the top:

```typescript
import {
  // ... existing imports ...
  NOTES_SAVE_RAW,
  NOTES_VALIDATION_WARNING,
} from '../shared/ipc-channels'
import type { MainToRendererChannel } from '../shared/ipc-channels'
```

Add the handler after the NOTES_SAVE handler:

```typescript
ipcMain.handle(NOTES_SAVE_RAW, async (event, id: string, rawContent: string) => {
  if (!services.noteManager) return { id: null, error: 'Notes not initialized' }
  const { info, warnings } = await services.noteManager.saveRaw(id, rawContent)
  if (warnings.length > 0) {
    event.sender.send(NOTES_VALIDATION_WARNING as MainToRendererChannel, warnings)
  }
  return info
})
```

- [ ] **Step 3: Add saveRaw + onValidationWarning to preload.ts**

In `notesApi`, add after `save`:

```typescript
saveRaw: (id: string, rawContent: string) =>
  ipcRenderer.invoke('notes:save-raw' as RendererToMainChannel, id, rawContent),
```

Add after `onChanged`:

```typescript
onValidationWarning: (cb: (warnings: string[]) => void) => {
  const listener = (_e: IpcRendererEvent, warnings: string[]) => cb(warnings)
  ipcRenderer.on('notes:validation-warning' as MainToRendererChannel, listener)
  return () => { ipcRenderer.removeListener('notes:validation-warning' as MainToRendererChannel, listener) }
},
```

- [ ] **Step 4: Add saveNoteRaw to useNotes.ts**

After the `saveNote` callback:

```typescript
const saveNoteRaw = useCallback(async (id: string, rawContent: string): Promise<NoteInfo> => {
  return api().notes.saveRaw(id, rawContent) as Promise<NoteInfo>
}, [])
```

Add `saveNoteRaw` to the return object.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc-handlers.ts src/preload.ts src/renderer/hooks/useNotes.ts
git commit -m "feat(ipc): NOTES_SAVE_RAW + NOTES_VALIDATION_WARNING channels (CK-NOTES-010, CK-NOTES-014)"
```

---

## Task 8: NotesCell.tsx — sidebar categories + raw editor

**Files:**
- Modify: `src/renderer/components/NotesCell.tsx`

- [ ] **Step 1: Add saveNoteRaw + validationWarnings to component state**

At the top of `NotesCell()` function:

```typescript
const { notes, loading, createNote, readNote, saveNote, saveNoteRaw, trashNote, searchNotes } = useNotes()
const [validationWarnings, setValidationWarnings] = useState<string[]>([])
```

After the existing `useEffect` that loads note content, add:

```typescript
// Listen for validation warnings from main process
useEffect(() => {
  const unsub = (window as any).cipherKeel.notes.onValidationWarning((warnings: string[]) => {
    setValidationWarnings(warnings)
    setTimeout(() => setValidationWarnings([]), 6000)
  })
  return unsub
}, [])
```

- [ ] **Step 2: Use rawContent for uebergabedokument in editor**

In the CodeMirror `useEffect`, change the `doc` value:

```typescript
// Use raw content (with frontmatter) for Übergabedokumente
const editorContent = activeNote.info.noteType === 'uebergabedokument'
  ? activeNote.rawContent
  : activeNote.body

const state = EditorState.create({
  doc: editorContent,
  // ... extensions unchanged ...
})
```

Also update the auto-save handler inside the `updateListener`:

```typescript
saveTimerRef.current = setTimeout(() => {
  const text = update.state.doc.toString()
  if (activeNoteId) {
    const isRaw = activeNote.info.noteType === 'uebergabedokument'
    const saveFn = isRaw
      ? () => saveNoteRaw(activeNoteId, text)
      : () => saveNote(activeNoteId, text)
    saveFn().catch(err =>
      console.error('[NotesCell] auto-save failed:', err)
    )
    setDirty(false)
  }
}, 2000)
```

- [ ] **Step 3: Sidebar — uebergabedokument category**

Replace the note list rendering inside the `<div style={{ flex: 1, overflowY: 'auto', ... }}>` block with grouped rendering:

```typescript
const regularNotes = displayNotes.filter(n => n.noteType !== 'uebergabedokument')
const uebergabeDocs = displayNotes.filter(n => n.noteType === 'uebergabedokument')

const statusColor = (status?: string) => {
  if (status === 'freigegeben') return '#98c379'
  if (status === 'abgeloest') return '#666'
  return '#e5c07b'  // entwurf (default)
}

// Render in sidebar:
{loading ? (
  <div style={{ padding: '8px', color: '#666' }}>Loading...</div>
) : displayNotes.length === 0 ? (
  <div style={{ padding: '8px', color: '#666' }}>
    {searchQuery ? 'No results' : 'No notes yet'}
  </div>
) : (
  <>
    {uebergabeDocs.length > 0 && (
      <>
        <div style={{
          padding: '4px 8px 2px',
          color: '#666',
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Übergabedokumente
        </div>
        {uebergabeDocs.map(note => (
          <div
            key={note.id}
            onClick={() => handleSelect(note.id)}
            style={{
              padding: '5px 8px',
              cursor: 'pointer',
              background: note.id === activeNoteId ? '#282c34' : 'transparent',
              borderLeft: note.id === activeNoteId ? '2px solid #61afef' : '2px solid transparent',
              color: '#ccc',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontWeight: note.id === activeNoteId ? 600 : 400, fontSize: '11px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.title}
              </span>
              {note.dokumentTyp && (
                <span style={{ background: '#2c313a', color: '#abb2bf', padding: '0 3px', borderRadius: '2px', fontSize: '9px', flexShrink: 0 }}>
                  {note.dokumentTyp}
                </span>
              )}
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: statusColor(note.uebergabeStatus),
                flexShrink: 0,
              }} title={note.uebergabeStatus ?? 'entwurf'} />
            </div>
            {note.phasenuebergang && (
              <div style={{ color: '#666', fontSize: '9px', marginTop: '1px' }}>
                {note.phasenuebergang}
              </div>
            )}
          </div>
        ))}
      </>
    )}
    {regularNotes.length > 0 && (
      <>
        {uebergabeDocs.length > 0 && (
          <div style={{
            padding: '4px 8px 2px',
            color: '#666',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Notizen
          </div>
        )}
        {regularNotes.map(note => (
          <div
            key={note.id}
            onClick={() => handleSelect(note.id)}
            style={{
              padding: '6px 8px',
              cursor: 'pointer',
              background: note.id === activeNoteId ? '#282c34' : 'transparent',
              borderLeft: note.id === activeNoteId ? '2px solid #61afef' : '2px solid transparent',
              color: '#ccc',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: note.id === activeNoteId ? 600 : 400, fontSize: '11px' }}>
              {note.title}
            </div>
            {note.preview && (
              <div style={{ color: '#666', fontSize: '10px', marginTop: '2px' }}>
                {note.preview}
              </div>
            )}
            {note.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                {note.tags.slice(0, 3).map(tag => (
                  <span key={tag} style={{ background: '#333', color: '#888', padding: '0 4px', borderRadius: '2px', fontSize: '9px' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </>
    )}
  </>
)}
```

- [ ] **Step 4: Render validation warnings in editor header**

Inside the note header area (after the title span), add:

```typescript
{validationWarnings.length > 0 && (
  <div style={{
    padding: '3px 8px',
    background: '#2c2400',
    borderBottom: '1px solid #4a3800',
    fontSize: '10px',
    color: '#e5c07b',
    flexShrink: 0,
  }}>
    {validationWarnings.map((w, i) => (
      <div key={i}>{w}</div>
    ))}
  </div>
)}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/NotesCell.tsx
git commit -m "feat(ui): NotesCell sidebar Ubergabedokument-Kategorie + raw editor + validation warnings (CK-NOTES-005, CK-NOTES-010)"
```

---

## Task 9: YAML frontmatter syntax highlighting

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/renderer/components/NotesCell.tsx`

- [ ] **Step 1: Install @codemirror/lang-yaml**

```bash
cd <repo-root>
npm install @codemirror/lang-yaml
```

- [ ] **Step 2: Add yaml import to NotesCell.tsx**

Add import at top:

```typescript
import { yaml as yamlLanguage } from '@codemirror/lang-yaml'
```

- [ ] **Step 3: Pass yaml to markdown() extension**

Change the `markdown()` call in the CodeMirror `extensions` array:

```typescript
markdown({ yaml: yamlLanguage() }),
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/renderer/components/NotesCell.tsx
git commit -m "feat(ui): YAML frontmatter syntax highlighting in NotesCell (CK-NOTES-010)"
```

---

## Task 10: Final verification + mux_send

- [ ] **Step 1: Run full test suite**

```bash
cd <repo-root>
npm test 2>&1 | tail -20
```

Expected: all pre-existing tests pass + 16 new tests in `notes-extensions.test.ts` pass.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1
```

Expected: 0 errors.

- [ ] **Step 3: Send completion via mux_send**

Use `mux_send` to send to session `01KTBQD9DJZQT19XTJ8FHGTQKE`:

```
W2D fertig: [vault-structure.ts, p1/normalizer.ts, note-manager.ts, NotesCell.tsx, ipc-channels.ts, ipc-handlers.ts, preload.ts, useNotes.ts, types.ts] [16/16 tests]
```

---

## Self-Review

**Spec coverage check:**

| REQ | Task |
|-----|------|
| CK-P1-008 — noteType uebergabedokument | Task 4 (create/list/parseFile) |
| CK-NOTES-004 — noteType uebergabedokument | Task 4 + Task 1 tests |
| CK-NOTES-005 — Sidebar Kategorie | Task 8 Step 3 |
| CK-NOTES-007 — Vault-Struktur | Task 2 |
| CK-NOTES-010 — Editor für Übergabedokumente | Task 5 (saveRaw) + Task 8 Steps 1-2 + Task 9 |
| CK-NOTES-012 — Normalizer | Task 6 |
| CK-NOTES-014 — Frontmatter-Validierung | Task 5 (validateUebergabedokument) + Task 7 (IPC event) |

All 7 REQs covered.

**Placeholder scan:** No TBDs or TODOs — all steps have concrete code.

**Type consistency:**
- `NoteInfo.dokumentTyp` used consistently in parseFile (Task 4), saveRaw (Task 5), NotesCell sidebar (Task 8)
- `NoteContent.rawContent` defined in Task 3, populated in parseFile (Task 4), used in NotesCell editor (Task 8)
- `saveRaw()` returns `{ info: NoteInfo; warnings: string[] }` — consistent across Task 5, Task 7, Task 8
