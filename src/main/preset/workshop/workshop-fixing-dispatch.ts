/**
 * Workshop Fixing Dispatch — routes fixing items to appropriate presets.
 * BUG → Debugger, MFR/NRF → Development Worker.
 * CK-PROC-015
 */

import type Database from 'better-sqlite3'
import { GraphWriter } from '../../graph/writer'

export type ItemTyp = 'BUG' | 'MFR' | 'NRF'

export interface FixingItem {
  id: string
  titel: string
  typ: ItemTyp
}

export interface DispatchResult {
  itemId: string
  targetPreset: string
  reasoning: string
}

export function classifyItem(item: FixingItem): ItemTyp {
  return item.typ
}

export function dispatchFixingItem(item: FixingItem, graphDb?: Database.Database): DispatchResult {
  const typ = classifyItem(item)
  const result: DispatchResult = typ === 'BUG'
    ? {
        itemId: item.id,
        targetPreset: 'debugger',
        reasoning: `BUG item dispatched to debugger preset for systematic debugging`,
      }
    : {
        itemId: item.id,
        targetPreset: 'development-worker',
        reasoning: `${typ} item dispatched to development worker for implementation`,
      }

  if (graphDb) {
    const writer = new GraphWriter(graphDb)
    writer.upsertNode({
      kind: 'note',
      title: `routing-decision:${item.id}`,
      body: result.reasoning,
      frontmatter: {
        notetyp: 'routing-decision',
        itemId: item.id,
        targetPreset: result.targetPreset,
      },
    })
  }

  return result
}
