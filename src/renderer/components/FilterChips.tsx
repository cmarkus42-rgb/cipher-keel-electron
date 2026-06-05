/**
 * FilterChips — filter bar for the Kanban board.
 *
 * Chips for Phase (1-8), Typ, Schenkel, Prioritaet.
 * Combinable: all active chips narrow results via AND-between-dimensions logic.
 * CK-UI-010.
 */

import type { KanbanFilter, KanbanPrioritaet } from '../../shared/kanban-types'

interface FilterChipsProps {
  /** Available typ values derived from current items. */
  availableTypen: string[]
  filter: KanbanFilter
  onChange: (filter: KanbanFilter) => void
}

const PHASES = [1, 2, 3, 4, 5, 6, 7, 8]
const SCHENKEL_OPTIONS: (1 | 2)[] = [1, 2]
const PRIORITAET_OPTIONS: KanbanPrioritaet[] = ['hoch', 'mittel', 'niedrig']

function Chip({
  label, active, onClick
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        padding: '3px 8px',
        borderRadius: 12,
        border: active ? '1px solid #89b4fa' : '1px solid #313244',
        background: active ? '#1e3a5f' : '#181825',
        color: active ? '#89b4fa' : '#6c7086',
        cursor: 'pointer',
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )
}

function toggle<T>(arr: T[] | undefined, value: T): T[] {
  const current = arr ?? []
  return current.includes(value)
    ? current.filter(v => v !== value)
    : [...current, value]
}

export function FilterChips({ availableTypen, filter, onChange }: FilterChipsProps) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      padding: '6px 8px',
      borderBottom: '1px solid #313244',
      alignItems: 'center',
    }}>
      {/* Phase chips */}
      <span style={{ fontSize: 10, color: '#585b70', fontWeight: 600, marginRight: 2 }}>Phase</span>
      {PHASES.map(p => (
        <Chip
          key={`phase-${p}`}
          label={`${p}`}
          active={(filter.phases ?? []).includes(p)}
          onClick={() => onChange({ ...filter, phases: toggle(filter.phases, p) })}
        />
      ))}

      <span style={{ width: 1, height: 16, background: '#313244', margin: '0 4px' }} />

      {/* Schenkel chips */}
      <span style={{ fontSize: 10, color: '#585b70', fontWeight: 600, marginRight: 2 }}>Schenkel</span>
      {SCHENKEL_OPTIONS.map(s => (
        <Chip
          key={`schenkel-${s}`}
          label={`S${s}`}
          active={(filter.schenkel ?? []).includes(s)}
          onClick={() => onChange({ ...filter, schenkel: toggle(filter.schenkel, s) })}
        />
      ))}

      <span style={{ width: 1, height: 16, background: '#313244', margin: '0 4px' }} />

      {/* Prioritaet chips */}
      <span style={{ fontSize: 10, color: '#585b70', fontWeight: 600, marginRight: 2 }}>Prioritaet</span>
      {PRIORITAET_OPTIONS.map(p => (
        <Chip
          key={`prio-${p}`}
          label={p}
          active={(filter.prioritaeten ?? []).includes(p)}
          onClick={() => onChange({ ...filter, prioritaeten: toggle(filter.prioritaeten, p) })}
        />
      ))}

      {/* Typ chips (dynamic from data) */}
      {availableTypen.length > 0 && (
        <>
          <span style={{ width: 1, height: 16, background: '#313244', margin: '0 4px' }} />
          <span style={{ fontSize: 10, color: '#585b70', fontWeight: 600, marginRight: 2 }}>Typ</span>
          {availableTypen.map(t => (
            <Chip
              key={`typ-${t}`}
              label={t}
              active={(filter.typen ?? []).includes(t)}
              onClick={() => onChange({ ...filter, typen: toggle(filter.typen, t) })}
            />
          ))}
        </>
      )}

      {/* Clear all */}
      {(
        (filter.phases?.length ?? 0) +
        (filter.typen?.length ?? 0) +
        (filter.schenkel?.length ?? 0) +
        (filter.prioritaeten?.length ?? 0)
      ) > 0 && (
        <button
          onClick={() => onChange({})}
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 12,
            border: '1px solid #f38ba8',
            background: 'transparent',
            color: '#f38ba8',
            cursor: 'pointer',
            marginLeft: 4,
          }}
        >
          Alles zuruecksetzen
        </button>
      )}
    </div>
  )
}
