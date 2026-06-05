/**
 * tmux Control Mode (-C) event parser.
 *
 * Control mode emits structured text lines prefixed with `%`.
 * This module decodes octal-encoded data and parses each line
 * into a typed TmuxEvent discriminated union.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-002).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TmuxEvent =
  | { type: 'output'; paneId: string; data: string }
  | { type: 'begin'; time: number; number: number; flags: number }
  | { type: 'end'; time: number; number: number; flags: number }
  | { type: 'error'; time: number; number: number; flags: number }
  | { type: 'sessions-changed' }
  | { type: 'session-changed'; sessionId: string; name: string }
  | { type: 'window-add'; windowId: string }
  | { type: 'window-close'; windowId: string }
  | { type: 'window-renamed'; windowId: string; name: string }
  | { type: 'pane-mode-changed'; paneId: string }
  | { type: 'exit'; reason: string }
  | { type: 'layout-change'; windowId: string; layout: string }
  | { type: 'unknown'; line: string }

// ---------------------------------------------------------------------------
// Octal decoding
// ---------------------------------------------------------------------------

/**
 * Decode tmux octal-encoded sequences in a string.
 *
 * tmux encodes non-printable bytes as three-digit octal escapes
 * (e.g. `\015` for CR, `\012` for LF, `\033` for ESC).
 * Literal backslashes are encoded as `\\`.
 *
 * Multi-byte UTF-8 characters (e.g. `ä` = `\303\244`) are encoded as
 * separate octal escapes per byte. We collect all bytes into a Buffer
 * and decode as UTF-8 to reconstruct them correctly.
 */
export function decodeOctal(str: string): string {
  const bytes: number[] = []
  let i = 0
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      if (str[i + 1] === '\\') {
        // Escaped backslash → literal 0x5C
        bytes.push(0x5c)
        i += 2
      } else if (i + 3 < str.length && /^\d{3}$/.test(str.substring(i + 1, i + 4))) {
        // Octal escape \NNN → raw byte value
        bytes.push(parseInt(str.substring(i + 1, i + 4), 8))
        i += 4
      } else {
        bytes.push(str.charCodeAt(i))
        i++
      }
    } else {
      // Non-backslash character. ASCII (0–127) can be pushed as-is
      // because charCodeAt == byte value. For characters > 127 (raw
      // UTF-8 passed through by tmux 3.3+), we must encode them as
      // proper multi-byte UTF-8.
      const cp = str.codePointAt(i)!
      if (cp <= 0x7f) {
        bytes.push(cp)
        i++
      } else {
        const char = String.fromCodePoint(cp)
        const encoded = Buffer.from(char, 'utf-8')
        for (let j = 0; j < encoded.length; j++) bytes.push(encoded[j])
        i += char.length // 1 for BMP, 2 for surrogate pairs
      }
    }
  }
  return Buffer.from(bytes).toString('utf-8')
}

// ---------------------------------------------------------------------------
// Line parser
// ---------------------------------------------------------------------------

/**
 * Parse a single tmux control-mode line into a TmuxEvent.
 *
 * Lines that don't match any known pattern are returned as `{ type: 'unknown' }`.
 */
