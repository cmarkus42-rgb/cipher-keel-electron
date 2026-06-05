/**
 * NanoClaw integration — barrel export.
 *
 * Re-exports bridge, adapter, and types for use by main.ts
 * and other main-process modules.
 */

export { NanoClawBridge } from './bridge'
export type { NanoClawBridgeEvents } from './bridge'
export { NanoClawChannelAdapter } from './adapter'
export {
  buildInboundMessage,
  isOutboundText,
  isOutboundTyping,
  isOutboundStatus,
  MESSAGING_GROUP_ID,
  CHANNEL_TYPE,
  PLATFORM_ID,
} from './types'
export type {
  NanoClawInboundMessage,
  NanoClawOutboundMessage,
  NanoClawOutboundText,
  NanoClawOutboundTyping,
  NanoClawOutboundStatus,
  BridgeStatus,
} from './types'
