/**
 * Kanban → Graph sync. One-directional: Kanban items create/update graph nodes.
 * CK-UI-034
 */

import type Database from 'better-sqlite3'
import type { GraphWriter } from '../graph/writer'

export interface KanbanItem {
  id: string
  title: string
  column: string
  phase: number
}

export interface SyncResult {
  nodeUid: string
  synced: boolean
  orphaned?: boolean
}

const COLUMN_TO_STATUS: Record<string, string> = {
  backlog: 'aktiv',
  'in-bearbeitung': 'aktiv',
  'in-review': 'aktiv',
  fertig: 'abgeloest',
}

export function syncKanbanToGraph(
  writer: GraphWriter,
  item: KanbanItem,
  action: 'create' | 'update' | 'check',
  db?: Database.Database,
): SyncResult {
  if (action === 'check') {
    if (!db) return { nodeUid: '', synced: false, orphaned: true }
    const row = db.prepare("SELECT uid FROM node WHERE path = ?")
      .get(`/kanban/${item.id}`) as { uid: string } | undefined
    if (!row) return { nodeUid: '', synced: false, orphaned: true }
    return { nodeUid: row.uid, synced: true, orphaned: false }
  }

  const status = COLUMN_TO_STATUS[item.column] ?? 'aktiv'

  const result = writer.upsertNode({
    kind: 'note',
    title: item.title,
    path: `/kanban/${item.id}`,
    status,
    frontmatter: {
      notetyp: 'kanban-item',
      column: item.column,
      phase: item.phase,
    },
  })

  return { nodeUid: result.uid, synced: true }
}
