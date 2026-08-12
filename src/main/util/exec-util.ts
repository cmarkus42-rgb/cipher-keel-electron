import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import { statSync } from 'node:fs'
import { join } from 'node:path'

export const execFileAsync = promisify(execFile)

/**
 * Extended PATH for Electron — GUI apps on macOS don't inherit
 * the full shell PATH, so common CLI locations must be added.
 */
const EXTRA_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  `${os.homedir()}/.npm-global/bin`,
  `${os.homedir()}/.local/bin`,
  `${os.homedir()}/.claude/local`,
]

export function getEnhancedPath(): string {
  const existing = process.env.PATH ?? ''
  const extras = EXTRA_PATHS.filter((p) => !existing.includes(p))
  return extras.length ? `${existing}:${extras.join(':')}` : existing
}

/**
 * True if cmd exists as an executable file in one of the directories of the
 * enhanced PATH. Synchronous, no side effects — deliberately the same logic
 * that ClaudeCodeAdapter.isAvailable() used to keep to itself.
 *
 * Contract: cmd must be a bare command name (e.g. "tmux"), not an absolute or
 * relative path. join(dir, cmd) does not special-case an already-absolute cmd —
 * join('/opt/homebrew/bin', '/usr/local/bin/foo') yields
 * '/opt/homebrew/bin/usr/local/bin/foo', which will never resolve. No caller
 * today passes anything else; add explicit path handling before any caller does.
 */
export function isCommandOnPath(cmd: string): boolean {
  const dirs = getEnhancedPath().split(':').filter(Boolean)
  return dirs.some((dir) => {
    try {
      return statSync(join(dir, cmd)).isFile()
    } catch {
      return false
    }
  })
}

/**
 * Patch process.env.PATH so every child_process spawned anywhere in the
 * main process inherits the enhanced PATH. Call once at app startup.
 * Required because macOS GUI apps launched from Finder have a minimal PATH
 * (no /opt/homebrew/bin) and `spawn('tmux', ...)` would fail with ENOENT.
 */
export function patchEnvPath(): void {
  process.env.PATH = getEnhancedPath()
}

/**
 * Promise wrapper around execFile with timeout.
 * Uses execFile (NOT exec) to prevent shell injection — no shell is spawned,
 * arguments are passed directly to the binary.
 */
export function runCommand(
  cmd: string,
  args: string[] = [],
  opts: { timeout?: number; cwd?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: opts.timeout ?? 10_000,
      cwd: opts.cwd,
      env: { ...process.env, PATH: getEnhancedPath() },
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
