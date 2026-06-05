/**
 * TagClassRepo — Tag class management and persistence.
 *
 * Ported from cipher-mux 0.9.x (CK-NOTES-002).
 * Single-writer pattern for atomic .tags.json updates.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagClassRepository, TagClass } from '../../shared/types'

const TAGS_FILENAME = '.tags.json'

export const SEED_CLASSES: Record<string, TagClass> = {
  kind: {
    values: ['bugreport', 'feature-request', 'reference', 'testcase', 'handoff', 'spec', 'todo'],
    color: '#6366f1',
  },
  status: {
    values: ['open', 'in-progress', 'done', 'blocked', 'archived'],
    color: '#f59e0b',
  },
  domain: {
    values: ['ui'],
    color: '#10b981',
  },
  project: {
    values: ['cipher-keel'],
    color: '#8b5cf6',
  },
  scope: {
    values: [],
    color: '#64748b',
  },
}

export class TagClassRepo {
  private filePath: string
  private data: TagClassRepository

  constructor(notesDir: string) {
    this.filePath = path.join(notesDir, TAGS_FILENAME)
    this.data = { classes: {} }
    this.load()
  }

  private load(): void {
    const merged: Record<string, TagClass> = {}
    for (const [cls, entry] of Object.entries(SEED_CLASSES)) {
      merged[cls] = { values: [...entry.values], color: entry.color }
    }

    let synonyms: Record<string, string> = {}

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const persisted = JSON.parse(raw) as TagClassRepository
      if (persisted.classes && typeof persisted.classes === 'object') {
        for (const [cls, entry] of Object.entries(persisted.classes)) {
          if (merged[cls]) {
            const valueSet = new Set([...merged[cls].values, ...entry.values])
            merged[cls] = {
              values: [...valueSet],
              color: entry.color ?? merged[cls].color,
            }
          } else {
            merged[cls] = { values: [...entry.values], color: entry.color }
          }
        }
      }
      if (persisted.synonyms && typeof persisted.synonyms === 'object') {
        synonyms = { ...persisted.synonyms }
      }
    } catch { /* use seeds only */ }

    this.data = { classes: merged, synonyms }
  }

  private save(): void {
    this.saveWithTags(undefined, undefined)
  }

  saveWithTags(
    tags: Record<string, unknown> | undefined,
    tagClasses: Record<string, unknown> | undefined,
  ): void {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      } catch { /* start fresh */ }
      const merged: Record<string, unknown> = {
        ...existing,
        classes: this.data.classes,
        synonyms: this.data.synonyms,
      }
      if (tags !== undefined) merged.tags = tags
      if (tagClasses !== undefined) merged._tagClasses = tagClasses
      fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf-8')
    } catch { /* non-fatal */ }
  }

  getRepository(): TagClassRepository {
    return this.data
  }

  static parseTag(tag: string): { tagClass: string | null; value: string } {
    const idx = tag.indexOf(':')
    if (idx === -1) return { tagClass: null, value: tag }
    return { tagClass: tag.slice(0, idx), value: tag.slice(idx + 1) }
  }

  ensureTag(tag: string): boolean {
    const { tagClass, value } = TagClassRepo.parseTag(tag)
    if (!tagClass) return false

    let changed = false
    if (!this.data.classes[tagClass]) {
      this.data.classes[tagClass] = { values: [], color: undefined }
      changed = true
    }
    if (!this.data.classes[tagClass].values.includes(value)) {
      this.data.classes[tagClass].values.push(value)
      changed = true
    }
    if (changed) this.save()
    return changed
  }

  ensureTags(tags: string[]): boolean {
    let anyChanged = false
    for (const tag of tags) {
      const { tagClass, value } = TagClassRepo.parseTag(tag)
      if (!tagClass) continue
      if (!this.data.classes[tagClass]) {
        this.data.classes[tagClass] = { values: [], color: undefined }
        anyChanged = true
      }
      if (!this.data.classes[tagClass].values.includes(value)) {
        this.data.classes[tagClass].values.push(value)
        anyChanged = true
      }
    }
    if (anyChanged) this.save()
    return anyChanged
  }

  getClassNames(): string[] {
    return Object.keys(this.data.classes)
  }

  getClassValues(className: string): string[] {
    return this.data.classes[className]?.values ?? []
  }

  resolveSynonym(tag: string): string {
    return this.data.synonyms?.[tag] ?? tag
  }

  addSynonym(from: string, to: string): void {
    if (!this.data.synonyms) this.data.synonyms = {}
    this.data.synonyms[from] = to
    this.save()
  }

  getSynonyms(): Record<string, string> {
    return { ...(this.data.synonyms ?? {}) }
  }
}
