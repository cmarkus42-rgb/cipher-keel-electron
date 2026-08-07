/**
 * ProjectView — Project window with horizontal split: Timeline (top) + Kanban (bottom).
 *
 * CK-UI-003: Horizontal split, default 35/65, resizable handle.
 * CK-UI-004–008: Timeline integration.
 * CK-UI-012: Phase-tile click filters Kanban via phaseNameToNumber.
 * CK-UI-025: Resize handle position persisted in localStorage.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Timeline } from './Timeline'
import { KanbanBoard } from './KanbanBoard'
import { useTimeline } from '../hooks/useTimeline'
import { useKanban } from '../hooks/useKanban'
import {
  clampTimelinePct,
  phaseNameToNumber,
  MIN_TIMELINE_PCT,
  MAX_TIMELINE_PCT,
  DEFAULT_TIMELINE_PCT,
} from '../timeline-utils'
import type { ArtifactData } from '../timeline-utils'
import { errorMessage } from '../../shared/service-status'

const PCT_KEY = 'ck-timeline-pct'

// Inlined to avoid circular imports in renderer (matches the pattern already
// used in useKanban.ts and index.tsx for main→renderer channel constants).
const SERVICES_STATUS_CHANGED = 'services:status-changed'

/**
 * Builds the muted degradation banner text for a pane, or null when there is
 * nothing to show. Pure so it's testable without React (F-1 — the project
 * window previously rendered no indication at all when the graph was down).
 */
export function degradationBanner(label: string, error: unknown): string | null {
  if (!error) return null
  return `${label}: ${errorMessage(error)}`
}

interface ProjectViewProps {
  projectPath?: string
  onArtifactOpen?: (artifact: ArtifactData) => void
}

export function ProjectView({ projectPath, onArtifactOpen }: ProjectViewProps) {
  const [timelinePct, setTimelinePct] = useState(() => {
    // CK-UI-025: restore persisted split position
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(PCT_KEY) : null
      if (saved !== null) {
        const num = parseFloat(saved)
        if (!isNaN(num)) return clampTimelinePct(num)
      }
    } catch { /* ignore — localStorage unavailable in some contexts */ }
    return DEFAULT_TIMELINE_PCT
  })
  const [collapsed, setCollapsed] = useState(false)
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const { phases, artifacts, gates, loading, error: timelineError, refresh: refreshTimeline } = useTimeline(projectPath)
  const { items, filter, setFilter, error: kanbanError, reload: reloadKanban } = useKanban()

  // CK-UI-012: phase tile click → derive kanban phase filter
  useEffect(() => {
    if (!selectedPhase) {
      setFilter({})
    } else {
      const phaseNum = phaseNameToNumber(selectedPhase)
      setFilter(phaseNum !== null ? { phases: [phaseNum] } : {})
    }
  }, [selectedPhase, setFilter])

  // F-1/F-3: once a subsystem's status actually changes (graph recovering, or
  // degrading later), re-fetch both panes so a shown-degraded project window
  // updates rather than staying stale until the user does something else.
  useEffect(() => {
    const api = (window as any).cipherKeel
    if (!api) return
    const unsub = api.on(SERVICES_STATUS_CHANGED, () => {
      reloadKanban()
      refreshTimeline()
    })
    return unsub
  }, [reloadKanban, refreshTimeline])

  // -------------------------------------------------------------------------
  // Resize handle logic (CK-UI-003: drag to adjust split)
  // -------------------------------------------------------------------------
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientY - rect.top) / rect.height) * 100
      const clamped = clampTimelinePct(pct)
      setTimelinePct(clamped)
      setCollapsed(false)
      // CK-UI-025: persist on drag
      try { localStorage.setItem(PCT_KEY, String(clamped)) } catch { /* ignore */ }
    }

    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [])

  const effectivePct = collapsed ? 4 : timelinePct

  // F-1: the graph degrading must not leave the user staring at an empty pane
  // with no explanation — the exact symptom this branch set out to remove.
  const timelineBanner = degradationBanner('Zeitstrahl nicht verfügbar', timelineError)
  const kanbanBanner = degradationBanner('Kanban nicht verfügbar', kanbanError)

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#0a0a0a',
        overflow: 'hidden',
      }}
    >
      {/* Timeline area */}
      <div style={{
        height: `${effectivePct}%`,
        flexShrink: 0,
        overflow: 'hidden',
        transition: collapsed ? 'height 0.15s' : 'none',
      }}>
        {collapsed ? (
          /* Collapsed strip */
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111',
            color: '#555',
            fontSize: '11px',
            cursor: 'pointer',
          }} onClick={toggleCollapse}>
            ▼ Zeitstrahl
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {timelineBanner && (
              <div style={bannerStyle} title={timelineBanner}>⚠ {timelineBanner}</div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {loading ? (
                <div style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#555',
                  fontSize: '11px',
                }}>
                  Lade Phasen…
                </div>
              ) : (
                <Timeline
                  phases={phases}
                  artifacts={artifacts}
                  gates={gates}
                  selectedPhase={selectedPhase}
                  onPhaseClick={setSelectedPhase}
                  onArtifactClick={onArtifactOpen}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resize handle (CK-UI-003) */}
      <div
        onMouseDown={handleMouseDown}
        onClick={!dragging.current ? toggleCollapse : undefined}
        style={{
          height: '6px',
          flexShrink: 0,
          background: '#1a1a1a',
          borderTop: '1px solid #2a2a2a',
          borderBottom: '1px solid #2a2a2a',
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          width: '24px',
          height: '2px',
          background: '#333',
          borderRadius: '1px',
        }} />
      </div>

      {/* Kanban area — CK-UI-009, CK-UI-012 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {kanbanBanner && (
          <div style={bannerStyle} title={kanbanBanner}>⚠ {kanbanBanner}</div>
        )}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <KanbanBoard
            items={items}
            filter={filter}
            onFilterChange={setFilter}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bannerStyle = {
  flexShrink: 0,
  padding: '4px 10px',
  fontSize: '11px',
  color: '#eab308',
  background: '#1a1608',
  borderBottom: '1px solid #332b08',
} as const
