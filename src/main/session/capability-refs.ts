/**
 * capability-refs.ts — decide which capability references the assembled prompt may carry.
 *
 * Niveau A emits `@.claude/capabilities/<id>/SKILL.md` lines. A reference to a file
 * that does not exist is worse than no reference: the agent silently loses the
 * capability and nothing says so. Only present files are referenced; missing ones
 * are returned so the caller can log them.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CapabilityRefResult {
  /** Capability ids whose SKILL.md exists under the project. Declared order kept. */
  present: string[]
  /** Capability ids with no SKILL.md — the caller must surface these. */
  missing: string[]
}

/** Relative path a capability's SKILL.md occupies inside a project. */
export function capabilityRefPath(id: string): string {
  return path.join('.claude', 'capabilities', id, 'SKILL.md')
}

export function resolveCapabilityRefs(
  capabilityIds: string[],
  projectPath: string,
): CapabilityRefResult {
  const present: string[] = []
  const missing: string[] = []

  for (const id of capabilityIds) {
    const full = path.join(projectPath, capabilityRefPath(id))
    if (fs.existsSync(full)) {
      present.push(id)
    } else {
      missing.push(id)
    }
  }

  return { present, missing }
}
