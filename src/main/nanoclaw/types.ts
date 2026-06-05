/**
 * NanoClaw IPC message types and session mapping.
 *
 * Wire format aligns with NanoClaw's Channel-API (BT-2a verification report §5.3).
 * CK-S2-007, CK-S2-008, CK-S2-009
 */

// ---------------------------------------------------------------------------
// Inbound: cipher-keel → NanoClaw (CK-S2-007)
// ---------------------------------------------------------------------------

export interface NanoClawInboundMessage {
  channelType: 'cipher-keel'
  platformId: 'cipher-keel-local'
  threadId: string | null
  message: {
    kind: 'text'
    content: string // JSON-encoded: { text, sender, senderId }
    isMention: boolean
    isGroup: boolean
  }
}

export interface InboundContent {
  text: string
  sender: 'user'
  senderId: 'maker'
}

// ---------------------------------------------------------------------------
// Outbound: NanoClaw → cipher-keel (CK-S2-008)
// ---------------------------------------------------------------------------

export interface NanoClawOutboundText {
  text: string
  threadId: string | null
}

export interface NanoClawOutboundTyping {
  typing: boolean
  threadId: string | null
}

export interface NanoClawOutboundStatus {
  status: 'connected' | 'disconnected'
}

export type NanoClawOutboundMessage =
  | NanoClawOutboundText
  | NanoClawOutboundTyping
  | NanoClawOutboundStatus

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isOutboundText(msg: NanoClawOutboundMessage): msg is NanoClawOutboundText {
  return 'text' in msg && !('typing' in msg) && !('status' in msg)
}

export function isOutboundTyping(msg: NanoClawOutboundMessage): msg is NanoClawOutboundTyping {
  return 'typing' in msg
}

export function isOutboundStatus(msg: NanoClawOutboundMessage): msg is NanoClawOutboundStatus {
  return 'status' in msg
}

// ---------------------------------------------------------------------------
// Session mapping (CK-S2-009)
//
// NanoClaw Session Triple:
//   agent_group_id    → cipher-keel workspace/persona
//   messaging_group_id → "cipher-keel-channel" (constant)
//   thread_id          → tmux pane ID
// ---------------------------------------------------------------------------

export const MESSAGING_GROUP_ID = 'cipher-keel-channel' as const
export const CHANNEL_TYPE = 'cipher-keel' as const
export const PLATFORM_ID = 'cipher-keel-local' as const

// ---------------------------------------------------------------------------
// Bridge status
// ---------------------------------------------------------------------------

export type BridgeStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting'

// ---------------------------------------------------------------------------
// Message builder (CK-S2-007)
// ---------------------------------------------------------------------------

export function buildInboundMessage(
  text: string,
  threadId: string | null,
): NanoClawInboundMessage {
  const content: InboundContent = { text, sender: 'user', senderId: 'maker' }
  return {
    channelType: CHANNEL_TYPE,
    platformId: PLATFORM_ID,
    threadId,
    message: {
      kind: 'text',
      content: JSON.stringify(content),
      isMention: false,
      isGroup: false,
    },
  }
}
