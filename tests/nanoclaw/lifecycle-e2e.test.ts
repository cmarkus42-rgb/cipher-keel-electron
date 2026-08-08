/**
 * BT-2c — Lifecycle & E2E Pilot Tests (mock-based).
 *
 * NanoClaw-Daemon laeuft nicht → Mock-Server simuliert NanoClaw-Seite.
 * Ollama ist verfuegbar (v0.20.4), aber ohne Daemon kein echtes E2E.
 *
 * CK-S2-014: Lifecycle connect → message → disconnect
 * CK-S2-020: End-to-End pilot (question → answer → isConnected)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'
import { NanoClawChannelAdapter } from '../../src/main/nanoclaw/adapter'
import {
  CHANNEL_TYPE,
  PLATFORM_ID,
} from '../../src/main/nanoclaw/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpSocketPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-e2e-test-'))
  return path.join(dir, 'test.sock')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Mock NanoClaw server that can echo responses and track lifecycle events.
 */
function createMockNanoClaw(sockPath: string) {
  const events: string[] = []
  const receivedMessages: unknown[] = []
  const clients: net.Socket[] = []
  let responseFn: ((msg: unknown) => unknown | null) | null = null

  const server = net.createServer((socket) => {
    events.push('client-connected')
    clients.push(socket)

    // Send status connected (like real NanoClaw cipher-keel channel)
    socket.write(JSON.stringify({ status: 'connected' }) + '\n')

    let lineBuffer = ''
    socket.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString('utf-8')
      let idx: number
      while ((idx = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, idx).trim()
        lineBuffer = lineBuffer.slice(idx + 1)
        if (!line) continue

        try {
          const parsed = JSON.parse(line)
          receivedMessages.push(parsed)
          events.push('message-received')

          if (responseFn) {
            const response = responseFn(parsed)
            if (response) {
              // Simulate processing delay then send response
              socket.write(JSON.stringify(response) + '\n')
            }
          }
        } catch {
          events.push('malformed-json')
        }
      }
    })

    socket.on('close', () => {
      events.push('client-disconnected')
    })
  })

  return {
    server,
    events,
    receivedMessages,
    clients,
    /** Set a function that produces a response for each incoming message */
    onMessage(fn: (msg: unknown) => unknown | null) {
      responseFn = fn
    },
    listen: () => new Promise<void>((resolve) => server.listen(sockPath, resolve)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    /** Wait until at least n clients have connected */
    waitForClients: async (n = 1, timeoutMs = 500): Promise<void> => {
      const start = Date.now()
      while (clients.length < n && Date.now() - start < timeoutMs) {
        await delay(10)
      }
      if (clients.length < n) throw new Error(`Expected ${n} clients, got ${clients.length}`)
    },
  }
}

// ---------------------------------------------------------------------------
// CK-S2-014 — Lifecycle Tests
// ---------------------------------------------------------------------------

