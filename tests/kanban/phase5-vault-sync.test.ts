// tests/kanban/phase5-vault-sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { syncKanbanToGraph, type KanbanItem } from '../../src/main/kanban/kanban-graph-sync'
import type Database from 'better-sqlite3'

describe('Kanban-Graph Sync (CK-UI-034)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('creates graph node for new kanban item', () => {
    const item: KanbanItem = {
      id: 'kb-001',
      title: 'Fix login bug',
      column: 'in-bearbeitung',
      phase: 6,
    }

    const result = syncKanbanToGraph(writer, item, 'create')
    expect(result.nodeUid).toHaveLength(26)
    expect(result.synced).toBe(true)
  })

  it('updates graph node status on kanban move', () => {
    const item: KanbanItem = { id: 'kb-001', title: 'Fix login', column: 'backlog', phase: 6 }
    const created = syncKanbanToGraph(writer, item, 'create')

    const updated = syncKanbanToGraph(writer, { ...item, column: 'fertig' }, 'update')
    expect(updated.nodeUid).toBe(created.nodeUid)
    expect(updated.synced).toBe(true)
  })

  it('marks orphaned items when graph node deleted', () => {
    const item: KanbanItem = { id: 'kb-001', title: 'Fix', column: 'backlog', phase: 6 }
    const created = syncKanbanToGraph(writer, item, 'create')

    // Delete the node by its actual graph UID
    writer.deleteNode(created.nodeUid)

    const result = syncKanbanToGraph(writer, item, 'check', db)
    expect(result.orphaned).toBe(true)
  })
})
