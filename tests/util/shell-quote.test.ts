// tests/util/shell-quote.test.ts
import { describe, it, expect } from 'vitest'
import { formatShellCommand } from '../../src/main/util/shell-quote'

describe('formatShellCommand', () => {
  it('leaves a plain command untouched', () => {
    expect(formatShellCommand('claude', [])).toBe('claude')
  })

  it('joins simple arguments with spaces', () => {
    expect(formatShellCommand('claude', ['--resume'])).toBe('claude --resume')
  })

  it('quotes a path containing spaces', () => {
    expect(formatShellCommand('claude', ['--append-system-prompt-file', '/a b/c.md']))
      .toBe("claude --append-system-prompt-file '/a b/c.md'")
  })

  it('neutralises a command substitution attempt', () => {
    const out = formatShellCommand('claude', ['--model', '$(rm -rf /)'])
    expect(out).toBe("claude --model '$(rm -rf /)'")
  })

  it('escapes an embedded single quote', () => {
    const out = formatShellCommand('claude', ["it's"])
    expect(out).toBe("claude 'it'\\''s'")
  })

  it('neutralises a semicolon chain', () => {
    const out = formatShellCommand('claude', ['a; rm -rf /'])
    expect(out).toBe("claude 'a; rm -rf /'")
  })

  it('rejects a newline outright rather than quoting it', () => {
    // tmux send-keys treats a newline as Enter — quoting cannot save this.
    expect(() => formatShellCommand('claude', ['a\nb'])).toThrow()
  })
})
