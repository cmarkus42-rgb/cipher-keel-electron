/**
 * session-context.ts — binds a tmux session to the active project.
 *
 * Sessions used to be created as `session-${Date.now()}` with no cwd and no project
 * reference, so they started in the Electron process working directory and were
 * invisible to the graph.
 *
 * CK-INF-020
 */

import { join } from 'node:path'
import type { GraphWriter } from '../graph/writer'
import type { ProjectRecord } from '../project/kickoff'

/** Prefix distinguishing cipher-keel sessions from other tmux sessions on the box. */
const SESSION_PREFIX = 'keel'

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/\s+/g, '-')       // whitespace runs become a single hyphen
    .replace(/[^a-z0-9-]/g, '') // strip everything tmux would choke on
    .replace(/-+/g, '-')        // collapse repeated hyphens
    .replace(/^-|-$/g, '')      // trim leading/trailing hyphen
  return slug.length > 0 ? slug : 'projekt'
}

/** Builds a tmux-safe session name from project, entity and a short random seed. */
export function deriveSessionName(projectName: string, entityId: string, seed: string): string {
  return `${SESSION_PREFIX}-${slugify(projectName)}-${slugify(entityId)}-${seed}`
}

export interface SessionContext {
  name: string
  cwd: string
  projectId: string
  projectName: string
  entityId: string
}

export function buildSessionContext(
  project: ProjectRecord,
  entityId: string,
  seed: string,
): SessionContext {
  return {
    name: deriveSessionName(project.name, entityId, seed),
    cwd: project.rootPath,
    projectId: project.id,
    projectName: project.name,
    entityId,
  }
}

/** Records the session as a graph node so it shows up in timeline and queries. */
export function writeSessionNode(
  writer: GraphWriter,
  ctx: SessionContext,
): { uid: string } {
  return writer.upsertNode({
    kind: 'session',
    title: ctx.name,
    path: join(ctx.cwd, '.cipher-keel', 'sessions', ctx.name),
    frontmatter: {
      project_id: ctx.projectId,
      entity: ctx.entityId,
      cwd: ctx.cwd,
    },
  })
}
