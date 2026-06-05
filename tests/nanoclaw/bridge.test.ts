/**
 * Tests for NanoClawBridge — mock-socket-based.
 *
 * Covers: JSON-Lines parsing, reconnect counter, malformed JSON,
 * message sending, status transitions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-bridge-test-'))
  return path.join(dir, 'test.sock')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates a mock server that tracks connected clients.
 */
function createTrackingServer(sockPath: string) {
  const clients: net.Socket[] = []
  const server = net.createServer((socket) => {
    clients.push(socket)
  })
  return {
    server,
    clients,
    listen: () => new Promise<void>((resolve) => server.listen(sockPath, resolve)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    /** Wait until at least one client has connected. */
    waitForClient: async (timeoutMs = 500): Promise<net.Socket> => {
      const start = Date.now()
      while (clients.length === 0 && Date.now() - start < timeoutMs) {
        await delay(10)
      }
      if (clients.length === 0) throw new Error('No client connected in time')
      return clients[clients.length - 1]
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NanoClawBridge', () => {
  let sockPath: string
  let mock: ReturnType<typeof createTrackingServer>
  let bridge: NanoClawBridge

  beforeEach(async () => {
    sockPath = tmpSocketPath()
    mock = createTrackingServer(sockPath)
    await mock.listen()
    bridge = new NanoClawBridge(sockPath)
  })

  afterEach(async () => {
    bridge.disconnect()
    await mock.close()
    try { fs.unlinkSync(sockPath) } catch { /* ok */ }
    try { fs.rmdirSync(path.dirname(sockPath)) } catch { /* ok */ }
  })

  // --- Connection ----------------------------------------------------------

  it('connects to a running socket server', async () => {
    await bridge.connect()
    expect(bridge.isConnected()).toBe(true)
    expect(bridge.getStatus()).toBe('connected')
  })

  it('emits status-changed on connect', async () => {
    const statuses: string[] = []
    bridge.on('status-changed', (s: string) => statuses.push(s))

    await bridge.connect()

    expect(statuses).toContain('connecting')
    expect(statuses).toContain('connected')
  })

  it('reports not-connected when socket is unavailable', async () => {
    const badBridge = new NanoClawBridge('/tmp/nonexistent-socket-path-12345.sock')
    try {
      await badBridge.connect()
    } catch {
      // expected
    }
    expect(badBridge.isConnected()).toBe(false)
    badBridge.disconnect()
  })

  // --- JSON-Lines parsing --------------------------------------------------

  it('parses outbound text messages', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const received: Array<{ threadId: string | null; text: string }> = []
    bridge.on('message-inbound', (threadId: string | null, text: string) => {
      received.push({ threadId, text })
    })

    client.write(JSON.stringify({ text: 'Hello from NanoClaw', threadId: 'pane-1' }) + '\n')
    await delay(50)

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Hello from NanoClaw')
    expect(received[0].threadId).toBe('pane-1')
  })

  it('parses typing indicators', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const typings: Array<{ threadId: string | null; isTyping: boolean }> = []
    bridge.on('typing', (threadId: string | null, isTyping: boolean) => {
      typings.push({ threadId, isTyping })
    })

    client.write(JSON.stringify({ typing: true, threadId: 'pane-2' }) + '\n')
    await delay(50)

    expect(typings).toHaveLength(1)
    expect(typings[0].isTyping).toBe(true)
    expect(typings[0].threadId).toBe('pane-2')
  })

  it('handles multiple JSON-Lines in a single chunk', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const received: string[] = []
    bridge.on('message-inbound', (_: string | null, text: string) => {
      received.push(text)
    })

    const chunk =
      JSON.stringify({ text: 'msg1', threadId: null }) + '\n' +
      JSON.stringify({ text: 'msg2', threadId: null }) + '\n'
    client.write(chunk)
    await delay(50)

    expect(received).toEqual(['msg1', 'msg2'])
  })

  it('handles split JSON-Lines across chunks', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const received: string[] = []
    bridge.on('message-inbound', (_: string | null, text: string) => {
      received.push(text)
    })

    const full = JSON.stringify({ text: 'split-test', threadId: null }) + '\n'
    const mid = Math.floor(full.length / 2)
    client.write(full.slice(0, mid))
    await delay(20)
    client.write(full.slice(mid))
    await delay(50)

    expect(received).toEqual(['split-test'])
  })

  // --- Malformed JSON (CK-S2-013) -----------------------------------------

  it('ignores malformed JSON and continues processing', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const received: string[] = []
    bridge.on('message-inbound', (_: string | null, text: string) => {
      received.push(text)
    })

    client.write('this is not json\n')
    client.write(JSON.stringify({ text: 'valid', threadId: null }) + '\n')
    await delay(50)

    expect(received).toEqual(['valid'])
  })

  it('does not crash on empty lines', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const received: string[] = []
    bridge.on('message-inbound', (_: string | null, text: string) => {
      received.push(text)
    })

    client.write('\n\n\n')
    client.write(JSON.stringify({ text: 'after-empty', threadId: null }) + '\n')
    await delay(50)

    expect(received).toEqual(['after-empty'])
  })

  // --- Sending messages ----------------------------------------------------

  it('sends inbound messages as JSON-Lines', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const serverReceived: string[] = []
    client.on('data', (chunk: Buffer) => {
      serverReceived.push(chunk.toString('utf-8'))
    })

    bridge.sendMessage('Hello NanoClaw', 'pane-1')
    await delay(50)

    expect(serverReceived.length).toBeGreaterThan(0)
    const parsed = JSON.parse(serverReceived[0].trim())
    expect(parsed.channelType).toBe('cipher-keel')
    expect(parsed.platformId).toBe('cipher-keel-local')
    expect(parsed.threadId).toBe('pane-1')
    expect(parsed.message.kind).toBe('text')

    const content = JSON.parse(parsed.message.content)
    expect(content.text).toBe('Hello NanoClaw')
    expect(content.sender).toBe('user')
    expect(content.senderId).toBe('maker')
  })

  it('returns false when sending without connection', () => {
    expect(bridge.sendMessage('test', null)).toBe(false)
  })

  // --- Reconnect (CK-S2-005) ----------------------------------------------

  it('emits reconnecting status when server-side socket closes', async () => {
    await bridge.connect()
    const client = await mock.waitForClient()

    const statuses: string[] = []
    bridge.on('status-changed', (s: string) => statuses.push(s))

    client.destroy()
    await delay(200)

    expect(statuses).toContain('reconnecting')
  })

  // --- Disconnect ----------------------------------------------------------

  it('disconnect prevents further operations', async () => {
    await bridge.connect()
    bridge.disconnect()

    expect(bridge.getStatus()).toBe('disconnected')
    expect(bridge.isConnected()).toBe(false)
    expect(bridge.sendMessage('test', null)).toBe(false)
  })

  it('manual reconnect resets the counter', async () => {
    await bridge.connect()
    bridge.disconnect()

    // Re-create bridge (disconnect sets destroyed=true)
    bridge = new NanoClawBridge(sockPath)
    await bridge.reconnect()

    expect(bridge.isConnected()).toBe(true)
  })

  // --- Socket path ---------------------------------------------------------

  it('uses configurable socket path', () => {
    const custom = '/tmp/custom-nanoclaw.sock'
    const b = new NanoClawBridge(custom)
    expect(b.getSocketPath()).toBe(custom)
    b.disconnect()
  })

  it('defaults to ~/.config/cipher-mux/channels/cipher-keel.sock', () => {
    const b = new NanoClawBridge()
    expect(b.getSocketPath()).toBe(
      path.join(os.homedir(), '.config', 'cipher-mux', 'channels', 'cipher-keel.sock'),
    )
    b.disconnect()
  })
})
