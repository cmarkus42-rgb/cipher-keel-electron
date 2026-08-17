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

import { splitShellArgs } from '../../src/main/util/shell-quote'

describe('splitShellArgs', () => {
  it('gibt eine leere Liste fuer leeren Text und fuer reinen Leerraum', () => {
    expect(splitShellArgs('')).toEqual([])
    expect(splitShellArgs('   \t ')).toEqual([])
  })

  it('trennt an Leerraum', () => {
    expect(splitShellArgs('--resume --model opus')).toEqual(['--resume', '--model', 'opus'])
  })

  it('haelt einfache Anfuehrungszeichen zusammen und entfernt sie', () => {
    expect(splitShellArgs("--datei '/pfad mit leerzeichen/x.md'"))
      .toEqual(['--datei', '/pfad mit leerzeichen/x.md'])
  })

  it('haelt doppelte Anfuehrungszeichen zusammen und entfernt sie', () => {
    expect(splitShellArgs('--datei "/pfad mit leerzeichen/x.md"'))
      .toEqual(['--datei', '/pfad mit leerzeichen/x.md'])
  })

  it('maskiert ein Leerzeichen per Rueckstrich ausserhalb von Anfuehrungszeichen', () => {
    expect(splitShellArgs('--datei /pfad\\ mit/x.md')).toEqual(['--datei', '/pfad mit/x.md'])
  })

  it('behandelt ein Anfuehrungszeichen innerhalb der anderen Sorte als Zeichen', () => {
    expect(splitShellArgs(`--text "Kenos' Rezept"`)).toEqual(['--text', "Kenos' Rezept"])
  })

  it('erlaubt ein leeres Argument als ausdrueckliches Paar Anfuehrungszeichen', () => {
    expect(splitShellArgs(`--leer ""`)).toEqual(['--leer', ''])
  })

  it('wirft mit deutscher Meldung bei unbalanciertem Anfuehrungszeichen', () => {
    expect(() => splitShellArgs('--datei "/pfad ohne Ende'))
      .toThrow(/Anfuehrungszeichen/)
  })

  it('ist die Umkehrung von formatShellCommand fuer sichere und unsichere Argumente', () => {
    const args = ['--dangerously-skip-permissions', '/pfad mit leerzeichen/x.md', "Kenos' Rezept"]
    const zeile = formatShellCommand('claude', args)
    expect(splitShellArgs(zeile)).toEqual(['claude', ...args])
  })
})
