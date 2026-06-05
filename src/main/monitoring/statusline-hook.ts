/**
 * Inject a StatusLine hook into a project's .claude/settings.local.json.
 *
 * The hook writes Claude Code's status line JSON to
 * /tmp/cipher-keel/context/$CIPHER_KEEL_SESSION_ID.json on every update.
 * The env var CIPHER_KEEL_SESSION_ID must be set in the session's tmux
 * environment (done by SessionManager.start()).
 *
 * Ported from cipher-mux 0.9.x (CK-INF-007).
 */

import * as fs from 'fs'
import * as path from 'path'
import { STATUSLINE_DIR } from '../../shared/constants'

export function injectStatusLineHook(projectPath: string): void {
  const claudeDir = path.join(projectPath, '.claude')
  const settingsPath = path.join(claudeDir, 'settings.local.json')

  fs.mkdirSync(claudeDir, { recursive: true })

  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    // File doesn't exist or invalid JSON
  }

  // Skip if statusLine already configured
  if (settings.statusLine && typeof settings.statusLine === 'object' &&
      (settings.statusLine as Record<string, unknown>).command) {
    return
  }

  // Add statusLine — top-level setting, receives JSON on stdin
  settings.statusLine = {
    type: 'command',
    command: `cat > ${STATUSLINE_DIR}/$CIPHER_KEEL_SESSION_ID.json`,
    padding: 0,
  }

  // Remove legacy hooks.StatusLine if present
  if (settings.hooks && typeof settings.hooks === 'object') {
    const hooks = settings.hooks as Record<string, unknown>
    if (hooks.StatusLine) {
      delete hooks.StatusLine
      if (Object.keys(hooks).length === 0) {
        delete settings.hooks
      }
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}
