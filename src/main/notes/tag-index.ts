/**
 * TagIndex — Runtime tag index built from note frontmatter.
 *
 * Ported from cipher-mux 0.9.x (CK-NOTES-002).
 * Pure in-memory cache, rebuilt on startup and on changes.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import matter from 'gray-matter'
import type { TagIndexData } from '../../shared/types'
import { TagClassRepo } from './tag-repository'

export class TagIndex {
  private notesDir: string
  private tagClassRepo: TagClassRepo
  private index: TagIndexData

  constructor(notesDir: string, tagClassRepo: TagClassRepo) {
    this.notesDir = notesDir
    this.tagClassRepo = tagClassRepo
    this.index = this.emptyIndex()
  }

  private emptyIndex(): TagIndexData {
    return {
      tagToNoteIds: {},
      classValueCounts: {},
      totalNotes: 0,
      builtAt: new Date().toISOString(),
    }
  }

  rebuild(): TagIndexData {
    const idx = this.emptyIndex()

    let files: string[]
    try {
      files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
    } catch {
      this.index = idx
      return idx
    }

    for (const file of files) {
      const noteId = path.basename(file, '.md')
      try {
        const raw = fs.readFileSync(path.join(this.notesDir, file), 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []

        idx.totalNotes++

        for (const tag of tags) {
          const normalized = tag.toLowerCase().trim()
          if (!normalized) continue

          if (!idx.tagToNoteIds[normalized]) {
            idx.tagToNoteIds[normalized] = []
          }
          idx.tagToNoteIds[normalized].push(noteId)

          const { tagClass, value } = TagClassRepo.parseTag(normalized)
          if (tagClass) {
            if (!idx.classValueCounts[tagClass]) {
              idx.classValueCounts[tagClass] = {}
            }
            idx.classValueCounts[tagClass][value] = (idx.classValueCounts[tagClass][value] ?? 0) + 1
            this.tagClassRepo.ensureTag(normalized)
          }
        }
      } catch { /* skip unparseable */ }
    }

    idx.builtAt = new Date().toISOString()
    this.index = idx
    return idx
  }

  getIndex(): TagIndexData {
    return this.index
  }

  updateNote(noteId: string, newTags: string[]): void {
    for (const [tag, ids] of Object.entries(this.index.tagToNoteIds)) {
      const filtered = ids.filter(id => id !== noteId)
      if (filtered.length === 0) {
        delete this.index.tagToNoteIds[tag]
      } else {
        this.index.tagToNoteIds[tag] = filtered
      }
    }

    this.rebuildClassCounts()

    for (const tag of newTags) {
      const normalized = tag.toLowerCase().trim()
      if (!normalized) continue

      if (!this.index.tagToNoteIds[normalized]) {
        this.index.tagToNoteIds[normalized] = []
      }
      if (!this.index.tagToNoteIds[normalized].includes(noteId)) {
        this.index.tagToNoteIds[normalized].push(noteId)
      }

      const { tagClass, value } = TagClassRepo.parseTag(normalized)
      if (tagClass) {
        if (!this.index.classValueCounts[tagClass]) {
          this.index.classValueCounts[tagClass] = {}
        }
        this.index.classValueCounts[tagClass][value] = (this.index.classValueCounts[tagClass][value] ?? 0) + 1
        this.tagClassRepo.ensureTag(normalized)
      }
    }
  }

  removeNote(noteId: string): void {
    for (const [tag, ids] of Object.entries(this.index.tagToNoteIds)) {
      const filtered = ids.filter(id => id !== noteId)
      if (filtered.length === 0) {
        delete this.index.tagToNoteIds[tag]
      } else {
        this.index.tagToNoteIds[tag] = filtered
      }
    }
    this.index.totalNotes = Math.max(0, this.index.totalNotes - 1)
    this.rebuildClassCounts()
  }

  private rebuildClassCounts(): void {
    this.index.classValueCounts = {}
    for (const [tag, ids] of Object.entries(this.index.tagToNoteIds)) {
      const { tagClass, value } = TagClassRepo.parseTag(tag)
      if (!tagClass) continue
      if (!this.index.classValueCounts[tagClass]) {
        this.index.classValueCounts[tagClass] = {}
      }
      this.index.classValueCounts[tagClass][value] = ids.length
    }
  }
}
