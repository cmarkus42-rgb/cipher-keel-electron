/**
 * tests/event-bus.test.ts — Broadcast an alle lebenden Fenster (Befund 3).
 *
 * Verifiziert am 2026-08-06 in der laufenden App: notes:changed erreichte nur
 * das Fenster, das die Service-Init ausgeloest hatte. Der Bus behebt das.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerWindow,
  broadcast,
  windowCount,
  resetEventBus,
  type BroadcastTarget,
} from '../src/main/event-bus'

interface FakeWindow extends BroadcastTarget {
  sent: Array<{ channel: string; args: unknown[] }>
  destroyed: boolean
  fireClosed: () => void
}

function makeWindow(): FakeWindow {
  let closedHandler: (() => void) | null = null
  const win: FakeWindow = {
    sent: [],
    destroyed: false,
    webContents: {
      send(channel: string, ...args: unknown[]) {
        win.sent.push({ channel, args })
      },
    },
    isDestroyed: () => win.destroyed,
    once(_event: 'closed', cb: () => void) {
      closedHandler = cb
    },
    fireClosed() {
      win.destroyed = true
      closedHandler?.()
    },
  }
  return win
}

beforeEach(() => {
  resetEventBus()
})

describe('registerWindow / windowCount', () => {
  it('starts empty', () => {
    expect(windowCount()).toBe(0)
  })

  it('counts each registered window', () => {
    registerWindow(makeWindow())
    registerWindow(makeWindow())

    expect(windowCount()).toBe(2)
  })

  it('registering the same window twice does not duplicate it', () => {
    const win = makeWindow()
    registerWindow(win)
    registerWindow(win)

    expect(windowCount()).toBe(1)
  })
})

describe('broadcast', () => {
  it('reaches every registered window — the core fix for Befund 3', () => {
    const a = makeWindow()
    const b = makeWindow()
    registerWindow(a)
    registerWindow(b)

    broadcast('notes:changed')

    expect(a.sent).toEqual([{ channel: 'notes:changed', args: [] }])
    expect(b.sent).toEqual([{ channel: 'notes:changed', args: [] }])
  })

  it('forwards all arguments', () => {
    const win = makeWindow()
    registerWindow(win)

    broadcast('session:output', 'sess-1', 'hello')

    expect(win.sent[0].args).toEqual(['sess-1', 'hello'])
  })

  it('does not throw when no window is registered', () => {
    expect(() => broadcast('notes:changed')).not.toThrow()
  })
})

describe('deregistration', () => {
  it('drops a window when it fires closed', () => {
    const a = makeWindow()
    const b = makeWindow()
    registerWindow(a)
    registerWindow(b)

    a.fireClosed()

    expect(windowCount()).toBe(1)
    broadcast('notes:changed')
    expect(a.sent).toHaveLength(0)
    expect(b.sent).toHaveLength(1)
  })

  it('skips a destroyed window that never fired closed', () => {
    const win = makeWindow()
    registerWindow(win)
    win.destroyed = true

    broadcast('notes:changed')

    expect(win.sent).toHaveLength(0)
  })

  it('keeps delivering to healthy windows when one send throws', () => {
    const bad = makeWindow()
    bad.webContents.send = () => {
      throw new Error('render process gone')
    }
    const good = makeWindow()
    registerWindow(bad)
    registerWindow(good)

    expect(() => broadcast('notes:changed')).not.toThrow()
    expect(good.sent).toHaveLength(1)
  })
})
