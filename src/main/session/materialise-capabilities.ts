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
 * Explains, in the target project's own git history, why files keep reappearing
 * under `.claude/capabilities/`. Written alongside the capability directories on
 * every call — never inside a SKILL.md, whose content must stay byte-identical
 * to CAPABILITY_SKILLS[id] for the `@`-reference mechanism to work.
 */
const CAPABILITIES_README = `# .claude/capabilities/ — von cipher keel generiert

Dieses Verzeichnis wird bei jedem Session-Start neu geschrieben. Manuelle Änderungen an den
SKILL.md-Dateien hier überleben den nächsten Start nicht.

Die Quelle der Wahrheit ist die App, nicht dieses Verzeichnis.
`

/**
 * Writes each known capability's SKILL.md into the project, creating directories
 * as needed and overwriting any stale copy from an earlier launch. An id absent
 * from CAPABILITY_SKILLS is reported as unknown rather than producing an empty file.
 * Also (re)writes a README.md explaining that the directory is app-managed, so a
 * file landing in someone's git repository does not look unexplained.
 */
export function materialiseCapabilities(
  capabilityIds: string[],
  projectPath: string,
): MaterialiseCapabilitiesResult {
  const written: string[] = []
  const unknown: string[] = []

  const baseDir = path.join(projectPath, '.claude', 'capabilities')
  fs.mkdirSync(baseDir, { recursive: true })
  fs.writeFileSync(path.join(baseDir, 'README.md'), CAPABILITIES_README, 'utf-8')

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
