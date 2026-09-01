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
  return pfadZumBefehl(cmd) !== null
}

/**
 * Der volle Pfad zu cmd auf dem erweiterten PATH, oder null.
 *
 * Dieselbe Logik wie `isCommandOnPath` — und deshalb steht sie hier einmal und nicht zweimal:
 * `isCommandOnPath` ist seit Paket D die Ja/Nein-Sicht auf genau diese Funktion. Wer den Pfad
 * braucht statt der Antwort, ruft diese; wer nur wissen will, ob es das Werkzeug gibt, jene.
 *
 * Derselbe Vertrag: cmd ist ein blosser Befehlsname, kein Pfad — siehe `isCommandOnPath`.
 */
export function pfadZumBefehl(cmd: string): string | null {
  const dirs = getEnhancedPath().split(':').filter(Boolean)
  for (const dir of dirs) {
    const kandidat = join(dir, cmd)
    try {
      if (statSync(kandidat).isFile()) return kandidat
    } catch {
      // Verzeichnis gibt es nicht, oder cmd liegt nicht darin — der Normalfall beim Suchen.
    }
  }
  return null
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
