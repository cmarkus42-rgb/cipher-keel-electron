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

/** Inside double quotes a backslash protects only these — POSIX, and nothing invented. */
const GESCHUETZT_IN_DOPPELTEN = '"\\$`'

/**
 * Split a free-text command line into argv, the inverse of formatShellCommand.
 *
 * Users type start parameters into the settings window as one line. Splitting on
 * whitespace alone would break `--append-system-prompt-file "/pfad mit leerzeichen"`, so
 * both quoting forms are honoured — and they are honoured *differently*, the way a shell
 * does it:
 *
 *   - outside quotes, a backslash escapes whatever follows it
 *   - inside single quotes nothing is special, not even a backslash
 *   - inside double quotes a backslash protects " \ $ and ` and nothing else; before any
 *     other character it stays a literal backslash
 *
 * That asymmetry is not an oversight to be tidied away later. Treating both quote forms
 * alike would reject `--text "Use \"careful\" quoting"`, which is ordinary input.
 *
 * An unbalanced quote is an error rather than a best-effort guess: this argv becomes a
 * real launch command, and a silently mangled one is the expensive kind of failure.
 */
export function splitShellArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let hasCurrent = false
  // Named for what it holds, and not `quote` — that name belongs to the escaping
  // helper above, and shadowing it here would make a reader check whether one calls
  // the other. Neither does.
  let openQuote: "'" | '"' | null = null

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (openQuote) {
      if (
        openQuote === '"' &&
        ch === '\\' &&
        i + 1 < text.length &&
        GESCHUETZT_IN_DOPPELTEN.includes(text[i + 1])
      ) {
        current += text[i + 1]
        i++
        continue
      }
      if (ch === openQuote) {
        openQuote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === "'" || ch === '"') {
      openQuote = ch
      hasCurrent = true
      continue
    }

    if (ch === '\\' && i + 1 < text.length) {
      current += text[i + 1]
      hasCurrent = true
      i++
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (hasCurrent) {
        args.push(current)
        current = ''
        hasCurrent = false
      }
      continue
    }

    current += ch
    hasCurrent = true
  }

  if (openQuote) {
    throw new Error(
      `[shell-quote] Unbalanciertes Anfuehrungszeichen (${openQuote}) in den Startparametern — ` +
      'jedes geoeffnete Anfuehrungszeichen braucht ein schliessendes.'
    )
  }

  if (hasCurrent) args.push(current)
  return args
}
