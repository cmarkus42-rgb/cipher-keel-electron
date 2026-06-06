/**
 * Workshop Fixing Dispatch — routes fixing items to appropriate presets.
 * BUG → Debugger, MFR/NRF → Development Worker.
 * CK-PROC-015
 */

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

export function dispatchFixingItem(item: FixingItem): DispatchResult {
  const typ = classifyItem(item)
  if (typ === 'BUG') {
    return {
      itemId: item.id,
      targetPreset: 'debugger',
      reasoning: `BUG item dispatched to debugger preset for systematic debugging`,
    }
  }
  return {
    itemId: item.id,
    targetPreset: 'development-worker',
    reasoning: `${typ} item dispatched to development worker for implementation`,
  }
}
