/**
 * KanbanBoard — 4-column Kanban board with phase-location and filter chips.
 *
 * Columns: Backlog | In Bearbeitung | In Review | Fertig
 * Each card carries Phase-Badge, Schenkel-Badge, Typ-Tag.
 * Filter chips reduce visible items combinably.
 *
 * CK-UI-009, CK-UI-010, CK-UI-027 (K2 — 200 items < 100ms render).
 */

import { useMemo } from 'react'
import { KanbanCard } from './KanbanCard'
import { FilterChips } from './FilterChips'
import { filterKanbanItems } from '../../shared/kanban-types'
import type { KanbanFilter, KanbanItem } from '../../shared/kanban-types'

interface KanbanBoardProps {
  items: KanbanItem[]
  filter: KanbanFilter
  onFilterChange: (filter: KanbanFilter) => void
}

const COLUMNS = [
  { id: 'backlog',         label: 'Backlog' },
  { id: 'in-bearbeitung',  label: 'In Bearbeitung' },
  { id: 'in-review',       label: 'In Review' },
  { id: 'fertig',          label: 'Fertig' },
] as const

export function KanbanBoard({ items, filter, onFilterChange }: KanbanBoardProps) {
  // Derive unique typen for filter chips
  const availableTypen = useMemo(() => {
    const typen = new Set(items.map(i => i.typ))
    return Array.from(typen).sort()
  }, [items])

  // Apply filter
  const visibleItems = useMemo(() => filterKanbanItems(items, filter), [items, filter])

  // Group by column
  const byColumn = useMemo(() => {
    const map: Record<string, KanbanItem[]> = {
      'backlog': [], 'in-bearbeitung': [], 'in-review': [], 'fertig': []
    }
    for (const item of visibleItems) {
      map[item.column]?.push(item)
    }
    return map
  }, [visibleItems])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FilterChips
        availableTypen={availableTypen}
        filter={filter}
        onChange={onFilterChange}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        padding: 8,
        flex: 1,
        overflow: 'hidden',
      }}>
        {COLUMNS.map(col => (
          <div
            key={col.id}
            data-testid={`kanban-column-${col.id}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: '#181825',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {/* Column header */}
            <div style={{
              padding: '8px 10px',
              fontSize: 12,
              fontWeight: 700,
              color: '#a6adc8',
              borderBottom: '1px solid #313244',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{col.label}</span>
              <span style={{
                fontSize: 10,
                background: '#313244',
                color: '#6c7086',
                borderRadius: 10,
                padding: '1px 6px',
              }}>
                {byColumn[col.id]?.length ?? 0}
              </span>
            </div>

            {/* Cards — scrollable within column */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
              {byColumn[col.id]?.map(item => (
                <KanbanCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
