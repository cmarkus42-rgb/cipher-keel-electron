/**
 * materialiseCapabilities — write capability SKILL.md content into a project.
 *
 * The SKILL.md files (Task 10-13) are inlined into the bundle via `?raw`
 * (CAPABILITY_SKILLS, capability-assets.ts) so the packaged app carries them
 * without a source tree. They are inert until something writes them into the
 * target project, because `resolveCapabilityRefs` (Task 7) only references
 * files that already exist under `<projectPath>/.claude/capabilities/<id>/SKILL.md`.
 *
 * This is the same path `ClaudeCodeAdapter.postLaunchInjection` already uses for
 * `.claude/settings.local.json` — the project's `.claude/` directory is written
 * by the app as a matter of course, not something new introduced here.
 *
 * Called from `session:create` before `resolveCapabilityRefs` (ipc-handlers.ts).
 */

import fs from 'node:fs'
import path from 'node:path'
import { CAPABILITY_SKILLS } from '../preset/capability-assets'
import { capabilityRefPath } from './capability-refs'

export interface MaterialiseCapabilitiesResult {
  /** Capability ids whose SKILL.md was written (or overwritten). */
  written: string[]
  /** Capability ids with no matching entry in CAPABILITY_SKILLS — nothing was written for these. */
  unknown: string[]
}

/**
 * Writes each known capability's SKILL.md into the project, creating directories
 * as needed and overwriting any stale copy from an earlier launch. An id absent
 * from CAPABILITY_SKILLS is reported as unknown rather than producing an empty file.
 */
export function materialiseCapabilities(
  capabilityIds: string[],
  projectPath: string,
): MaterialiseCapabilitiesResult {
  const written: string[] = []
  const unknown: string[] = []

  for (const id of capabilityIds) {
    const content = CAPABILITY_SKILLS[id]
    if (content === undefined) {
      unknown.push(id)
      continue
    }

    const full = path.join(projectPath, capabilityRefPath(id))
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
    written.push(id)
  }

  return { written, unknown }
}
