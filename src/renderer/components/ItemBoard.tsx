/**
 * ItemBoard.tsx — Item-level drill-down board with phase columns.
 *
 * CK-UI-011 (soll): Doppelklick auf Kanban-Karte oeffnet dieses Board mit
 * Phasen-Spalten fuer das Item. Zurueck-Button schliesst das Item-Board.
 *
 * Exported pure function:
 *   getItemBoardPhases(itemPhase) — testable in Node environment.
 */

import { PHASE_NAMES, PHASE_DISPLAY_NAMES } from '../timeline-utils'
import type { PhaseName } from '../timeline-utils'
import type { KanbanItem } from '../../shared/kanban-types'

// ---------------------------------------------------------------------------
// Pure logic (exported for testing)
// ---------------------------------------------------------------------------

export interface ItemBoardPhase {
  name: PhaseName
  displayName: string
  /** True when this is the item's current phase */
  active: boolean
}

/**
 * Returns all 8 phases as ItemBoardPhase entries.
 * The phase at position `itemPhase` (1-based) is marked active.
 *
 * CK-UI-011: "Spalten entsprechen den Phasen des Items."
 */
export function getItemBoardPhases(itemPhase: number): ItemBoardPhase[] {
  return PHASE_NAMES.map((name, idx) => ({
    name,
    displayName: PHASE_DISPLAY_NAMES[name],
    active: idx + 1 === itemPhase,
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ItemBoardProps {
  item: KanbanItem
  onBack: () => void
}

export function ItemBoard({ item, onBack }: ItemBoardProps) {
  const phases = getItemBoardPhases(item.phase)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0a0a0a',
      overflow: 'hidden',
    }}>
      {/* Header with back button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid #222',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          data-testid="item-board-back"
          style={{
            background: 'none',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#888',
            cursor: 'pointer',
            fontSize: 12,
            padding: '3px 10px',
          }}
        >
          ← Zurück
        </button>
        <span style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>
          {item.title}
        </span>
        <span style={{ color: '#555', fontSize: 11 }}>
          Phase {item.phase} · {item.typ}
        </span>
      </div>

      {/* Phase columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${phases.length}, 1fr)`,
        gap: 6,
        padding: 8,
        flex: 1,
        overflow: 'auto',
      }}>
        {phases.map(phase => (
          <div
            key={phase.name}
            data-testid={`item-board-phase-${phase.name}`}
            style={{
              background: phase.active ? '#1e3a2f' : '#111',
              border: phase.active ? '1px solid #98c379' : '1px solid #222',
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: 11,
              color: phase.active ? '#98c379' : '#555',
              textAlign: 'center',
              minHeight: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {phase.displayName}
          </div>
        ))}
      </div>
    </div>
  )
}
