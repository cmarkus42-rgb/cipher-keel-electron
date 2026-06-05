/**
 * LauncherCell — empty grid slot with session start trigger.
 *
 * Shows a "+" button that starts the session creation flow.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-023).
 */

import { useState, useCallback } from 'react'

interface LauncherCellProps {
  slotIndex: number
  onStart: (slotIndex: number) => void
}

export function LauncherCell({ slotIndex, onStart }: LauncherCellProps) {
  const [starting, setStarting] = useState(false)

  const handleClick = useCallback(() => {
    if (starting) return
    setStarting(true)
    onStart(slotIndex)
    // Reset after a timeout in case session creation takes long
    setTimeout(() => setStarting(false), 5000)
  }, [slotIndex, onStart, starting])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      border: '1px solid #333',
      borderRadius: '4px',
      background: '#0a0a0a',
      cursor: starting ? 'wait' : 'pointer',
    }}
      onClick={handleClick}
    >
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: '2px solid #444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: starting ? '#666' : '#888',
        transition: 'all 0.15s ease',
      }}>
        {starting ? '...' : '+'}
      </div>
    </div>
  )
}
