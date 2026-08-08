/**
 * NoteTagging — Auto-tagging via Ollama + tag repository management.
 *
 * Ported from cipher-mux 0.9.x (CK-NOTES-002).
 * Graceful degradation: returns null when Ollama is unavailable.
 */

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import matter from 'gray-matter'
import type { TagRepository, TagEntry } from '../../shared/types'
import type { TagClassRepo } from './tag-repository'

const TIMEOUT_MS = 60_000

/**
 * Ollama connection defaults. There is no `llm` section in CipherKeelConfig
 * (src/main/config/config-store.ts) — no such key has ever existed there,
 * and nothing else in the codebase reads or writes one. The `configStore.get
 * ('llm')` call this function used to make was dead: it always threw (typed
 * as `keyof CipherKeelConfig`, so this only compiled at all because `any`
 * casts elsewhere were suppressing the fallout) and every caller silently
 * landed on these exact defaults. Phase 7 / Task 5b: dropped the dead
 * lookup rather than inventing a config section with no other consumer —
 * behavior is unchanged, since the catch-all defaults were the only thing
 * that ever actually ran.
 */
function getLlmConfig() {
  return { host: '127.0.0.1', port: 11434, model: 'gemma3:12b' }
}

export const SEED_TAGS: Record<string, TagEntry> = {
  'kind:bugreport': { count: 0, description: 'Bug report notes' },
  'kind:journal': { count: 0, description: 'Personal journal, daily notes, reflections' },
  'kind:reference': { count: 0, description: 'Reference material, documentation, guides' },
  'kind:todo': { count: 0, description: 'Todo items, tasks, action points' },
  'kind:idea': { count: 0, description: 'Ideas, brainstorming, concepts' },
  'kind:testcase': { count: 0, description: 'Testcase note with checklist format' },
  'domain:trading': { count: 0, description: 'Trading strategies, market analysis' },
  'domain:risk': { count: 0, description: 'Risk management, position sizing' },
  'domain:infra': { count: 0, description: 'Infrastructure, server setup, deployment' },
  'domain:ai-ml': { count: 0, description: 'AI/ML models, training, inference, LLMs' },
  'domain:security': { count: 0, description: 'Security, access control, credentials' },
  'tech:typescript': { count: 0, description: 'TypeScript, type system, compiler' },
  'tech:python': { count: 0, description: 'Python scripts, libraries, automation' },
  'tech:electron': { count: 0, description: 'Electron framework, desktop app, IPC' },
  'project:cipher-keel': { count: 0, description: 'cipher-keel project' },
  'phase:research': { count: 0, description: 'Research, analysis, investigation' },
  'phase:architecture': { count: 0, description: 'System architecture, design patterns' },
  'phase:coding': { count: 0, description: 'Implementation, development' },
  'phase:testing': { count: 0, description: 'Unit tests, integration tests' },
  'phase:debugging': { count: 0, description: 'Debugging, troubleshooting' },
  handoff: { count: 0, description: 'Handoff note between sessions' },
}

export const TAG_CLASSES: Record<string, string> = {
  kind: 'Note type/purpose (bugreport, journal, reference, todo, idea)',
  domain: 'Subject area (trading, risk, infra, ai-ml, security)',
  tech: 'Technology (typescript, python, electron)',
  project: 'Project name (cipher-keel)',
  phase: 'Workflow phase (research, architecture, coding, testing, debugging)',
  scope: 'Visibility/lifecycle — auto-assigned (workspace:<id>, session)',
}

const TAGS_FILENAME = '.tags.json'

function buildTaggingPrompt(content: string, tagRepo: TagRepository): string {
  const existingTags = Object.keys(tagRepo.tags).join(', ')
  return `Du bist ein erfahrener Wissensorganisator. Lies die folgende Notiz und vergib bis zu 5 passende Tags.

Tags folgen dem klasse:wert Schema. Bekannte Klassen: kind (Zweck), domain (Fachgebiet), tech (Technologie), project (Projekt), phase (Workflow-Phase).
Beispiele: "domain:trading", "tech:typescript", "phase:debugging", "kind:reference".

Vorhandene Tags im Repository: ${existingTags}

Bevorzuge bestehende Tags. Gib ausschliesslich ein JSON-Array zurueck, z.B. ["domain:trading", "tech:typescript"].

Notiz:
${content.slice(0, 3000)}`
}

