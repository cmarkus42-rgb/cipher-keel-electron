/**
 * kanban-store.ts — SQLite-backed Kanban item store.
 *
 * CK-UI-009: Board with 4 columns, phase badge, schenkel badge, typ tag.
 * CK-UI-027: K2 — bedienbar bei 200 Items.
 * CK-UI-034: Single-Writer-Queue for consistency, orphaned item hygiene.
 *
 * Pure types/filter utilities live in src/shared/kanban-types.ts.
 */

import type Database from 'better-sqlite3'
import { freshUlid } from '../graph/uid'

// Re-export shared types so existing imports from this module still work.
export {
  KANBAN_COLUMNS,
  KANBAN_PRIORITAETEN,
  isValidColumn,
  isValidPrioritaet,
  filterKanbanItems,
  type KanbanColumn,
  type KanbanPrioritaet,
  type KanbanItem,
  type CreateKanbanItemInput,
  type UpdateKanbanItemInput,
  type OrphanedItemFinding,
  type KanbanFilter,
} from '../../shared/kanban-types'

import type {
  KanbanColumn,
  KanbanPrioritaet,
  KanbanItem,
  CreateKanbanItemInput,
  UpdateKanbanItemInput,
  OrphanedItemFinding,
} from '../../shared/kanban-types'
import { isValidColumn, isValidPrioritaet } from '../../shared/kanban-types'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class KanbanSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KanbanSchemaError'
  }
}

// ---------------------------------------------------------------------------
// KanbanStore
// ---------------------------------------------------------------------------

type QueuedOp = () => void

/**
 * SQLite-backed store for Kanban items.
 *
 * Uses the same Single-Writer-Queue pattern as GraphWriter (CK-GRAPH-028)
 * to serialize writes and prevent race-condition duplicates when multiple
 * sessions write concurrently (CK-UI-034).
 */
export class KanbanStore {
  private db: Database.Database
  private writeQueue: QueuedOp[] = []
  private draining = false

  constructor(db: Database.Database) {
    this.db = db
    this.applySchema()
  }

  // ---------------------------------------------------------------------------
  // Schema
  // ---------------------------------------------------------------------------

