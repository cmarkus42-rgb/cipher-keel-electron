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
import { ProjectView } from '../components/ProjectView'
import { KickoffWizard } from '../components/KickoffWizard'
import type { Project } from '../../shared/project-types'

const api = () => window.cipherKeel

function ProjectApp() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'wizard' | 'project'>('list')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

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
      setActiveProjectId(projectId)
      setView('project')
    } catch (err) {
      console.error('[project-window] project:switch failed:', err)
    }
  }, [])

  const handleCreateProject = useCallback(() => {
    setView('wizard')
  }, [])

  const handleWizardComplete = useCallback(async () => {
    await loadProjects()
    setView('list')
  }, [loadProjects])

  const handleWizardCancel = useCallback(async () => {
    // Befund 5: a project can exist in config from an earlier failed kickoff
    // attempt on this wizard visit — reload so it isn't invisible until restart.
    await loadProjects()
    setView('list')
  }, [loadProjects])

  // Befund 5: a degraded-graph kickoff still creates the project — refresh the
  // list in the background so it's there once the user does leave the wizard,
  // without switching away from the wizard (which would hide the error).
  const handleProjectCreated = useCallback(() => {
    void loadProjects()
  }, [loadProjects])

  const handleOpenGrid = useCallback(async () => {
    try {
      await api().invoke('window:open-grid', activeProjectId ?? undefined)
    } catch (err) {
      console.error('[project-window] window:open-grid failed:', err)
    }
  }, [activeProjectId])

  const handleOpenSettings = useCallback(async () => {
    try {
      await api().invoke('window:open-settings')
    } catch (err) {
      console.error('[project-window] window:open-settings failed:', err)
    }
  }, [])

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
        {(view === 'project' || view === 'wizard') && (
          <button
            style={styles.backBtn}
            onClick={view === 'wizard' ? handleWizardCancel : () => setView('list')}
          >
            ←
          </button>
        )}
        <span style={styles.logo}>cipher keel</span>
        <span style={styles.subtitle}>Projekte</span>
        <div style={styles.kopfKnoepfe}>
          {view === 'project' && (
            <button
              style={styles.gridBtn}
              onClick={handleOpenGrid}
              title="Grid-Fenster mit den Sessions dieses Projekts oeffnen"
            >
              Grid oeffnen
            </button>
          )}
          <button
            style={styles.settingsBtn}
            onClick={handleOpenSettings}
            title="Einstellungen oeffnen — Modelle, Zuordnungen, Startparameter"
          >
            Einstellungen
          </button>
        </div>
      </div>
      {view === 'project' ? (
        <ProjectView projectPath={projects.find(p => p.id === activeProjectId)?.rootPath} />
      ) : view === 'wizard' ? (
        <KickoffWizard
          onComplete={handleWizardComplete}
          onCancel={handleWizardCancel}
          onProjectCreated={handleProjectCreated}
        />
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
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 8px 0 0',
    lineHeight: 1,
  },
  gridBtn: {
    marginLeft: 0,
    padding: '4px 10px',
    background: '#1a1a1a',
    color: '#ddd',
    border: '1px solid #333',
    borderRadius: 3,
    cursor: 'pointer' as const,
    fontSize: 12,
  },
  kopfKnoepfe: {
    marginLeft: 'auto' as const,
    display: 'flex' as const,
    gap: 8,
  },
  settingsBtn: {
    // marginLeft only when the grid button is absent; it carries its own marginLeft:'auto'
    marginLeft: 8,
    padding: '4px 10px',
    background: '#1a1a1a',
    color: '#ddd',
    border: '1px solid #333',
    borderRadius: 3,
    cursor: 'pointer' as const,
    fontSize: 12,
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
