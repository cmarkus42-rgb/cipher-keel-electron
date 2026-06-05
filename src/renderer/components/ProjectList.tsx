/**
 * ProjectList — Recent-Projects list with search and create-button.
 *
 * CK-UI-024: Projekt-Liste mit Recent-Projects beim Start
 * CK-UI-001: Projekt-Fenster als primaerer Einstieg
 *
 * Pure exports for testing (no React dependency):
 *   filterProjects(projects, query) — filters by name substring (case-insensitive)
 *   ANLEGEN_LABEL — button label constant
 */
import { useState } from 'react'
import type { Project } from '../../shared/project-types'

// Exported for testing
export const ANLEGEN_LABEL = 'Neues Projekt anlegen'

export function filterProjects(projects: Project[], query: string): Project[] {
  if (!query.trim()) return projects
  const lower = query.toLowerCase()
  return projects.filter((p) => p.name.toLowerCase().includes(lower))
}

interface ProjectListProps {
  projects: Project[]
  onProjectSelect: (id: string) => void
  onCreateProject: () => void
}

export function ProjectList({ projects, onProjectSelect, onCreateProject }: ProjectListProps) {
  const [query, setQuery] = useState('')
  const visible = filterProjects(projects, query)

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <input
          style={styles.search}
          type="text"
          placeholder="Projekt suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button style={styles.createBtn} onClick={onCreateProject}>
          {ANLEGEN_LABEL}
        </button>
      </div>

      <div style={styles.list}>
        {visible.length === 0 && (
          <div style={styles.empty}>
            {query ? 'Keine Projekte gefunden.' : 'Noch keine Projekte — jetzt anlegen.'}
          </div>
        )}
        {visible.map((proj) => (
          <div
            key={proj.id}
            style={styles.row}
            onClick={() => onProjectSelect(proj.id)}
            onKeyDown={(e) => e.key === 'Enter' && onProjectSelect(proj.id)}
            tabIndex={0}
            role="button"
          >
            <span style={styles.projName}>{proj.name}</span>
            <span style={styles.projPath}>{proj.rootPath}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    background: '#0d0d0d',
    color: '#e0e0e0',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 13,
  },
  toolbar: {
    display: 'flex' as const,
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid #1e1e1e',
  },
  search: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontFamily: 'inherit',
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
  },
  createBtn: {
    background: '#1e3a1e',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    color: '#90d090',
    fontFamily: 'inherit',
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 0',
  },
  row: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '10px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #111',
    gap: 2,
  },
  projName: {
    color: '#e0e0e0',
    fontSize: 14,
  },
  projPath: {
    color: '#555',
    fontSize: 11,
  },
  empty: {
    padding: '24px 16px',
    color: '#555',
    textAlign: 'center' as const,
  },
} as const
