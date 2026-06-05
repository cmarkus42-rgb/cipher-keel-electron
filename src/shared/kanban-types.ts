/**
 * kanban-types.ts — Shared Kanban types for Main and Renderer.
 *
 * Pure data types and filter utilities — no SQLite dependency.
 * KanbanStore (SQLite) lives in src/main/kanban/kanban-store.ts.
 *
 * CK-UI-009, CK-UI-010
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const KANBAN_COLUMNS = ['backlog', 'in-bearbeitung', 'in-review', 'fertig'] as const
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number]

export const KANBAN_PRIORITAETEN = ['hoch', 'mittel', 'niedrig'] as const
export type KanbanPrioritaet = (typeof KANBAN_PRIORITAETEN)[number]

export function isValidColumn(col: string): col is KanbanColumn {
  return (KANBAN_COLUMNS as readonly string[]).includes(col)
}

export function isValidPrioritaet(p: string): p is KanbanPrioritaet {
  return (KANBAN_PRIORITAETEN as readonly string[]).includes(p)
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface KanbanItem {
  id: string
  title: string
  column: KanbanColumn
  /** Phase 1-8 (M4 Phasenkette) */
  phase: number
  /** Schenkel 1 = Claude Code, 2 = NanoClaw */
  schenkel: 1 | 2
  /** Node kind from graph (anforderung, artefakt, ...) */
  typ: string
  prioritaet: KanbanPrioritaet
  /** Reference to Knowledge Graph node */
  nodeUid: string | null
  /** Reference to Vault file path — used for orphan detection */
  vaultPath: string | null
  erstellt: string
}

export interface CreateKanbanItemInput {
  title: string
  column?: KanbanColumn
  phase: number
  schenkel: 1 | 2
  typ: string
  prioritaet?: KanbanPrioritaet
  nodeUid?: string
  vaultPath?: string
}

export interface UpdateKanbanItemInput {
  id: string
  column?: KanbanColumn
  title?: string
  phase?: number
  schenkel?: 1 | 2
  typ?: string
  prioritaet?: KanbanPrioritaet
  nodeUid?: string
  vaultPath?: string
}

export interface OrphanedItemFinding {
  id: string
  title: string
  vaultPath: string
}

export interface KanbanFilter {
  phases?: number[]
  typen?: string[]
  schenkel?: (1 | 2)[]
  prioritaeten?: KanbanPrioritaet[]
}

// ---------------------------------------------------------------------------
// Filter utility (pure — exported for testing, CK-UI-010)
// ---------------------------------------------------------------------------

/**
 * Filter kanban items by phase, typ, schenkel, prioritaet.
 * AND semantics between dimensions, OR semantics within a dimension.
 */
export function filterKanbanItems(items: KanbanItem[], filter: KanbanFilter): KanbanItem[] {
  return items.filter(item => {
    if (filter.phases && filter.phases.length > 0 && !filter.phases.includes(item.phase)) return false
    if (filter.typen && filter.typen.length > 0 && !filter.typen.includes(item.typ)) return false
    if (filter.schenkel && filter.schenkel.length > 0 && !filter.schenkel.includes(item.schenkel)) return false
    if (filter.prioritaeten && filter.prioritaeten.length > 0 && !filter.prioritaeten.includes(item.prioritaet)) return false
    return true
  })
}