export function parseLine(line: string): TmuxEvent {
  // %output %<pane-id> <data>
  const outputMatch = line.match(/^%output (%\d+) (.*)$/)
  if (outputMatch) {
    return {
      type: 'output',
      paneId: outputMatch[1],
      data: decodeOctal(outputMatch[2]),
    }
  }

  // %begin <time> <number> <flags>
  const beginMatch = line.match(/^%begin (\d+) (\d+) (\d+)$/)
  if (beginMatch) {
    return {
      type: 'begin',
      time: parseInt(beginMatch[1], 10),
      number: parseInt(beginMatch[2], 10),
      flags: parseInt(beginMatch[3], 10),
    }
  }

  // %end <time> <number> <flags>
  const endMatch = line.match(/^%end (\d+) (\d+) (\d+)$/)
  if (endMatch) {
    return {
      type: 'end',
      time: parseInt(endMatch[1], 10),
      number: parseInt(endMatch[2], 10),
      flags: parseInt(endMatch[3], 10),
    }
  }

  // %error <time> <number> <flags>
  const errorMatch = line.match(/^%error (\d+) (\d+) (\d+)$/)
  if (errorMatch) {
    return {
      type: 'error',
      time: parseInt(errorMatch[1], 10),
      number: parseInt(errorMatch[2], 10),
      flags: parseInt(errorMatch[3], 10),
    }
  }

  // %sessions-changed
  if (line === '%sessions-changed') {
    return { type: 'sessions-changed' }
  }

  // %session-changed $<id> <name>
  const sessionChangedMatch = line.match(/^%session-changed \$(\d+) (.+)$/)
  if (sessionChangedMatch) {
    return {
      type: 'session-changed',
      sessionId: `$${sessionChangedMatch[1]}`,
      name: sessionChangedMatch[2],
    }
  }

  // %window-add @<id>
  const windowAddMatch = line.match(/^%window-add (@\d+)$/)
  if (windowAddMatch) {
    return { type: 'window-add', windowId: windowAddMatch[1] }
  }

  // %window-close @<id>
  const windowCloseMatch = line.match(/^%window-close (@\d+)$/)
  if (windowCloseMatch) {
    return { type: 'window-close', windowId: windowCloseMatch[1] }
  }

  // %window-renamed @<id> <name>
  const windowRenamedMatch = line.match(/^%window-renamed (@\d+) (.+)$/)
  if (windowRenamedMatch) {
    return {
      type: 'window-renamed',
      windowId: windowRenamedMatch[1],
      name: windowRenamedMatch[2],
    }
  }

  // %pane-mode-changed %<id>
  const paneModeMatch = line.match(/^%pane-mode-changed (%\d+)$/)
  if (paneModeMatch) {
    return { type: 'pane-mode-changed', paneId: paneModeMatch[1] }
  }

  // %exit [reason]
  const exitMatch = line.match(/^%exit(?: (.+))?$/)
  if (exitMatch) {
    return { type: 'exit', reason: exitMatch[1] ?? '' }
  }

  // %layout-change @<id> <layout>
  const layoutMatch = line.match(/^%layout-change (@\d+) (.+)$/)
  if (layoutMatch) {
    return {
      type: 'layout-change',
      windowId: layoutMatch[1],
      layout: layoutMatch[2],
    }
  }

  return { type: 'unknown', line }
}

// ---------------------------------------------------------------------------
// Streaming parser
// ---------------------------------------------------------------------------

export type TmuxEventHandler = (event: TmuxEvent) => void

/**
 * Streaming parser for tmux control-mode output.
 *
 * Buffers incoming data chunks, splits on newlines, and emits
 * parsed TmuxEvents via the registered handler. Partial lines
 * are held in the buffer until a newline arrives.
 */
export class TmuxParser {
  private buffer = ''
  private handler: TmuxEventHandler | null = null

  /** Register a handler that will be called for each parsed event. */
  onEvent(handler: TmuxEventHandler): void {
    this.handler = handler
  }

  /**
   * Feed a chunk of raw data from the tmux control-mode stream.
   *
   * Complete lines (terminated by `\n`) are parsed and emitted
   * immediately. Any trailing partial line is retained in the
   * internal buffer until the next `feed()` call completes it.
   */
  feed(chunk: string): void {
    this.buffer += chunk

    const lines = this.buffer.split('\n')
    // The last element is either '' (if chunk ended with \n) or a partial line
    this.buffer = lines.pop()!

    for (const line of lines) {
      if (line.length === 0) continue
      const event = parseLine(line)
      this.handler?.(event)
    }
  }

  /** Reset the internal buffer. */
  reset(): void {
    this.buffer = ''
  }
}
