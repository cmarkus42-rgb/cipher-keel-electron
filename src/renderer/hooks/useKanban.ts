/**
 * useKanban — React hook for Kanban state via IPC.
 *
 * Loads kanban items from main process via KANBAN_LIST.
 * Exposes filter state and derived filtered/grouped data.
 * CK-UI-010.
 */

import { useState, useEffect, useCallback } from 'react'
import type { KanbanFilter, KanbanItem } from '../../shared/kanban-types'
import { filterKanbanItems } from '../../shared/kanban-types'
import { isSubsystemError, type SubsystemError } from '../../shared/service-status'

// IPC channel constants (inlined to avoid circular imports in renderer)
const KANBAN_LIST    = 'kanban:list'
const KANBAN_CREATE  = 'kanban:create'
const KANBAN_UPDATE  = 'kanban:update'
const KANBAN_DELETE  = 'kanban:delete'
const KANBAN_CHANGED = 'kanban:changed'

export interface UseKanbanResult {
  items: KanbanItem[]
  filteredItems: KanbanItem[]
  filter: KanbanFilter
  setFilter: (filter: KanbanFilter) => void
  loading: boolean
  /** Set when the kanban subsystem is unavailable — distinct from an empty board. */
  error: SubsystemError | null
  reload: () => Promise<void>
}

export function useKanban(): UseKanbanResult {
  const [items, setItems] = useState<KanbanItem[]>([])
  const [filter, setFilter] = useState<KanbanFilter>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<SubsystemError | null>(null)

  const reload = useCallback(async () => {
    if (!window.cipherKeel) return
    setLoading(true)
    try {
      const result = await window.cipherKeel.invoke(KANBAN_LIST) as {
        items?: KanbanItem[]
        error?: unknown
      }
      setItems(result?.items ?? [])
      setError(isSubsystemError(result?.error) ? result.error : null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    reload()
  }, [reload])

  // Subscribe to push updates from main
  useEffect(() => {
    if (!window.cipherKeel) return
    const unsub = window.cipherKeel.on(KANBAN_CHANGED, () => { reload() })
    return unsub
  }, [reload])

  const filteredItems = filterKanbanItems(items, filter)

  return { items, filteredItems, filter, setFilter, loading, error, reload }
}

export { KANBAN_LIST, KANBAN_CREATE, KANBAN_UPDATE, KANBAN_DELETE }
