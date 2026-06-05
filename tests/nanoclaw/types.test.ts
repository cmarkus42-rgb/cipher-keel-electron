/**
 * Tests for NanoClaw message types and type guards.
 */

import { describe, it, expect } from 'vitest'
import {
  buildInboundMessage,
  isOutboundText,
  isOutboundTyping,
  isOutboundStatus,
  MESSAGING_GROUP_ID,
  CHANNEL_TYPE,
  PLATFORM_ID,
} from '../../src/main/nanoclaw/types'

describe('NanoClaw types', () => {
  // --- constants -----------------------------------------------------------

  it('session mapping constants are correct (CK-S2-009)', () => {
    expect(MESSAGING_GROUP_ID).toBe('cipher-keel-channel')
    expect(CHANNEL_TYPE).toBe('cipher-keel')
    expect(PLATFORM_ID).toBe('cipher-keel-local')
  })

  // --- buildInboundMessage (CK-S2-007) ------------------------------------

  it('builds correct inbound message format', () => {
    const msg = buildInboundMessage('Hello', 'pane-1')

    expect(msg.channelType).toBe('cipher-keel')
    expect(msg.platformId).toBe('cipher-keel-local')
    expect(msg.threadId).toBe('pane-1')
    expect(msg.message.kind).toBe('text')
    expect(msg.message.isMention).toBe(false)
    expect(msg.message.isGroup).toBe(false)

    const content = JSON.parse(msg.message.content)
    expect(content.text).toBe('Hello')
    expect(content.sender).toBe('user')
    expect(content.senderId).toBe('maker')
  })

  it('handles null threadId', () => {
    const msg = buildInboundMessage('test', null)
    expect(msg.threadId).toBeNull()
  })

  // --- type guards (CK-S2-008) --------------------------------------------

  it('isOutboundText detects text messages', () => {
    expect(isOutboundText({ text: 'hello', threadId: 'p1' })).toBe(true)
    expect(isOutboundText({ typing: true, threadId: 'p1' })).toBe(false)
    expect(isOutboundText({ status: 'connected' })).toBe(false)
  })

  it('isOutboundTyping detects typing indicators', () => {
    expect(isOutboundTyping({ typing: true, threadId: 'p1' })).toBe(true)
    expect(isOutboundTyping({ text: 'hello', threadId: 'p1' })).toBe(false)
    expect(isOutboundTyping({ status: 'connected' })).toBe(false)
  })

  it('isOutboundStatus detects status messages', () => {
    expect(isOutboundStatus({ status: 'connected' })).toBe(true)
    expect(isOutboundStatus({ status: 'disconnected' })).toBe(true)
    expect(isOutboundStatus({ text: 'hello', threadId: 'p1' })).toBe(false)
    expect(isOutboundStatus({ typing: true, threadId: 'p1' })).toBe(false)
  })
})
