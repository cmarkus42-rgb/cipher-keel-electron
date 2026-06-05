/**
 * VoiceInputRouter — routes transcribed text to sessions.
 *
 * Routing priority:
 *   1. Pinned session: text goes there regardless of focus.
 *   2. Focused session: text goes to the focused grid session.
 *   3. Off: transcriptions are silently discarded.
 *
 * Voice commands (CK-VOICE-004):
 *   "abschicken" / "absenden" / "senden" / "enter" → sends Enter
 *   "löschen" / "leeren" / "clear" → clears input (Ctrl+U)
 *   "neue zeile" / "new line" → sends newline
 *   "hoch" / "runter" → scroll, "grid links/rechts" → grid nav
 *
 * Ported from cipher-mux 0.9.x.
 */

import { EventEmitter } from 'node:events'

export interface VoiceInputRouterDeps {
  sendKeys: (sessionId: string, data: string) => Promise<void>
}

const VOICE_COMMANDS: Array<{ patterns: string[]; keys: string; label: string }> = [
  { patterns: ['abschicken', 'absenden', 'senden', 'bitte abschicken', 'bitte absenden', 'enter', 'send', 'submit'], keys: '\r', label: 'submit' },
  { patterns: ['neue zeile', 'new line', 'newline', 'zeilenumbruch'], keys: '\n', label: 'newline' },
  { patterns: ['löschen', 'loeschen', 'leeren', 'alles weg', 'clear', 'eingabe löschen', 'eingabe loeschen'], keys: '\x15', label: 'clear-input' },
]

const SPEECH_INTERRUPT_PATTERNS: string[] = [
  'okay danke', 'ok danke', 'stopp', 'stop', 'reicht', 'genug', 'danke reicht',
  'halt', 'aufhören', 'aufhoeren', 'still',
]

const SCROLL_COMMANDS: Array<{
  patterns: string[]
  action: 'up' | 'down' | 'top' | 'bottom'
  label: string
}> = [
  { patterns: ['hoch', 'scroll hoch', 'rauf'],       action: 'up',     label: 'scroll-up' },
  { patterns: ['runter', 'scroll runter', 'weiter'],  action: 'down',   label: 'scroll-down' },
  { patterns: ['ganz hoch', 'anfang'],                action: 'top',    label: 'scroll-top' },
  { patterns: ['ganz runter', 'ende'],                action: 'bottom', label: 'scroll-bottom' },
]

const GRID_PREFIXES = ['grid', 'grit', 'gritt', 'grüt', 'great', 'gret', 'zelle', 'focus', 'tritt']
const DIRECTION_MAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  hoch: 'up', oben: 'up', rauf: 'up',
  runter: 'down', unten: 'down',
  links: 'left',
  rechts: 'right',
}

const GRID_NAV_COMMANDS: Array<{
  patterns: string[]
  direction: 'up' | 'down' | 'left' | 'right'
  label: string
}> = [
  { patterns: ['grid hoch', 'grit hoch', 'gritt hoch', 'zelle hoch', 'focus hoch'],       direction: 'up',    label: 'grid-up' },
  { patterns: ['grid runter', 'grit runter', 'gritt runter', 'zelle runter', 'focus runter'], direction: 'down',  label: 'grid-down' },
  { patterns: ['grid links', 'grit links', 'gritt links', 'zelle links', 'focus links'],   direction: 'left',  label: 'grid-left' },
  { patterns: ['grid rechts', 'grit rechts', 'gritt rechts', 'zelle rechts', 'focus rechts'], direction: 'right', label: 'grid-right' },
]

function stripPunctuation(text: string): string {
  return text.replace(/[.,!?;:…–—'"„"‚'»«()[\]{}]/g, '').trim()
}

function matchGridNav(normalized: string): { direction: 'up' | 'down' | 'left' | 'right'; label: string } | null {
  const words = normalized.split(/\s+/)
  if (words.length === 2) {
    const [prefix, dir] = words
    if (!GRID_PREFIXES.includes(prefix)) return null
    const direction = DIRECTION_MAP[dir]
    if (!direction) return null
    return { direction, label: `grid-${direction}` }
  }
  if (words.length === 1) {
    const word = words[0]
    for (const prefix of GRID_PREFIXES) {
      if (word.startsWith(prefix) && word.length > prefix.length) {
        const dirPart = word.slice(prefix.length)
        const direction = DIRECTION_MAP[dirPart]
        if (direction) return { direction, label: `grid-${direction}` }
      }
    }
  }
  return null
}

