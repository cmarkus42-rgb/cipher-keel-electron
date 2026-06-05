/**
 * NoteManager — CRUD for markdown notes with frontmatter.
 *
 * Ported from cipher-mux 0.9.x (CK-NOTES-001).
 * Notes stored flat in {notesDir}/{id}.md with gray-matter frontmatter.
 */

import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { ulid } from 'ulidx'
import type { NoteInfo, NoteContent, HandoffStatus } from '../../shared/types'

export class NoteManager {
  private notesDir: string
  private trashDir: string

  constructor(notesDir: string) {
    this.notesDir = notesDir
    this.trashDir = path.join(notesDir, '.trash')
    void fs.mkdir(this.notesDir, { recursive: true })
    this.cleanTrash()
  }

  getNotesDir(): string {
    return this.notesDir
  }

  private cleanTrash(): void {
    try {
      if (!fsSync.existsSync(this.trashDir)) return
      const entries = fsSync.readdirSync(this.trashDir)
      for (const entry of entries) {
        try { fsSync.unlinkSync(path.join(this.trashDir, entry)) } catch { /* ignore */ }
      }
    } catch { /* trash dir doesn't exist */ }
  }

  private filePath(id: string): string {
    return path.join(this.notesDir, `${id}.md`)
  }

  private extractTitle(body: string): string {
    const match = body.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : 'Untitled'
  }

  private extractPreview(body: string): string | undefined {
    const lines = body.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue
      return trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed
    }
    return undefined
  }

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
    }

    return { info, body }
  }

  private stringify(fm: Record<string, unknown>, body: string): string {
    return matter.stringify('\n' + body, fm)
  }

  // --- Public API ---

  async create(title: string, body: string, tags?: string[]): Promise<NoteInfo> {
    const id = ulid()
    const now = new Date().toISOString()
    await fs.mkdir(this.notesDir, { recursive: true })

    const finalTitle = title || this.extractTitle(body)
    const tagList = tags ?? []
    const fm: Record<string, unknown> = {
      title: finalTitle,
      ...(tagList.includes('kind:testcase') ? { type: 'testcase' } : {}),
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
    }
  }

  async list(filterTags?: string[]): Promise<NoteInfo[]> {
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

    return filtered.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  async read(id: string): Promise<NoteContent | null> {
    return this.parseFile(this.filePath(id))
  }

  async save(id: string, body: string, tags?: string[]): Promise<NoteInfo> {
    const filePath = this.filePath(id)
    const existing = await this.parseFile(filePath)
    const now = new Date().toISOString()
    const extractedTitle = this.extractTitle(body)

    let existingFm: Record<string, unknown> = {}
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      existingFm = matter(raw).data as Record<string, unknown>
    } catch { /* new file */ }

    const title = extractedTitle !== 'Untitled'
      ? extractedTitle
      : (existingFm.title as string) ?? existing?.info.title ?? 'Untitled'

    const finalTags = tags ?? existing?.info.tags ?? []
    const hasTestcaseTag = finalTags.includes('kind:testcase')
    const { type: existingType, ...restFm } = existingFm as Record<string, unknown> & { type?: string }
    const fm: Record<string, unknown> = {
      ...restFm,
      title,
      ...(hasTestcaseTag ? { type: 'testcase' } : (existingType && existingType !== 'testcase' ? { type: existingType } : {})),
      tags: finalTags,
      created: existing?.info.createdAt ?? now,
      modified: now,
    }

    await fs.mkdir(this.notesDir, { recursive: true })
    const content = this.stringify(fm, body)
    await fs.writeFile(filePath, content, 'utf-8')

    return {
      id,
      title,
      tags: fm.tags as string[],
      scope: 'global',
      relativePath: `${id}.md`,
      createdAt: fm.created as string,
      modifiedAt: now,
    }
  }

  async search(query: string, opts?: { tags?: string[] }): Promise<NoteContent[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.notesDir)
    } catch {
      return []
    }

    const mdFiles = entries.filter(e => e.endsWith('.md'))
    const allNotes: NoteContent[] = []
    const parsed = await Promise.all(
      mdFiles.map(f => this.parseFile(path.join(this.notesDir, f)))
    )
    for (const p of parsed) {
      if (p) allNotes.push(p)
    }

    const lowerQuery = query.toLowerCase()

    let results = allNotes.filter(n =>
      n.info.title.toLowerCase().includes(lowerQuery) ||
      n.body.toLowerCase().includes(lowerQuery)
    )

    if (opts?.tags && opts.tags.length > 0) {
      const filterTags = new Set(opts.tags.map(t => t.toLowerCase()))
      results = results.filter(n =>
        n.info.tags.some(t => filterTags.has(t.toLowerCase()))
      )
    }

    results.sort((a, b) => {
      const aTitle = a.info.title.toLowerCase().includes(lowerQuery) ? 0 : 1
      const bTitle = b.info.title.toLowerCase().includes(lowerQuery) ? 0 : 1
      if (aTitle !== bTitle) return aTitle - bTitle
      return b.info.modifiedAt.localeCompare(a.info.modifiedAt)
    })

    return results.slice(0, 50)
  }

  async trash(id: string): Promise<boolean> {
    try {
      await fs.mkdir(this.trashDir, { recursive: true })
      await fs.rename(this.filePath(id), path.join(this.trashDir, `${id}.md`))
      return true
    } catch {
      return false
    }
  }

  async trashMany(ids: string[]): Promise<string[]> {
    await fs.mkdir(this.trashDir, { recursive: true })
    const trashed: string[] = []
    for (const id of ids) {
      try {
        await fs.rename(this.filePath(id), path.join(this.trashDir, `${id}.md`))
        trashed.push(id)
      } catch { /* skip */ }
    }
    return trashed
  }

  async restoreMany(ids: string[]): Promise<string[]> {
    const restored: string[] = []
    for (const id of ids) {
      try {
        await fs.rename(path.join(this.trashDir, `${id}.md`), this.filePath(id))
        restored.push(id)
      } catch { /* skip */ }
    }
    return restored
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(id))
      return true
    } catch {
      return false
    }
  }

  destroy(): void {
    // cleanup placeholder
  }
}
