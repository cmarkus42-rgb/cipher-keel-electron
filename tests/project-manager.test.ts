/**
 * Tests for ProjectManager (CK-INF-020)
 */
import { describe, it, expect } from 'vitest'
import { ProjectManager } from '../src/main/project/project-manager'
import type { Project } from '../src/main/project/project-manager'

type StoredProjects = { list: Project[]; activeId: string | null }

function makeManager() {
  let stored: StoredProjects = { list: [], activeId: null }
  return new ProjectManager(
    (data) => { stored = data },
    () => stored,
  )
}

describe('ProjectManager', () => {
  it('createProject returns a project with all required fields', () => {
    const pm = makeManager()
    const proj = pm.createProject('MyProject', '/Users/cipher/projects/my-project')
    expect(proj.id).toBeTruthy()
    expect(proj.name).toBe('MyProject')
    expect(proj.rootPath).toBe('/Users/cipher/projects/my-project')
    expect(proj.createdAt).toBeTruthy()
    expect(proj.workspaceIds).toEqual([])
  })

  it('listProjects returns all created projects', () => {
    const pm = makeManager()
    pm.createProject('Alpha', '/path/alpha')
    pm.createProject('Beta', '/path/beta')
    const list = pm.listProjects()
    expect(list).toHaveLength(2)
    expect(list.map(p => p.name)).toContain('Alpha')
    expect(list.map(p => p.name)).toContain('Beta')
  })

  it('listProjects returns an empty array initially', () => {
    const pm = makeManager()
    expect(pm.listProjects()).toEqual([])
  })

  it('switchProject sets the current project', () => {
    const pm = makeManager()
    const proj = pm.createProject('Alpha', '/path/alpha')
    pm.switchProject(proj.id)
    expect(pm.getCurrentProject()?.id).toBe(proj.id)
  })

  it('switchProject throws for an unknown project id', () => {
    const pm = makeManager()
    expect(() => pm.switchProject('does-not-exist')).toThrow()
  })

  it('getCurrentProject returns null when no project is active', () => {
    const pm = makeManager()
    expect(pm.getCurrentProject()).toBeNull()
  })

  it('getCurrentProject returns null after creating projects but before switching', () => {
    const pm = makeManager()
    pm.createProject('A', '/a')
    expect(pm.getCurrentProject()).toBeNull()
  })

  it('persist callback is called after createProject', () => {
    let callCount = 0
    const pm = new ProjectManager(
      (_data) => { callCount++ },
      () => ({ list: [], activeId: null }),
    )
    pm.createProject('Test', '/test')
    expect(callCount).toBe(1)
  })

  it('persist callback is called after switchProject', () => {
    let callCount = 0
    const pm = new ProjectManager(
      (_data) => { callCount++ },
      () => ({ list: [], activeId: null }),
    )
    const proj = pm.createProject('Test', '/test')
    callCount = 0
    pm.switchProject(proj.id)
    expect(callCount).toBe(1)
  })

  it('workspaces are 1:n under a project — workspaceIds starts empty', () => {
    const pm = makeManager()
    const proj = pm.createProject('Multi', '/multi')
    expect(proj.workspaceIds).toEqual([])
  })

  it('load callback is used on construction — state is restored', () => {
    const existing: StoredProjects = {
      list: [{
        id: 'proj-existing',
        name: 'Existing',
        rootPath: '/existing',
        createdAt: '2026-01-01T00:00:00.000Z',
        workspaceIds: [],
      }],
      activeId: 'proj-existing',
    }
    const pm = new ProjectManager(
      (_data) => { /* no-op */ },
      () => existing,
    )
    expect(pm.listProjects()).toHaveLength(1)
    expect(pm.getCurrentProject()?.id).toBe('proj-existing')
  })
})
