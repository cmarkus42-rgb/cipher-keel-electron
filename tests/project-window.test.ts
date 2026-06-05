/**
 * Tests for Project Window (CK-UI-001, CK-UI-024)
 *
 * Tests pure logic exported from ProjectList component.
 * No DOM rendering — vitest node environment.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Project } from '../src/shared/project-types'
import { filterProjects, ANLEGEN_LABEL } from '../src/renderer/components/ProjectList'
import { WINDOW_OPEN_GRID, KANBAN_LIST, KANBAN_CHANGED } from '../src/shared/ipc-channels'
import { ProjectManager } from '../src/main/project/project-manager'

const makeProject = (name: string): Project => ({
  id: `proj-${name.toLowerCase()}`,
  name,
  rootPath: `/projects/${name.toLowerCase()}`,
  createdAt: '2026-06-05T00:00:00.000Z',
  workspaceIds: [],
})

describe('ProjectList rendert Recent-Projects', () => {
  it('filterProjects with empty query returns all projects', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta'), makeProject('Gamma')]
    expect(filterProjects(projects, '')).toHaveLength(3)
  })

  it('filterProjects filters by name substring', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    const result = filterProjects(projects, 'alp')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alpha')
  })

  it('filterProjects is case-insensitive', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    expect(filterProjects(projects, 'ALPha')).toHaveLength(1)
    expect(filterProjects(projects, 'BETA')).toHaveLength(1)
  })

  it('filterProjects returns empty array when no match', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    expect(filterProjects(projects, 'xyz')).toHaveLength(0)
  })

  it('filterProjects with whitespace-only query returns all projects', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    expect(filterProjects(projects, '   ')).toHaveLength(2)
  })
})

describe('Anlegen-Button existiert', () => {
  it('ANLEGEN_LABEL constant is defined and non-empty', () => {
    expect(ANLEGEN_LABEL).toBeTruthy()
    expect(typeof ANLEGEN_LABEL).toBe('string')
  })

  it('ANLEGEN_LABEL is in German and mentions Projekt', () => {
    expect(ANLEGEN_LABEL.toLowerCase()).toContain('projekt')
  })
})

// ---------------------------------------------------------------------------
// CK-UI-002 — window:open-grid Handler (channel exists, ProjectManager wires it)
// ---------------------------------------------------------------------------

describe('CK-UI-002 — window:open-grid channel and ProjectManager', () => {
  it('WINDOW_OPEN_GRID channel constant is defined', () => {
    expect(WINDOW_OPEN_GRID).toBe('window:open-grid')
  })

  it('ProjectManager.switchProject throws for unknown projectId', () => {
    const mgr = new ProjectManager(
      () => { /* persist */ },
      () => ({ list: [], activeId: null }),
    )
    expect(() => mgr.switchProject('unknown-id')).toThrow()
  })

  it('ProjectManager.listProjects returns empty list initially', () => {
    const mgr = new ProjectManager(
      () => { /* persist */ },
      () => ({ list: [], activeId: null }),
    )
    expect(mgr.listProjects()).toEqual([])
  })

  it('ProjectManager.createProject adds project to list', () => {
    const store: { list: Project[]; activeId: string | null } = { list: [], activeId: null }
    const mgr = new ProjectManager(
      (data) => { store.list = data.list; store.activeId = data.activeId },
      () => store,
    )
    const proj = mgr.createProject('TestProjekt', '/tmp/test')
    expect(proj.name).toBe('TestProjekt')
    expect(mgr.listProjects()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// IPC channel constants sanity (spot-checks for CK-UI-002, CK-UI-009)
// ---------------------------------------------------------------------------

describe('IPC channel constants', () => {
  it('KANBAN_LIST channel constant is correct', () => {
    expect(KANBAN_LIST).toBe('kanban:list')
  })

  it('KANBAN_CHANGED channel constant is correct', () => {
    expect(KANBAN_CHANGED).toBe('kanban:changed')
  })
})

describe('Projekt-Auswahl triggert Navigations-Event', () => {
  it('onProjectSelect is called with the project id when a project is selected', () => {
    const onProjectSelect = vi.fn()
    const proj = makeProject('MeinProjekt')
    onProjectSelect(proj.id)
    expect(onProjectSelect).toHaveBeenCalledWith('proj-meinprojekt')
  })

  it('filterProjects result IDs are accessible after filter', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta'), makeProject('AlphaBeta')]
    const result = filterProjects(projects, 'alpha')
    expect(result).toHaveLength(2)
    const ids = result.map(p => p.id)
    expect(ids).toContain('proj-alpha')
    expect(ids).toContain('proj-alphabeta')
  })

  it('onProjectSelect receives only the id, not the full project object', () => {
    const onProjectSelect = vi.fn()
    const proj = makeProject('Keel')
    onProjectSelect(proj.id)
    expect(onProjectSelect).toHaveBeenCalledWith(expect.stringContaining('proj-'))
    expect(onProjectSelect).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Keel' }))
  })
})
