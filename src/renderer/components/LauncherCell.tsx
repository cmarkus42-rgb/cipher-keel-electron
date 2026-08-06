/**
 * LauncherCell — empty grid slot with preset selection.
 *
 * Clicking "+" opens the preset picker; picking a preset starts the session with that
 * entity. Release 0.1 offers four roles (M6 3.1 / BG-1).
 *
 * Ported from cipher-mux 0.9.x (CK-INF-023).
 */

import { useState, useCallback } from 'react'
import { PRESET_CATALOG } from '../../shared/preset-catalog'

interface LauncherCellProps {
  slotIndex: number
  onStart: (slotIndex: number, entityId: string) => void
}

export function LauncherCell({ slotIndex, onStart }: LauncherCellProps) {
  const [picking, setPicking] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleOpen = useCallback(() => {
    if (starting) return
    setPicking(true)
  }, [starting])

  const handlePick = useCallback((entityId: string) => {
    setPicking(false)
    setStarting(true)
    onStart(slotIndex, entityId)
    setTimeout(() => setStarting(false), 5000)
  }, [slotIndex, onStart])

  if (picking) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center',
        height: '100%', padding: '12px', border: '1px solid #333', borderRadius: '4px',
        background: '#0a0a0a',
      }}>
        {PRESET_CATALOG.map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePick(preset.id)}
            title={preset.description}
            style={{
              padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
              background: '#141414', color: '#ddd',
              border: `1px solid ${preset.isDefault ? '#555' : '#2a2a2a'}`,
              borderRadius: '3px', fontSize: '13px',
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setPicking(false)}
          style={{
            padding: '4px', cursor: 'pointer', background: 'transparent',
            color: '#666', border: 'none', fontSize: '12px',
          }}
        >
          Abbrechen
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
      border: '1px solid #333', borderRadius: '4px', background: '#0a0a0a',
      cursor: starting ? 'wait' : 'pointer',
    }}
      onClick={handleOpen}
    >
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px', color: starting ? '#666' : '#888', transition: 'all 0.15s ease',
      }}>
        {starting ? '...' : '+'}
      </div>
    </div>
  )
}