describe('CK-S2-014: Lifecycle connect → message → disconnect', () => {
  let sockPath: string
  let nanoclaw: ReturnType<typeof createMockNanoClaw>
  let bridge: NanoClawBridge

  beforeEach(async () => {
    sockPath = tmpSocketPath()
    nanoclaw = createMockNanoClaw(sockPath)
    await nanoclaw.listen()
    bridge = new NanoClawBridge(sockPath)
  })

  afterEach(async () => {
    bridge.disconnect()
    await nanoclaw.close()
    try { fs.unlinkSync(sockPath) } catch { /* ok */ }
    try { fs.rmdirSync(path.dirname(sockPath)) } catch { /* ok */ }
  })

  it('step 1: bridge opens socket on connect', async () => {
    await bridge.connect()
    await nanoclaw.waitForClients()

    expect(bridge.isConnected()).toBe(true)
    expect(nanoclaw.events).toContain('client-connected')
  })

  it('step 2: channel registers (status connected received)', async () => {
    const statuses: string[] = []
    bridge.on('status-changed', (s: string) => statuses.push(s))

    await bridge.connect()
    await delay(50)

    // Bridge is connected
    expect(statuses).toContain('connected')
    // NanoClaw sent status:connected (logged by bridge)
    expect(bridge.isConnected()).toBe(true)
  })

  it('step 3: inbound message → NanoClaw processes → outbound response', async () => {
    // Configure mock to echo responses
    nanoclaw.onMessage((msg: unknown) => {
      const m = msg as { message?: { content?: string }; threadId?: string }
      if (m.message?.content) {
        const content = JSON.parse(m.message.content)
        return {
          text: `Echo: ${content.text}`,
          threadId: m.threadId ?? null,
        }
      }
      return null
    })

    await bridge.connect()
    await nanoclaw.waitForClients()

    const responses: Array<{ threadId: string | null; text: string }> = []
    bridge.on('message-inbound', (threadId: string | null, text: string) => {
      responses.push({ threadId, text })
    })

    // Send message
    const sent = bridge.sendMessage('Was ist 2+2?', 'pane-1')
    expect(sent).toBe(true)
    await delay(100)

    // Verify NanoClaw received it
    expect(nanoclaw.receivedMessages.length).toBeGreaterThanOrEqual(1)
    const received = nanoclaw.receivedMessages[0] as { channelType: string; platformId: string }
    expect(received.channelType).toBe(CHANNEL_TYPE)
    expect(received.platformId).toBe(PLATFORM_ID)

    // Verify response came back
    expect(responses).toHaveLength(1)
    expect(responses[0].text).toBe('Echo: Was ist 2+2?')
    expect(responses[0].threadId).toBe('pane-1')
  })

  it('step 4: disconnect closes socket cleanly', async () => {
    await bridge.connect()
    await nanoclaw.waitForClients()

    bridge.disconnect()
    await delay(100)

    expect(bridge.isConnected()).toBe(false)
    expect(bridge.getStatus()).toBe('disconnected')
    expect(nanoclaw.events).toContain('client-disconnected')
  })

  it('step 5: no resource leak after disconnect (timers cleared)', async () => {
    await bridge.connect()
    await nanoclaw.waitForClients()

    // Trigger the bridge to have internal state
    bridge.sendMessage('test', 'pane-1')
    await delay(50)

    bridge.disconnect()

    // After disconnect: sendMessage returns false, no pending timers
    expect(bridge.sendMessage('after-disconnect', null)).toBe(false)
    expect(bridge.isConnected()).toBe(false)

    // Bridge stays disconnected (no stale reconnect timers fire)
    await delay(200)
    expect(bridge.isConnected()).toBe(false)
    expect(bridge.getStatus()).toBe('disconnected')
  })

  it('full lifecycle sequence in order', async () => {
    const lifecycle: string[] = []

    bridge.on('status-changed', (s: string) => lifecycle.push(`status:${s}`))

    // 1. Connect
    await bridge.connect()
    await nanoclaw.waitForClients()
    lifecycle.push('connected')

    // 2. Send message
    nanoclaw.onMessage((msg: unknown) => {
      const m = msg as { message?: { content?: string }; threadId?: string }
      if (m.message?.content) {
        const content = JSON.parse(m.message.content)
        return { text: `Reply: ${content.text}`, threadId: m.threadId ?? null }
      }
      return null
    })

    const responseReceived = new Promise<void>((resolve) => {
      bridge.on('message-inbound', () => {
        lifecycle.push('response-received')
        resolve()
      })
    })

    bridge.sendMessage('Ping', 'pane-test')
    lifecycle.push('message-sent')
    await responseReceived

    // 3. Disconnect
    bridge.disconnect()
    lifecycle.push('disconnected')

    expect(lifecycle).toContain('status:connecting')
    expect(lifecycle).toContain('status:connected')
    expect(lifecycle).toContain('connected')
    expect(lifecycle).toContain('message-sent')
    expect(lifecycle).toContain('response-received')
    expect(lifecycle).toContain('disconnected')

    // Order: connect before send, send before response, response before disconnect
    const connIdx = lifecycle.indexOf('connected')
    const sentIdx = lifecycle.indexOf('message-sent')
    const respIdx = lifecycle.indexOf('response-received')
    const discIdx = lifecycle.indexOf('disconnected')

    expect(connIdx).toBeLessThan(sentIdx)
    expect(sentIdx).toBeLessThan(respIdx)
    expect(respIdx).toBeLessThan(discIdx)
  })
})

