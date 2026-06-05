/**
 * Sidebar.tsx — Session-Liste mit Status-Indikatoren und Notes-Tab.
 *
 * CK-INF-018: Liste aktiver Sessions, ein-/ausblendbar (Toggle),
 * Session-Auswahl fokussiert Pane.
 * CK-UI-029 (soll): Notes-Tab zeigt Uebergabedokumente mit Typ-Label,
 * Status-Badge und Phasen-Zuordnung.
 */

import { useState, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidebarSession {
  sessionId: string
  sessionName: string
  status: 'active' | 'closing' | 'stopped'
}

/** A note entry shown in the Notes-Tab of the Sidebar (CK-UI-029). */
export interface SidebarNote {
  id: string
  title: string
  /** e.g. 'uebergabedokument' | 'brain-note' | 'entscheidung' */
  noteType: string
  /** e.g. 'entwurf' | 'freigegeben' | 'abgeloest' */
  status: string
  /** Phase name this document belongs to (optional) */
  phaseZuordnung?: string
}

type SidebarTab = 'sessions' | 'notes'

interface SidebarProps {
  sessions: SidebarSession[]
  activeSessionId?: string
  onSessionSelect?: (sessionId: string) => void
  notes?: SidebarNote[]
  initialVisible?: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers (CK-UI-029, exported for testing)
// ---------------------------------------------------------------------------

/**
 * Filters a list of SidebarNotes to only those with noteType 'uebergabedokument'.
 */
export function filterUebergabedokumente(notes: SidebarNote[]): SidebarNote[] {
  return notes.filter(n => n.noteType === 'uebergabedokument')
}

// ---------------------------------------------------------------------------
// Status indicator colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<SidebarSession['status'], string> = {
  active:  '#98c379',
  closing: '#e5c07b',
  stopped: '#e06c75',
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Status badge colors for notes (CK-UI-029)
// ---------------------------------------------------------------------------

const NOTE_STATUS_COLORS: Record<string, string> = {
  entwurf:     '#e5c07b',
  freigegeben: '#98c379',
  abgeloest:   '#555',
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  notes = [],
  initialVisible = true,
}: SidebarProps) {
  const [visible, setVisible] = useState(initialVisible)
  const [activeTab, setActiveTab] = useState<SidebarTab>('sessions')

  const toggle = useCallback(() => setVisible(v => !v), [])

  const handleSelect = useCallback((sessionId: string) => {
    onSessionSelect?.(sessionId)
  }, [onSessionSelect])

  const uebergabedokumente = filterUebergabedokumente(notes)
  const otherNotes = notes.filter(n => n.noteType !== 'uebergabedokument')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 8px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        fontSize: '11px',
        color: '#888',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('sessions')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'sessions' ? '#e0e0e0' : '#555',
              cursor: 'pointer',
              padding: '2px 0',
              fontSize: '11px',
              borderBottom: activeTab === 'sessions' ? '1px solid #61afef' : '1px solid transparent',
            }}
          >
            Sessions
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'notes' ? '#e0e0e0' : '#555',
              cursor: 'pointer',
              padding: '2px 0',
              fontSize: '11px',
              borderBottom: activeTab === 'notes' ? '1px solid #61afef' : '1px solid transparent',
            }}
          >
            Notes
          </button>
        </div>
        <button
          onClick={toggle}
          title={visible ? 'Sidebar ausblenden' : 'Sidebar einblenden'}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '12px',
          }}
        >
          {visible ? '◀' : '▶'}
        </button>
      </div>

      {visible && activeTab === 'sessions' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>
              Keine aktiven Sessions
            </div>
          ) : (
            sessions.map(session => (
              <div
                key={session.sessionId}
                onClick={() => handleSelect(session.sessionId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  background: session.sessionId === activeSessionId ? '#2a2a2a' : 'transparent',
                  borderLeft: session.sessionId === activeSessionId
                    ? '2px solid #61afef'
                    : '2px solid transparent',
                  fontSize: '12px',
                  color: '#ccc',
                }}
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: STATUS_COLORS[session.status],
                  flexShrink: 0,
                }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.sessionName}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* CK-UI-029: Notes tab with Uebergabedokument category */}
      {visible && activeTab === 'notes' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
          {/* Uebergabedokument category */}
          {uebergabedokumente.length > 0 && (
            <div>
              <div style={{
                padding: '4px 8px 2px',
                fontSize: '10px',
                color: '#555',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Übergabedokumente
              </div>
              {uebergabedokumente.map(note => (
                <div
                  key={note.id}
                  data-testid={`sidebar-note-${note.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '5px 8px',
                    borderLeft: '2px solid #313244',
                    fontSize: '12px',
                    color: '#ccc',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title}
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {/* Typ-Label */}
                    <span style={{
                      fontSize: '9px',
                      background: '#1e1e2e',
                      color: '#888',
                      borderRadius: 3,
                      padding: '1px 4px',
                    }}>
                      Übergabe
                    </span>
                    {/* Status-Badge */}
                    <span style={{
                      fontSize: '9px',
                      color: NOTE_STATUS_COLORS[note.status] ?? '#555',
                    }}>
                      {note.status}
                    </span>
                    {/* Phase-Zuordnung */}
                    {note.phaseZuordnung && (
                      <span style={{ fontSize: '9px', color: '#555' }}>
                        {note.phaseZuordnung}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Other notes */}
          {otherNotes.length > 0 && (
            <div>
              {uebergabedokumente.length > 0 && (
                <div style={{
                  padding: '6px 8px 2px',
                  fontSize: '10px',
                  color: '#555',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Notizen
                </div>
              )}
              {otherNotes.map(note => (
                <div
                  key={note.id}
                  data-testid={`sidebar-note-${note.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '5px 8px',
                    borderLeft: '2px solid transparent',
                    fontSize: '12px',
                    color: '#ccc',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title}
                  </span>
                  <span style={{ fontSize: '9px', color: '#555' }}>
                    {note.noteType}
                    {note.phaseZuordnung ? ` · ${note.phaseZuordnung}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {notes.length === 0 && (
            <div style={{ padding: '8px', color: '#555', fontSize: '11px' }}>
              Keine Notizen
            </div>
          )}
        </div>
      )}
    </div>
  )
}
