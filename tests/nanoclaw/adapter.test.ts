/**
 * Tests for NanoClawChannelAdapter.
 *
 * Covers: isAvailable, getCapabilities, sendPrompt, adapter metadata.
 */

import { describe, it, expect } from 'vitest'
import { NanoClawChannelAdapter } from '../../src/main/nanoclaw/adapter'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'

// ---------------------------------------------------------------------------
// Minimal mock bridge
// ---------------------------------------------------------------------------

function createMockBridge(connected: boolean) {
  const sent: Array<{ text: string; threadId: string | null }> = []

  return {
    bridge: {
      isConnected: () => connected,
      sendMessage: (text: string, threadId: string | null) => {
        if (!connected) return false
        sent.push({ text, threadId })
        return true
      },
    } as unknown as NanoClawBridge,
    sent,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NanoClawChannelAdapter', () => {
  // --- metadata ------------------------------------------------------------

  it('has correct id and tier', () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    expect(adapter.id).toBe('nanoclaw-channel')
    expect(adapter.displayName).toBe('NanoClaw')
    expect(adapter.tier).toBe('tier-2')
  })

  // --- isAvailable ---------------------------------------------------------

  it('isAvailable returns true when bridge is connected', () => {
    const { bridge } = createMockBridge(true)
    const adapter = new NanoClawChannelAdapter(bridge)

    expect(adapter.isAvailable()).toBe(true)
  })

  it('isAvailable returns false when bridge is disconnected', () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    expect(adapter.isAvailable()).toBe(false)
  })

  // --- getCapabilities (CK-S2-006) ----------------------------------------

  it('declares no-streaming and message-bus capabilities', () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)
    const caps = adapter.getCapabilities()

    expect(caps['mcp-injection']).toBe(false)
    expect(caps['status-line']).toBe(false)
    expect(caps['message-bus-participant']).toBe(true)
  })

  it('supports() checks individual capabilities', () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    expect(adapter.supports('message-bus-participant')).toBe(true)
    expect(adapter.supports('mcp-injection')).toBe(false)
    expect(adapter.supports('status-line')).toBe(false)
  })

  // --- sendPrompt ----------------------------------------------------------

  it('sendPrompt sends message via bridge', async () => {
    const { bridge, sent } = createMockBridge(true)
    const adapter = new NanoClawChannelAdapter(bridge)

    await adapter.sendPrompt('pane-1', 'What is 2+2?')

    expect(sent).toHaveLength(1)
    expect(sent[0].text).toBe('What is 2+2?')
    expect(sent[0].threadId).toBe('pane-1')
  })

  it('sendPrompt throws when bridge is disconnected', async () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    await expect(adapter.sendPrompt('pane-1', 'test')).rejects.toThrow('not connected')
  })

  // --- no NanoClaw lifecycle management (CK-S2-015) ------------------------

  it('buildLaunchCommand returns no-op (does not start NanoClaw)', () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    const cmd = adapter.buildLaunchCommand({
      projectPath: '/tmp/test',
      sessionName: 'test-session',
    })

    // Should be a no-op command, not an actual NanoClaw start command
    expect(cmd.cmd).toBe('echo')
  })

  it('has no project markers', () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    expect(adapter.getProjectMarkers()).toEqual([])
  })

  it('returns null for project instructions', async () => {
    const { bridge } = createMockBridge(false)
    const adapter = new NanoClawChannelAdapter(bridge)

    expect(await adapter.readProjectInstructions('/tmp/test')).toBeNull()
  })
})
