/**
 * capability-refs.ts — decide which capability references the assembled prompt may carry.
 *
 * Niveau A emits `@.claude/capabilities/<id>/SKILL.md` lines. A reference to a file
 * that does not exist is worse than no reference: the agent silently loses the
 * capability and nothing says so.
 *
 * `session:create` (ipc-handlers.ts) no longer calls `resolveCapabilityRefs` directly —
 * it uses `materialiseCapabilities`'s own `written` result instead, since a second
 * `existsSync` re-scan of paths that call just wrote is redundant, and the one case
 * where it would differ (a stale directory left by an older app version for an id no
 * longer shipped) is a bug, not a feature: it would reference stale content instead of
 * reporting nothing to reference. `capabilityRefPath` here is still the shared path
 * helper `materialiseCapabilities` writes through. `resolveCapabilityRefs` itself is
 * kept, with its test, as a standalone "what SKILL.md files actually exist under this
 * project" query — useful on its own, just not the right tool inside the launch path.
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
