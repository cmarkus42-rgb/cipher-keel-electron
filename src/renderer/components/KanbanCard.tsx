/**
 * KanbanCard — individual Kanban item card.
 *
 * Displays: name, Phase-Badge (Phase 1-8), Schenkel-Badge (S1/S2), Typ-Tag.
 * CK-UI-009.
 */

import type { KanbanItem } from '../../shared/kanban-types'

interface KanbanCardProps {
  item: KanbanItem
}

const PHASE_LABELS: Record<number, string> = {
  1: 'Ideation',
  2: 'Requirements',
  3: 'Architektur',
  4: 'Development',
  5: 'Testing',
  6: 'Fixing',
  7: 'Audit',
  8: 'Release'
}

const PRIORITAET_COLORS: Record<string, string> = {
  hoch:     '#ef4444',
  mittel:   '#f59e0b',
  niedrig:  '#6b7280'
}

export function KanbanCard({ item }: KanbanCardProps) {
  return (
    <div style={{
      background: '#1e1e2e',
      border: '1px solid #313244',
      borderRadius: 6,
      padding: '8px 10px',
      marginBottom: 6,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      cursor: 'default',
    }}>
      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4', lineHeight: 1.4 }}>
        {item.title}
      </div>

      {/* Badges row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {/* Phase badge */}
        <span
          data-testid="phase-badge"
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
            background: '#313244',
            color: '#89b4fa',
            letterSpacing: '0.03em',
          }}
        >
          P{item.phase} {PHASE_LABELS[item.phase] ?? ''}
        </span>

        {/* Schenkel badge */}
        <span
          data-testid="schenkel-badge"
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
            background: item.schenkel === 1 ? '#1e3a5f' : '#1a3a2e',
            color: item.schenkel === 1 ? '#89b4fa' : '#a6e3a1',
          }}
        >
          S{item.schenkel}
        </span>

        {/* Typ tag */}
        <span
          data-testid="typ-tag"
          style={{
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            background: '#181825',
            color: '#a6adc8',
            border: '1px solid #313244',
          }}
        >
          {item.typ}
        </span>

        {/* Prioritaet dot */}
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: PRIORITAET_COLORS[item.prioritaet] ?? '#6b7280',
          marginLeft: 2,
        }} title={item.prioritaet} />
      </div>
    </div>
  )
}
