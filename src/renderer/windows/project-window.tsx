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

  const handleCreateProject = useCallback(async () => {
    // Minimal prompt-based create — full Kickoff-Wizard is CK-UI-020 (future)
    const name = prompt('Projektname:')
    if (!name?.trim()) return
    const rootPath = prompt('Root-Ordner (absoluter Pfad):')
    if (!rootPath?.trim()) return
    try {
      const result = (await api().invoke('project:create', name.trim(), rootPath.trim())) as {
        project: Project | null
        error: string | null
      }
      if (result.project) {
        await loadProjects()
      } else {
        console.error('[project-window] project:create error:', result.error)
      }
    } catch (err) {
      console.error('[project-window] project:create failed:', err)
    }
  }, [loadProjects])

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
      <ProjectList
        projects={projects}
        onProjectSelect={handleProjectSelect}
        onCreateProject={handleCreateProject}
      />
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
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ProjectApp />
    </StrictMode>
  )
}
