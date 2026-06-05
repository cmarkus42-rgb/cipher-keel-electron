/**
 * project-window.tsx — React root for the Project Window (CK-UI-001, CK-UI-024).
 *
 * Primary entry point of cipher keel. Opens on app start.
 * Grid/Mux window opens only on explicit user action via window:open-grid IPC.
 *
 * No direct Node.js APIs — renderer runs with:
 *   contextIsolation: true, nodeIntegration: false, sandbox: true
 */
import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { ProjectList } from '../components/ProjectList'
import type { Project } from '../../shared/project-types'

const api = () => (window as any).cipherKeel

function ProjectApp() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      const list = (await api().invoke('project:list')) as Project[]
      setProjects(list ?? [])
    } catch (err) {
      console.error('[project-window] project:list failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const handleProjectSelect = useCallback(async (projectId: string) => {
    try {
      await api().invoke('project:switch', projectId)
      await api().invoke('window:open-grid', projectId)
    } catch (err) {
      console.error('[project-window] open-grid failed:', err)
    }
  }, [])

  const handleCreateProject = useCallback(() => {
    setCreating(true)
    setNewName('')
    setNewPath('')
    setError(null)
  }, [])

  const handleSubmitCreate = useCallback(async () => {
    if (!newName.trim() || !newPath.trim()) {
      setError('Name und Pfad sind Pflicht.')
      return
    }
    try {
      const result = (await api().invoke('project:create', newName.trim(), newPath.trim())) as {
        project: Project | null
        error: string | null
      }
      if (result.project) {
        setCreating(false)
        await loadProjects()
      } else {
        setError(result.error ?? 'Unbekannter Fehler')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [newName, newPath, loadProjects])

  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={{ color: '#555' }}>Lade Projekte…</span>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.logo}>cipher keel</span>
        <span style={styles.subtitle}>Projekte</span>
      </div>
      {creating ? (
        <div style={styles.createForm}>
          <input
            style={styles.input}
            type="text"
            placeholder="Projektname"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <input
            style={styles.input}
            type="text"
            placeholder="Root-Ordner (absoluter Pfad)"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitCreate()}
          />
          {error && <span style={styles.error}>{error}</span>}
          <div style={styles.formButtons}>
            <button style={styles.cancelBtn} onClick={() => setCreating(false)}>Abbrechen</button>
            <button style={styles.submitBtn} onClick={handleSubmitCreate}>Anlegen</button>
          </div>
        </div>
      ) : (
        <ProjectList
          projects={projects}
          onProjectSelect={handleProjectSelect}
          onCreateProject={handleCreateProject}
        />
      )}
    </div>
  )
}

const styles = {
  root: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    background: '#0d0d0d',
  },
  header: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: 12,
    padding: '16px 16px 12px',
    borderBottom: '1px solid #1e1e1e',
  },
  logo: {
    color: '#e0e0e0',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 16,
    fontWeight: 600,
  },
  subtitle: {
    color: '#555',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },
  loading: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: '100%',
    background: '#0d0d0d',
    fontFamily: "'JetBrains Mono', monospace",
  },
  createForm: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 10,
    padding: '24px 16px',
  },
  input: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    padding: '8px 10px',
    outline: 'none',
  },
  error: {
    color: '#e05050',
    fontSize: 12,
  },
  formButtons: {
    display: 'flex' as const,
    gap: 8,
    justifyContent: 'flex-end' as const,
    marginTop: 4,
  },
  cancelBtn: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#888',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
  },
  submitBtn: {
    background: '#1e3a1e',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    color: '#90d090',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
  },
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ProjectApp />
    </StrictMode>
  )
}
