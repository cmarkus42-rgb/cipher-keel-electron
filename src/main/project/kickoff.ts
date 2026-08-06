/**
 * kickoff.ts — electron-free core of the project kickoff path.
 *
 * Extracted from ipc-handlers so the whole path (project record → git init → phase
 * chain → optional GitHub) can be tested against a real graph DB without a window.
 *
 * CK-UI-020, CK-PROC-001
 */

import { join } from 'node:path'
import type { GraphWriter } from '../graph/writer'
import { subsystemError, type SubsystemError } from '../../shared/service-status'

/** The eight phases of the Phasenkette (M4). */
export const PHASE_DEFS = [
  { name: 'ideation', position: 1 },
  { name: 'requirements', position: 2 },
  { name: 'architecture', position: 3 },
  { name: 'development', position: 4 },
  { name: 'testing', position: 5 },
  { name: 'fixing', position: 6 },
  { name: 'audit', position: 7 },
  { name: 'release-management', position: 8 },
] as const

/**
 * Writes the eight phase nodes and links them with naechste_phase edges.
 * Idempotent — upsertNode keys on path, so a second run updates instead of duplicating.
 */
export function initProjectPhases(
  writer: GraphWriter,
  projectDir: string,
): { ok: true; phaseUids: string[] } {
  const phaseUids: string[] = []
  for (const p of PHASE_DEFS) {
    const { uid } = writer.upsertNode({
      kind: 'phase',
      title: p.name,
      path: join(projectDir, '.cipher-keel', 'phases', p.name),
      frontmatter: { name: p.name, position: p.position, phase_status: 'ausstehend' },
    })
    phaseUids.push(uid)
  }
  for (let i = 0; i < phaseUids.length - 1; i++) {
    writer.linkEdge({
      src: phaseUids[i],
      dst: phaseUids[i + 1],
      type: 'naechste_phase',
      source: 'inferred',
    })
  }
  return { ok: true, phaseUids }
}

export interface ProjectRecord {
  id: string
  name: string
  rootPath: string
  createdAt: string
  workspaceIds: string[]
}

export interface KickoffDeps {
  /** null when the graph subsystem is unavailable. */
  writer: GraphWriter | null
  createProject: (name: string, rootPath: string) => ProjectRecord
  gitInit: (rootPath: string) => Promise<void>
  createRepo: (
    name: string, desc: string, visibility: 'public' | 'private', projectDir: string,
  ) => Promise<unknown>
  linkRepo: (ownerRepo: string, projectDir: string) => Promise<unknown>
}

export interface KickoffPayload {
  name: string
  rootPath: string
  initGit?: boolean
  github?: {
    action: 'create' | 'link' | 'skip'
    name?: string
    desc?: string
    visibility?: 'public' | 'private'
    ownerRepo?: string
  }
}

export interface KickoffResult {
  ok: boolean
  project: ProjectRecord | null
  phaseUids: string[]
  githubResult: unknown
  error: SubsystemError | { code: 'KICKOFF_FAILED'; subsystem: null; message: string } | null
}

/**
 * Runs the full kickoff. Never reports ok when the phase chain could not be written —
 * a project without its Phasenkette is not a completed kickoff.
 */
export async function runKickoff(
  deps: KickoffDeps,
  payload: KickoffPayload,
): Promise<KickoffResult> {
  let project: ProjectRecord | null = null
  try {
    project = deps.createProject(payload.name, payload.rootPath)

    if (payload.initGit) {
      try {
        await deps.gitInit(payload.rootPath)
      } catch (err) {
        console.warn('[kickoff] git init failed:', err)
      }
    }

    if (!deps.writer) {
      return {
        ok: false,
        project,
        phaseUids: [],
        githubResult: null,
        error: subsystemError('graph', 'Phasenkette not written — graph subsystem unavailable'),
      }
    }

    const { phaseUids } = initProjectPhases(deps.writer, payload.rootPath)

    let githubResult: unknown = null
    const gh = payload.github
    if (gh && gh.action !== 'skip') {
      if (gh.action === 'create') {
        githubResult = await deps.createRepo(
          gh.name ?? payload.name,
          gh.desc ?? '',
          gh.visibility ?? 'private',
          payload.rootPath,
        )
      } else if (gh.action === 'link' && gh.ownerRepo) {
        githubResult = await deps.linkRepo(gh.ownerRepo, payload.rootPath)
      }
    }

    return { ok: true, project, phaseUids, githubResult, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      project,
      phaseUids: [],
      githubResult: null,
      error: { code: 'KICKOFF_FAILED', subsystem: null, message },
    }
  }
}

/**
 * Activates the freshly created project so the very next session:create finds it.
 * A failure here must never break an otherwise successful kickoff — the project
 * exists either way and the user can still select it from the list.
 */
export function activateAfterKickoff(
  switchProject: (projectId: string) => void,
  result: KickoffResult,
): boolean {
  if (!result.ok || !result.project) return false
  try {
    switchProject(result.project.id)
    return true
  } catch (err) {
    console.warn('[kickoff] activating the new project failed:', err)
    return false
  }
}
