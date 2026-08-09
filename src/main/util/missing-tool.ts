/**
 * missing-tool.ts — comprehensible messages for missing CLI tools.
 *
 * A packaged 0.1 lands on machines without a development toolchain. A raw
 * "spawn tmux ENOENT" tells nobody there what to do.
 */

const INSTALL_HINTS: Record<string, string> = {
  tmux: 'tmux not found. Install it with: brew install tmux',
  claude: 'Claude Code CLI not found. Install it from: https://claude.com/claude-code',
}

/** True if the error looks like the command does not exist at all. */
export function looksLikeMissingCommand(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    if ((err as { code?: unknown }).code === 'ENOENT') return true
  }
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('ENOENT') || message.includes('command not found')
}

/** Actionable message for a missing tool. */
export function describeMissingTool(cmd: string): string {
  return INSTALL_HINTS[cmd] ?? `${cmd} not found on PATH. Install it and make sure it is reachable.`
}

/**
 * Replaces a "command missing" error with the install instruction and
 * passes every other error through unchanged.
 */
export function describeToolFailure(cmd: string, err: unknown): string {
  if (looksLikeMissingCommand(err)) return describeMissingTool(cmd)
  return err instanceof Error ? err.message : String(err)
}