export function parseTagResponse(text: string): string[] {
  const normalize = (arr: unknown[]): string[] =>
    arr
      .filter((t) => typeof t === 'string')
      .map((t) => (t as string).toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 5)

  try {
    const parsed = JSON.parse(text.trim())
    if (Array.isArray(parsed)) return normalize(parsed)
  } catch { /* not clean JSON */ }

  const match = text.match(/\[[\s\S]*?\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return normalize(parsed)
    } catch { /* not valid JSON */ }
  }

  return text
    .replace(/[\[\]"']/g, '')
    .split(',')
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 5)
}

function ollamaPost(body: string): Promise<string> {
  const cfg = getLlmConfig()
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: cfg.host,
        port: cfg.port,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama HTTP ${res.statusCode}`))
            return
          }
          resolve(Buffer.concat(chunks).toString('utf-8'))
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Ollama request timed out'))
    })
    req.write(body)
    req.end()
  })
}

export class NoteTagging {
  private notesDir: string
  private repo: TagRepository
  private tagClassRepo: TagClassRepo | null = null

  constructor(notesDir: string) {
    this.notesDir = notesDir
    this.repo = { tags: {} }
    this.loadRepository()
  }

  setTagClassRepo(repo: TagClassRepo): void {
    this.tagClassRepo = repo
  }

  private get tagsFilePath(): string {
    return path.join(this.notesDir, TAGS_FILENAME)
  }

  private loadRepository(): void {
    const merged: Record<string, TagEntry> = {}
    for (const [tag, entry] of Object.entries(SEED_TAGS)) {
      merged[tag] = { ...entry }
    }

    try {
      const raw = fs.readFileSync(this.tagsFilePath, 'utf-8')
      const persisted = JSON.parse(raw) as TagRepository
      if (persisted.tags && typeof persisted.tags === 'object') {
        for (const [tag, entry] of Object.entries(persisted.tags)) {
          merged[tag] = { ...entry }
        }
      }
    } catch { /* use seeds only */ }

    this.repo = { tags: merged }
  }

  private saveRepository(): void {
    if (this.tagClassRepo) {
      this.tagClassRepo.saveWithTags(this.repo.tags as Record<string, unknown>, TAG_CLASSES)
      return
    }
    try {
      fs.mkdirSync(this.notesDir, { recursive: true })
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(fs.readFileSync(this.tagsFilePath, 'utf-8'))
      } catch { /* start fresh */ }
      const merged = { ...existing, tags: this.repo.tags, _tagClasses: TAG_CLASSES }
      fs.writeFileSync(this.tagsFilePath, JSON.stringify(merged, null, 2), 'utf-8')
    } catch { /* non-fatal */ }
  }

  getTagRepository(): TagRepository {
    return this.repo
  }

  updateRepository(tags: string[]): void {
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim()
      if (!normalized) continue
      if (this.repo.tags[normalized]) {
        this.repo.tags[normalized] = {
          ...this.repo.tags[normalized],
          count: this.repo.tags[normalized].count + 1,
        }
      } else {
        this.repo.tags[normalized] = { count: 1, description: '' }
      }
    }
    this.saveRepository()
  }

  recountTags(): void {
    for (const key of Object.keys(this.repo.tags)) {
      this.repo.tags[key] = { ...this.repo.tags[key], count: 0 }
    }

    let files: string[]
    try {
      files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
    } catch {
      return
    }

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.notesDir, file), 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []
        for (const tag of tags) {
          const norm = tag.toLowerCase().trim()
          if (this.repo.tags[norm]) {
            this.repo.tags[norm] = {
              ...this.repo.tags[norm],
              count: this.repo.tags[norm].count + 1,
            }
          }
        }
      } catch { /* skip */ }
    }
    this.saveRepository()
  }

  async autoTag(content: string): Promise<string[] | null> {
    try {
      const prompt = buildTaggingPrompt(content, this.repo)
      const cfg = getLlmConfig()
      const body = JSON.stringify({
        model: cfg.model,
        prompt,
        stream: false,
        keep_alive: -1,
      })

      const raw = await ollamaPost(body)
      const data = JSON.parse(raw) as Record<string, unknown>
      const text = (data.response as string | undefined)?.trim()
      if (!text) return null

      return parseTagResponse(text)
    } catch {
      // Ollama not available — graceful degradation (CK-NOTES-002, CK-NFR-010)
      return null
    }
  }
}
