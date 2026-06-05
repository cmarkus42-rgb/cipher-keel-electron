/**
 * useNotes — React hook for notes API.
 *
 * Ported from cipher-mux 0.9.x (preact/hooks → react).
 * CK-NOTES-001, CK-NOTES-002.
 */

import { useState, useEffect, useCallback } from 'react'
import type { NoteInfo, NoteContent, TagRepository, TagIndexData } from '../../shared/types'

const api = () => (window as any).cipherKeel

export function useNotes() {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [tagRepo, setTagRepo] = useState<TagRepository>({ tags: {} })
  const [tagIndex, setTagIndex] = useState<TagIndexData>({ tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [list, tags, idx] = await Promise.all([
        api().notes.list(),
        api().notes.tags(),
        api().notes.tagIndex().catch(() => ({ tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' } as TagIndexData)),
      ])
      setNotes(list)
      setTagRepo(tags)
      setTagIndex(idx)
    } catch (err) {
      console.error('[useNotes] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsub = api().notes.onChanged(() => refresh())
    return () => unsub()
  }, [refresh])

  const createNote = useCallback(async (title: string, body: string, tags?: string[]) => {
    return api().notes.create(title, body, tags) as Promise<NoteInfo>
  }, [])

  const readNote = useCallback(async (id: string) => {
    return api().notes.read(id) as Promise<NoteContent | null>
  }, [])

  const saveNote = useCallback(async (id: string, body: string, tags?: string[]) => {
    return api().notes.save(id, body, tags) as Promise<NoteInfo>
  }, [])

  const deleteNote = useCallback(async (id: string) => {
    return api().notes.delete(id) as Promise<{ ok: boolean }>
  }, [])

  const trashNote = useCallback(async (id: string) => {
    return api().notes.trash(id) as Promise<{ ok: boolean }>
  }, [])

  const trashMany = useCallback(async (ids: string[]) => {
    return api().notes.trashMany(ids) as Promise<{ trashed: string[] }>
  }, [])

  const restoreMany = useCallback(async (ids: string[]) => {
    return api().notes.restoreMany(ids) as Promise<{ restored: string[] }>
  }, [])

  const searchNotes = useCallback(async (query: string, tags?: string[]): Promise<NoteInfo[]> => {
    if (!query.trim()) return []
    const results = await api().notes.search(query, tags)
    return (results as Array<{ info: NoteInfo; body: string }>).map(r => r.info)
  }, [])

  const autoTag = useCallback(async (content: string): Promise<string[] | null> => {
    return api().notes.autoTag(content)
  }, [])

  return {
    notes,
    tagRepo,
    tagIndex,
    loading,
    refresh,
    createNote,
    readNote,
    saveNote,
    deleteNote,
    trashNote,
    trashMany,
    restoreMany,
    searchNotes,
    autoTag,
  }
}
