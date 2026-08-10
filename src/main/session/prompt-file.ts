/**
 * prompt-file.ts — the assembled entity prompt as a file for the agent CLI.
 *
 * The file lives under app.getPath('userData'), never inside the user's project:
 * a project directory is usually versioned, and a per-session write there would
 * dirty `git status` on every launch. One path per session name so parallel
 * sessions cannot overwrite each other.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Directory holding one prompt file per live session. */
const PROMPT_DIR = 'entity-prompts'

/**
 * Absolute path of a session's prompt file.
 * @throws when sessionName contains path separators or traversal segments.
 */
export function entityPromptPath(userDataPath: string, sessionName: string): string {
  if (!sessionName || sessionName.includes('/') || sessionName.includes('\\') || sessionName.includes('..')) {
    throw new Error(`[prompt-file] unsafe session name: '${sessionName}'`)
  }
  return path.join(userDataPath, PROMPT_DIR, `${sessionName}.md`)
}

/**
 * Write the assembled prompt and return the path it was written to.
 * Mode 0600 — the prompt can carry project-specific instructions.
 */
export function writeEntityPromptFile(
  userDataPath: string,
  sessionName: string,
  content: string,
): string {
  const filePath = entityPromptPath(userDataPath, sessionName)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 })
  fs.chmodSync(filePath, 0o600)
  return filePath
}

/**
 * Remove a session's prompt file. A missing file is not an error.
 *
 * The path is resolved OUTSIDE the try on purpose: an unsafe session name is a
 * programming error and must propagate, while a filesystem hiccup during cleanup
 * is survivable. Resolving inside the try would turn the former into a logged
 * no-op that reports success without having checked or deleted anything.
 */
export function removeEntityPromptFile(userDataPath: string, sessionName: string): void {
  const filePath = entityPromptPath(userDataPath, sessionName)
  try {
    fs.rmSync(filePath, { force: true })
  } catch (err) {
    console.warn('[prompt-file] cleanup failed:', err)
  }
}