// ---------------------------------------------------------------------------
// CK-S2-020 — End-to-End Pilot Test (mock-based)
// ---------------------------------------------------------------------------

describe('CK-S2-020: E2E Pilot — question → answer → isConnected', () => {
  let sockPath: string
  let nanoclaw: ReturnType<typeof createMockNanoClaw>
  let bridge: NanoClawBridge
  let adapter: NanoClawChannelAdapter

  beforeEach(async () => {
    sockPath = tmpSocketPath()
    nanoclaw = createMockNanoClaw(sockPath)
    await nanoclaw.listen()
    bridge = new NanoClawBridge(sockPath)
    adapter = new NanoClawChannelAdapter(bridge)
  })

  afterEach(async () => {
    bridge.disconnect()
    await nanoclaw.close()
    try { fs.unlinkSync(sockPath) } catch { /* ok */ }
    try { fs.rmdirSync(path.dirname(sockPath)) } catch { /* ok */ }
  })

  it('sends question, receives non-empty answer', async () => {
    // Mock NanoClaw: simulate Ollama-style response
    nanoclaw.onMessage((msg: unknown) => {
      const m = msg as { message?: { content?: string }; threadId?: string }
      if (m.message?.content) {
        const content = JSON.parse(m.message.content)
        // Simulate realistic NanoClaw+Ollama response
        return {
          text: `The answer to "${content.text}" is: This is a simulated Ollama response.`,
          threadId: m.threadId ?? null,
        }
      }
      return null
    })

    await bridge.connect()
    await nanoclaw.waitForClients()

    const answer = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: no answer within 5s')), 5000)
      bridge.on('message-inbound', (_threadId: string | null, text: string) => {
        clearTimeout(timeout)
        resolve(text)
      })
      bridge.sendMessage('Was ist die Hauptstadt von Deutschland?', 'pane-pilot')
    })

    // AK2: response is not empty, not an error
    expect(answer).toBeTruthy()
    expect(answer.length).toBeGreaterThan(0)
    expect(answer).not.toMatch(/error/i)
  })

  it('isConnected() returns true during active session', async () => {
    await bridge.connect()
    await nanoclaw.waitForClients()

    // AK4: isConnected gives true (programmatic check per assignment)
    expect(bridge.isConnected()).toBe(true)
    expect(adapter.isAvailable()).toBe(true)
  })

  it('adapter.sendPrompt delivers message through bridge', async () => {
    nanoclaw.onMessage((msg: unknown) => {
      const m = msg as { message?: { content?: string }; threadId?: string }
      if (m.message?.content) {
        return { text: 'adapter-response', threadId: m.threadId ?? null }
      }
      return null
    })

    await bridge.connect()
    await nanoclaw.waitForClients()

    const answer = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000)
      bridge.on('message-inbound', (_: string | null, text: string) => {
        clearTimeout(timeout)
        resolve(text)
      })
      adapter.sendPrompt('pane-e2e', 'Hello from adapter')
    })

    expect(answer).toBe('adapter-response')
  })

  it('full E2E flow completes within timing budget', async () => {
    // Simulate processing delay (realistic for local Ollama)
    nanoclaw.onMessage((msg: unknown) => {
      const m = msg as { message?: { content?: string }; threadId?: string }
      if (m.message?.content) {
        const content = JSON.parse(m.message.content)
        // Response is synchronous from mock (real Ollama would take 1-30s)
        return {
          text: `Response to: ${content.text}`,
          threadId: m.threadId ?? null,
        }
      }
      return null
    })

    const startTime = Date.now()

    await bridge.connect()
    await nanoclaw.waitForClients()

    const answer = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('AK5: flow exceeded 60s')), 60_000)
      bridge.on('message-inbound', (_: string | null, text: string) => {
        clearTimeout(timeout)
        resolve(text)
      })
      bridge.sendMessage('Timing test', 'pane-timing')
    })

    const elapsed = Date.now() - startTime

    // AK5: total flow < 60s (mock is near-instant, so well under budget)
    expect(elapsed).toBeLessThan(60_000)
    expect(answer).toBeTruthy()
  })

  it('connection status transitions correctly through E2E flow', async () => {
    const statuses: string[] = []
    bridge.on('status-changed', (s: string) => statuses.push(s))

    // Before connect
    expect(bridge.isConnected()).toBe(false)

    // Connect
    await bridge.connect()
    expect(bridge.isConnected()).toBe(true)

    // AK4: status is "connected" (verbunden)
    expect(bridge.getStatus()).toBe('connected')
    expect(statuses).toContain('connected')

    // Disconnect
    bridge.disconnect()
    expect(bridge.isConnected()).toBe(false)
    expect(statuses).toContain('disconnected')
  })

  it('wire format matches BT-2a specification', async () => {
    await bridge.connect()
    await nanoclaw.waitForClients()

    bridge.sendMessage('format check', 'pane-fmt')
    await delay(50)

    // Verify inbound wire format (§5.3 of BT-2a report)
    const msg = nanoclaw.receivedMessages[0] as Record<string, unknown>
    expect(msg.channelType).toBe('cipher-keel')
    expect(msg.platformId).toBe('cipher-keel-local')
    expect(msg.threadId).toBe('pane-fmt')

    const message = msg.message as { kind: string; content: string; isMention: boolean; isGroup: boolean }
    expect(message.kind).toBe('text')
    expect(message.isMention).toBe(false)
    expect(message.isGroup).toBe(false)

    const content = JSON.parse(message.content)
    expect(content.text).toBe('format check')
    expect(content.sender).toBe('user')
    expect(content.senderId).toBe('maker')
  })

  it('handles typing indicator during response', async () => {
    // Simulate NanoClaw sending typing → then response
    let clientSocket: net.Socket | null = null
    nanoclaw.server.on('connection', (sock) => { clientSocket = sock })

    await bridge.connect()
    await nanoclaw.waitForClients()
    await delay(50) // ensure clientSocket is set

    const typings: boolean[] = []
    const messages: string[] = []

    bridge.on('typing', (_: string | null, isTyping: boolean) => {
      typings.push(isTyping)
    })
    bridge.on('message-inbound', (_: string | null, text: string) => {
      messages.push(text)
    })

    // Simulate NanoClaw sending typing then response
    clientSocket!.write(JSON.stringify({ typing: true, threadId: 'pane-typ' }) + '\n')
    await delay(20)
    clientSocket!.write(JSON.stringify({ text: 'Done thinking', threadId: 'pane-typ' }) + '\n')
    await delay(50)

    expect(typings).toContain(true)
    expect(messages).toEqual(['Done thinking'])
  })

  it('no crash on rapid connect-send-disconnect cycle', async () => {
    nanoclaw.onMessage(() => null) // no response needed

    // Rapid cycles should not throw or leave leaks
    for (let i = 0; i < 3; i++) {
      const b = new NanoClawBridge(sockPath)
      await b.connect()
      b.sendMessage(`cycle-${i}`, `pane-${i}`)
      b.disconnect()
    }

    // All messages received server-side
    await delay(100)
    expect(nanoclaw.receivedMessages.length).toBe(3)
  })
})
