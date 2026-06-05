/**
 * NotesCell — Grid pane for notes editing with CodeMirror 6.
 *
 * CK-NOTES-003: NotesCell with CodeMirror 6 Markdown editor.
 * New component for cipher-keel (no direct 0.9.x port — simplified).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import type { NoteInfo, NoteContent } from '../../shared/types'
import { useNotes } from '../hooks/useNotes'

interface NotesCellProps {
  noteId?: string
  onNoteSelect?: (id: string) => void
}

export function NotesCell({ noteId, onNoteSelect }: NotesCellProps) {
  const { notes, loading, createNote, readNote, saveNote, trashNote, searchNotes } = useNotes()
  const [activeNoteId, setActiveNoteId] = useState<string | null>(noteId ?? null)
  const [activeNote, setActiveNote] = useState<NoteContent | null>(null)
  const [dirty, setDirty] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NoteInfo[] | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load note content when activeNoteId changes
  useEffect(() => {
    if (!activeNoteId) {
      setActiveNote(null)
      return
    }
    readNote(activeNoteId).then(content => {
      setActiveNote(content)
      setDirty(false)
    })
  }, [activeNoteId, readNote])

  // Initialize/update CodeMirror editor
  useEffect(() => {
    if (!editorRef.current || !activeNote) return

    // Destroy previous editor
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const state = EditorState.create({
      doc: activeNote.body,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            setDirty(true)
            // Auto-save after 2s of inactivity
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            saveTimerRef.current = setTimeout(() => {
              const text = update.state.doc.toString()
              if (activeNoteId) {
                saveNote(activeNoteId, text).catch(err =>
                  console.error('[NotesCell] auto-save failed:', err)
                )
                setDirty(false)
              }
            }, 2000)
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })
    viewRef.current = view

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      view.destroy()
    }
  }, [activeNote, activeNoteId, saveNote])

  const handleCreate = useCallback(async () => {
    const info = await createNote('', '# New Note\n\n')
    setActiveNoteId(info.id)
    onNoteSelect?.(info.id)
  }, [createNote, onNoteSelect])

  const handleSelect = useCallback((id: string) => {
    setActiveNoteId(id)
    setSearchResults(null)
    setSearchQuery('')
    onNoteSelect?.(id)
  }, [onNoteSelect])

  const handleTrash = useCallback(async (id: string) => {
    await trashNote(id)
    if (activeNoteId === id) {
      setActiveNoteId(null)
      setActiveNote(null)
    }
  }, [trashNote, activeNoteId])

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults(null)
      return
    }
    const results = await searchNotes(q)
    setSearchResults(results)
  }, [searchNotes])

  const displayNotes = searchResults ?? notes

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      border: '1px solid #333',
      borderRadius: '4px',
      overflow: 'hidden',
      background: '#0d0d0d',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        fontSize: '12px',
        color: '#ccc',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600 }}>Notes</span>
        {dirty && <span style={{ color: '#e5c07b', fontSize: '10px' }}>*</span>}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleCreate}
          style={{
            background: 'none',
            border: '1px solid #555',
            color: '#ccc',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: '11px',
            borderRadius: '3px',
          }}
        >
          + New
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar — note list */}
        <div style={{
          width: '200px',
          borderRight: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '4px' }}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #444',
                color: '#ccc',
                padding: '3px 6px',
                fontSize: '11px',
                borderRadius: '3px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Note list */}
          <div style={{ flex: 1, overflowY: 'auto', fontSize: '11px' }}>
            {loading ? (
              <div style={{ padding: '8px', color: '#666' }}>Loading...</div>
            ) : displayNotes.length === 0 ? (
              <div style={{ padding: '8px', color: '#666' }}>
                {searchQuery ? 'No results' : 'No notes yet'}
              </div>
            ) : (
              displayNotes.map(note => (
                <div
                  key={note.id}
                  onClick={() => handleSelect(note.id)}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    background: note.id === activeNoteId ? '#282c34' : 'transparent',
                    borderLeft: note.id === activeNoteId ? '2px solid #61afef' : '2px solid transparent',
                    color: '#ccc',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontWeight: note.id === activeNoteId ? 600 : 400 }}>
                    {note.title}
                  </div>
                  {note.preview && (
                    <div style={{ color: '#666', fontSize: '10px', marginTop: '2px' }}>
                      {note.preview}
                    </div>
                  )}
                  {note.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {note.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          style={{
                            background: '#333',
                            color: '#888',
                            padding: '0 4px',
                            borderRadius: '2px',
                            fontSize: '9px',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {activeNote ? (
            <>
              {/* Note header with tags */}
              <div style={{
                padding: '4px 8px',
                borderBottom: '1px solid #333',
                fontSize: '11px',
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
              }}>
                <span style={{ color: '#ccc', fontWeight: 500 }}>{activeNote.info.title}</span>
                <div style={{ flex: 1 }} />
                {activeNote.info.noteType && (
                  <span style={{
                    background: '#333',
                    color: '#61afef',
                    padding: '0 4px',
                    borderRadius: '2px',
                    fontSize: '10px',
                  }}>
                    {activeNote.info.noteType}
                  </span>
                )}
                <button
                  onClick={() => activeNoteId && handleTrash(activeNoteId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: '11px',
                  }}
                  title="Move to trash"
                >
                  Trash
                </button>
              </div>
              {/* CodeMirror mount point */}
              <div ref={editorRef} style={{ flex: 1, minHeight: 0 }} />
            </>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#666',
              fontSize: '13px',
            }}>
              Select a note or create a new one
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