  private applySchema(): void {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS kanban_item (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        col         TEXT NOT NULL DEFAULT 'backlog',
        phase       INTEGER NOT NULL DEFAULT 1,
        schenkel    INTEGER NOT NULL DEFAULT 1,
        typ         TEXT NOT NULL DEFAULT 'anforderung',
        prioritaet  TEXT NOT NULL DEFAULT 'mittel',
        node_uid    TEXT,
        vault_path  TEXT,
        erstellt    TEXT NOT NULL
      )
    `).run()
  }

  // ---------------------------------------------------------------------------
  // Single-Writer-Queue (CK-GRAPH-028 pattern, CK-UI-034)
  // ---------------------------------------------------------------------------

  private enqueue(op: QueuedOp): void {
    this.writeQueue.push(op)
    if (!this.draining) this.drain()
  }

  private drain(): void {
    this.draining = true
    try {
      while (this.writeQueue.length > 0) {
        const op = this.writeQueue.shift()!
        op()
      }
    } finally {
      this.draining = false
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  createItem(input: CreateKanbanItemInput): KanbanItem {
    if (!input.title || input.title.trim() === '') {
      throw new KanbanSchemaError('title is required')
    }
    if (input.phase < 1 || input.phase > 8) {
      throw new KanbanSchemaError(`phase must be 1-8, got ${input.phase}`)
    }
    if (input.schenkel !== 1 && input.schenkel !== 2) {
      throw new KanbanSchemaError(`schenkel must be 1 or 2, got ${input.schenkel}`)
    }

    const column = input.column ?? 'backlog'
    if (!isValidColumn(column)) {
      throw new KanbanSchemaError(`invalid column '${column}'`)
    }
    const prioritaet = input.prioritaet ?? 'mittel'
    if (!isValidPrioritaet(prioritaet)) {
      throw new KanbanSchemaError(`invalid prioritaet '${prioritaet}'`)
    }

    const id = freshUlid()
    const now = new Date().toISOString()
    let item!: KanbanItem

    this.enqueue(() => {
      this.db.prepare(`
        INSERT INTO kanban_item (id, title, col, phase, schenkel, typ, prioritaet, node_uid, vault_path, erstellt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.title, column, input.phase, input.schenkel, input.typ, prioritaet,
             input.nodeUid ?? null, input.vaultPath ?? null, now)
      item = {
        id, title: input.title, column, phase: input.phase,
        schenkel: input.schenkel, typ: input.typ, prioritaet,
        nodeUid: input.nodeUid ?? null,
        vaultPath: input.vaultPath ?? null,
        erstellt: now
      }
    })

    return item
  }

  listItems(): KanbanItem[] {
    const rows = this.db.prepare(`
      SELECT id, title, col, phase, schenkel, typ, prioritaet, node_uid, vault_path, erstellt
      FROM kanban_item ORDER BY erstellt ASC
    `).all() as {
      id: string; title: string; col: string; phase: number; schenkel: number;
      typ: string; prioritaet: string; node_uid: string | null; vault_path: string | null; erstellt: string
    }[]

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      column: r.col as KanbanColumn,
      phase: r.phase,
      schenkel: r.schenkel as 1 | 2,
      typ: r.typ,
      prioritaet: r.prioritaet as KanbanPrioritaet,
      nodeUid: r.node_uid,
      vaultPath: r.vault_path,
      erstellt: r.erstellt
    }))
  }

  updateItem(input: UpdateKanbanItemInput): boolean {
    if (input.column !== undefined && !isValidColumn(input.column)) {
      throw new KanbanSchemaError(`invalid column '${input.column}'`)
    }
    if (input.phase !== undefined && (input.phase < 1 || input.phase > 8)) {
      throw new KanbanSchemaError(`phase must be 1-8, got ${input.phase}`)
    }

    let updated = false

    this.enqueue(() => {
      const existing = this.db.prepare('SELECT id FROM kanban_item WHERE id = ?').get(input.id) as { id: string } | undefined
      if (!existing) return

      const sets: string[] = []
      const vals: unknown[] = []

      if (input.column !== undefined)     { sets.push('col = ?');        vals.push(input.column) }
      if (input.title !== undefined)      { sets.push('title = ?');      vals.push(input.title) }
      if (input.phase !== undefined)      { sets.push('phase = ?');      vals.push(input.phase) }
      if (input.schenkel !== undefined)   { sets.push('schenkel = ?');   vals.push(input.schenkel) }
      if (input.typ !== undefined)        { sets.push('typ = ?');        vals.push(input.typ) }
      if (input.prioritaet !== undefined) { sets.push('prioritaet = ?'); vals.push(input.prioritaet) }
      if (input.nodeUid !== undefined)    { sets.push('node_uid = ?');   vals.push(input.nodeUid) }
      if (input.vaultPath !== undefined)  { sets.push('vault_path = ?'); vals.push(input.vaultPath) }

      if (sets.length === 0) return

      vals.push(input.id)
      this.db.prepare(`UPDATE kanban_item SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as [unknown, ...unknown[]]))
      updated = true
    })

    return updated
  }

  deleteItem(id: string): boolean {
    let deleted = false
    this.enqueue(() => {
      const info = this.db.prepare('DELETE FROM kanban_item WHERE id = ?').run(id)
      deleted = info.changes > 0
    })
    return deleted
  }

  // ---------------------------------------------------------------------------
  // Board helpers
  // ---------------------------------------------------------------------------

  /** Items grouped by column for board rendering. */
  getByColumns(): Record<KanbanColumn, KanbanItem[]> {
    const all = this.listItems()
    const result: Record<KanbanColumn, KanbanItem[]> = {
      'backlog': [],
      'in-bearbeitung': [],
      'in-review': [],
      'fertig': []
    }
    for (const item of all) {
      result[item.column].push(item)
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Hygiene (CK-UI-034)
  // ---------------------------------------------------------------------------

  /**
   * Detect kanban items whose vault_path no longer exists in the given set.
   * Orphaned items should be reported as hygiene findings, not silently deleted.
   */
  checkOrphanedItems(existingPaths: Set<string>): OrphanedItemFinding[] {
    const rows = this.db.prepare(`
      SELECT id, title, vault_path FROM kanban_item WHERE vault_path IS NOT NULL
    `).all() as { id: string; title: string; vault_path: string }[]

    return rows
      .filter(r => !existingPaths.has(r.vault_path))
      .map(r => ({ id: r.id, title: r.title, vaultPath: r.vault_path }))
  }
}
