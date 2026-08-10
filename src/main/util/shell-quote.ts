/**
 * shell-quote.ts — turn a {cmd, args} launch command into one shell line.
 *
 * Sessions are started by typing into a shell via `tmux send-keys`, so the
 * injection-safe argv form has to be flattened at the very last moment.
 * Single-quoting is the only form POSIX shells treat as fully literal.
 */

/** Arguments needing no quoting: the safe set only. */
const SAFE = /^[A-Za-z0-9._\-/=:@,+]+$/

function quote(arg: string): string {
  if (arg.includes('\n') || arg.includes('\r')) {
    // send-keys turns a newline into Enter — no quoting survives that.
    throw new Error('[shell-quote] argument contains a newline and cannot be sent via tmux')
  }
  if (arg === '') return "''"
  if (SAFE.test(arg)) return arg
  return `'${arg.split("'").join(`'\\''`)}'`
}

/** Format an executable and its arguments as a single shell command line. */
export function formatShellCommand(cmd: string, args: string[]): string {
  return [quote(cmd), ...args.map(quote)].join(' ')
}
