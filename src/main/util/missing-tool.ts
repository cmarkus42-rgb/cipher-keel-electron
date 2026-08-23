/**
 * missing-tool.ts — comprehensible messages for missing CLI tools.
 *
 * A packaged 0.1 lands on machines without a development toolchain. A raw
 * "spawn tmux ENOENT" tells nobody there what to do.
 */

// German: these reach a user (status panel, session:create error). See describeMissingTool.
const INSTALL_HINTS: Record<string, string> = {
  tmux: 'tmux nicht gefunden. Installation mit: brew install tmux',
  claude: 'Claude Code CLI nicht gefunden. Installation unter: https://claude.com/claude-code',
}

/**
 * True if the error looks like the command does not exist at all.
 *
 * Deliberately narrow: only the ENOENT error code, or the exact "spawn <cmd>
 * ENOENT" message shape Node's child_process produces when spawn() can't find
 * the binary (covers the rare case a wrapped/reconstructed error lost its
 * .code). A bare "command not found" substring is NOT matched — tmux-manager.ts
 * wraps tmux's own stderr as "tmux control mode failed: <stderr>", and that
 * stderr is arbitrary text (a broken .tmux.conf, a bad $SHELL) that can contain
 * that exact phrase without tmux itself being missing. Misreporting that as
 * "tmux not found" would send a user to reinstall something they already have
 * while hiding the real cause.
 */
export function looksLikeMissingCommand(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    if ((err as { code?: unknown }).code === 'ENOENT') return true
  }
  const message = err instanceof Error ? err.message : String(err)
  return /^spawn \S+ ENOENT$/.test(message)
}

/** Actionable message for a missing tool. German — reaches a user, see INSTALL_HINTS. */
export function describeMissingTool(cmd: string): string {
  return INSTALL_HINTS[cmd] ?? `${cmd} nicht auf dem PATH gefunden. Installieren und erreichbar machen.`
}

/**
 * Replaces a "command missing" error with the install instruction and
 * passes every other error through unchanged.
 *
 * Only the missing-tool branch is guaranteed German. The passthrough branch hands back
 * whatever the underlying tool or Node wrote to its error message — arbitrary text (tmux
 * stderr, a Node system error) this function has no way to translate without inventing
 * words the failure never said. Known, pre-existing gap in the "user text is German" rule;
 * not something this fix closes.
 */
export function describeToolFailure(cmd: string, err: unknown): string {
  if (looksLikeMissingCommand(err)) return describeMissingTool(cmd)
  return err instanceof Error ? err.message : String(err)
}
