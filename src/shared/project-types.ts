/**
 * project-types.ts — Shared Project type for Main and Renderer.
 *
 * Plain data interface — no Electron or SQLite dependency.
 * ProjectManager lives in src/main/project/project-manager.ts.
 *
 * CK-INF-020
 */

export interface Project {
  id: string
  name: string
  rootPath: string
  createdAt: string
  workspaceIds: string[]
}