export class VoiceInputRouter extends EventEmitter {
  private mode: 'session' | 'off' = 'off'
  private focusedSessionId: string | null = null
  private pinnedSessionId: string | null = null
  private readonly sendKeys: (sessionId: string, data: string) => Promise<void>

  constructor(deps: VoiceInputRouterDeps) {
    super()
    this.sendKeys = deps.sendKeys
  }

  setMode(mode: 'session' | 'off'): void {
    this.mode = mode
  }

  getMode(): 'session' | 'off' {
    return this.mode
  }

  setFocusedSession(sessionId: string | null): void {
    this.focusedSessionId = sessionId
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  pinToSession(sessionId: string): void {
    this.pinnedSessionId = sessionId
    this.emit('pinChanged', { pinned: true, sessionId })
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  unpinSession(): void {
    this.pinnedSessionId = null
    this.emit('pinChanged', { pinned: false, sessionId: null })
    this.emit('activeSessionChanged', this.getActiveSessionId())
  }

  togglePin(sessionId: string): void {
    if (this.pinnedSessionId === sessionId) {
      this.unpinSession()
    } else {
      this.pinToSession(sessionId)
    }
  }

  getActiveSessionId(): string | null {
    return this.pinnedSessionId ?? this.focusedSessionId
  }

  isPinned(): boolean {
    return this.pinnedSessionId !== null
  }

  getPinnedSessionId(): string | null {
    return this.pinnedSessionId
  }

  unpinIfSession(sessionId: string): void {
    if (this.pinnedSessionId === sessionId) {
      this.unpinSession()
    }
  }

  async routeTranscription(text: string): Promise<void> {
    if (this.mode === 'off') return

    const trimmed = text.trim()
    if (trimmed === '') return

    return this.routeToSession(trimmed)
  }

  private async routeToSession(text: string): Promise<void> {
    const targetId = this.getActiveSessionId()
    if (!targetId) {
      this.emit('error', { code: 'no-session', message: 'No session focused' })
      return
    }

    const normalized = stripPunctuation(text.toLowerCase())

    // Speech interrupt
    if (SPEECH_INTERRUPT_PATTERNS.includes(normalized)) {
      this.emit('speechInterrupt')
      this.emit('dispatched', { sessionId: targetId, text: '[speech-interrupt]' })
      return
    }

    // Grid navigation
    const gridCmd = GRID_NAV_COMMANDS.find(cmd => cmd.patterns.includes(normalized)) ?? matchGridNav(normalized)
    if (gridCmd) {
      this.emit('gridNav', { direction: gridCmd.direction })
      this.emit('dispatched', { sessionId: targetId, text: `[${gridCmd.label}]` })
      return
    }

    // Scroll
    const scrollCmd = SCROLL_COMMANDS.find(cmd => cmd.patterns.includes(normalized))
    if (scrollCmd) {
      this.emit('scroll', { sessionId: targetId, action: scrollCmd.action })
      this.emit('dispatched', { sessionId: targetId, text: `[${scrollCmd.label}]` })
      return
    }

    // Voice commands (submit, clear, newline)
    const command = VOICE_COMMANDS.find(cmd => cmd.patterns.includes(normalized))

    try {
      if (command) {
        await this.sendKeys(targetId, command.keys)
        this.emit('dispatched', { sessionId: targetId, text: `[${command.label}]` })
      } else {
        const cleanText = text.trimEnd().replace(/[\u200e\u200f]/g, '')
        await this.sendKeys(targetId, cleanText)
        await this.sendKeys(targetId, '\r')
        this.emit('dispatched', { sessionId: targetId, text })
      }
    } catch (err) {
      this.emit('error', { code: 'send-failed', message: (err as Error).message })
    }
  }
}
