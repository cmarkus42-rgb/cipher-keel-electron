/**
 * ProjectManager — projekt-zentrierte Organisation (CK-INF-020).
 *
 * Ein Projekt legt Root-Ordner und Knowledge-Datenbank an.
 * Workspaces sind 1:n unter einem Projekt organisiert.
 * WorkspacesWindow entfaellt als separates BrowserWindow.
 *
 * Persistence ist injiziert (Testbarkeit ohne Electron):
 *   Production: persist/load -> configStore.set/get('projects')
 *   Tests:      in-memory store
 *
 * CK-INF-020
 */

import type { ProjectRecord } from '../config/config-store'

export type Project = ProjectRecord

interface StoredProjects {
  list: Project[]
  activeId: string | null
}

export class ProjectManager {
  private list: Project[]
  private activeId: string | null

  constructor(
    private readonly persist: (data: StoredProjects) => void,
    private readonly load: () => StoredProjects,
  ) {
    const saved = load()
    this.list = saved.list
    this.activeId = saved.activeId
  }

  createProject(name: string, rootPath: string): Project {
    const project: Project = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      rootPath,
      createdAt: new Date().toISOString(),
      workspaceIds: [],
    }
    this.list = [...this.list, project]
    this.persist({ list: this.list, activeId: this.activeId })
    return project
  }

  listProjects(): Project[] {
    return [...this.list]
  }

  switchProject(projectId: string): void {
    const exists = this.list.some(p => p.id === projectId)
    if (!exists) throw new Error(`Project not found: ${projectId}`)
    this.activeId = projectId
    this.persist({ list: this.list, activeId: this.activeId })
  }

  getCurrentProject(): Project | null {
    if (!this.activeId) return null
    return this.list.find(p => p.id === this.activeId) ?? null
  }
}
