/**
 * NanoClawBridge — cipher-keel-side Unix-Domain-Socket client.
 *
 * Connects to the NanoClaw cipher-keel channel socket, sends/receives
 * JSON-Lines messages, and emits typed events for the Electron IPC layer.
 *
 * CK-S2-004: Socket client
 * CK-S2-005: Reconnect max 3x exponential backoff (1s, 2s, 4s)
 * CK-S2-010: Configurable socket path
 * CK-S2-012: IPC event mapping
 * CK-S2-013: Malformed JSON → ignore + log
 */

import * as net from 'net'
import * as path from 'path'
import * as os from 'os'
import { EventEmitter } from 'events'
import type {
  NanoClawInboundMessage,
  NanoClawOutboundMessage,
  BridgeStatus,
} from './types'
import {
  isOutboundText,
  isOutboundTyping,
  isOutboundStatus,
  buildInboundMessage,
} from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SOCKET_PATH = path.join(
  os.homedir(),
  '.config',
  'cipher-mux',
  'channels',
  'cipher-keel.sock',
)

const MAX_RECONNECT_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1000 // 1s, 2s, 4s

const LOG_PREFIX = '[NanoClawBridge]'

// ---------------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------------

export interface NanoClawBridgeEvents {
  /** Outbound text from NanoClaw → cipher-keel (for renderer) */
  'message-inbound': (threadId: string | null, text: string) => void
  /** Typing indicator from NanoClaw */
  'typing': (threadId: string | null, isTyping: boolean) => void
  /** Bridge connection status changed */
  'status-changed': (status: BridgeStatus) => void
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class NanoClawBridge extends EventEmitter {
  private socket: net.Socket | null = null
  private socketPath: string
  private status: BridgeStatus = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private lineBuffer = ''
  private destroyed = false

  constructor(socketPath?: string) {
    super()
    this.socketPath = socketPath ?? DEFAULT_SOCKET_PATH
  }

  // --- public API ----------------------------------------------------------

  getStatus(): BridgeStatus {
    return this.status
  }

  getSocketPath(): string {
    return this.socketPath
  }

  setSocketPath(p: string): void {
    this.socketPath = p
  }

  /**
   * Connect to the NanoClaw socket. Resolves when connected or rejects
   * after all reconnect attempts are exhausted.
   */
  async connect(): Promise<void> {
    if (this.destroyed) return
    if (this.status === 'connected') return

    this.reconnectAttempts = 0
    return this.attemptConnect()
  }

  /**
   * Manual reconnect — resets the attempt counter and tries again.
   */
  async reconnect(): Promise<void> {
    this.reconnectAttempts = 0
    this.cleanup()
    return this.attemptConnect()
  }

  /**
   * Send a user message to NanoClaw.
   */
  sendMessage(text: string, threadId: string | null): boolean {
    if (!this.socket || this.status !== 'connected') {
      console.warn(LOG_PREFIX, 'Cannot send — not connected')
      return false
    }

    const msg: NanoClawInboundMessage = buildInboundMessage(text, threadId)
    return this.writeLine(msg)
  }

  /**
   * Send an arbitrary JSON object as a JSON-Line.
   */
  sendRaw(data: unknown): boolean {
    if (!this.socket || this.status !== 'connected') return false
    return this.writeLine(data)
  }

  /**
   * Disconnect and clean up. No automatic reconnect after this.
   */
  disconnect(): void {
    this.destroyed = true
    this.cleanup()
    this.setStatus('disconnected')
  }

  /**
   * Check if the socket is currently connected (for adapter.isAvailable).
   */
  isConnected(): boolean {
    return this.status === 'connected'
  }

  // --- private: connection logic -------------------------------------------

  private attemptConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('Bridge is destroyed'))
        return
      }

      this.setStatus(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting')

      const sock = net.createConnection({ path: this.socketPath })

      sock.on('connect', () => {
        this.socket = sock
        this.reconnectAttempts = 0
        this.lineBuffer = ''
        this.setStatus('connected')
        resolve()
      })

      sock.on('data', (chunk: Buffer) => {
        this.onData(chunk)
      })

      sock.on('close', () => {
        this.socket = null
        if (!this.destroyed) {
          this.scheduleReconnect()
        }
      })

      sock.on('error', (err: Error) => {
        console.warn(LOG_PREFIX, 'Socket error:', err.message)
        sock.destroy()
        this.socket = null

        if (this.reconnectAttempts === 0 && this.status === 'connecting') {
          // First connect attempt failed — try reconnecting
          this.scheduleReconnect()
          reject(err)
        }
        // Subsequent errors are handled by the 'close' handler
      })
    })
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(LOG_PREFIX, `Gave up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`)
      this.setStatus('disconnected')
      return
    }

    const delay = BACKOFF_BASE_MS * Math.pow(2, this.reconnectAttempts) // 1s, 2s, 4s
    this.reconnectAttempts++
    this.setStatus('reconnecting')

    console.log(LOG_PREFIX, `Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.attemptConnect().catch(() => {
        // Handled by scheduleReconnect via 'close'
      })
    }, delay)
  }

  // --- private: data handling (JSON-Lines) ---------------------------------

  private onData(chunk: Buffer): void {
    this.lineBuffer += chunk.toString('utf-8')

    let newlineIdx: number
    while ((newlineIdx = this.lineBuffer.indexOf('\n')) !== -1) {
      const line = this.lineBuffer.slice(0, newlineIdx).trim()
      this.lineBuffer = this.lineBuffer.slice(newlineIdx + 1)

      if (line.length === 0) continue
      this.parseLine(line)
    }
  }

  private parseLine(line: string): void {
    let msg: NanoClawOutboundMessage
    try {
      msg = JSON.parse(line) as NanoClawOutboundMessage
    } catch {
      // CK-S2-013: malformed JSON — ignore + log
      console.warn(LOG_PREFIX, 'Malformed JSON (ignored):', line.slice(0, 200))
      return
    }

    this.dispatchOutbound(msg)
  }

  private dispatchOutbound(msg: NanoClawOutboundMessage): void {
    if (isOutboundText(msg)) {
      this.emit('message-inbound', msg.threadId ?? null, msg.text)
    } else if (isOutboundTyping(msg)) {
      this.emit('typing', msg.threadId ?? null, msg.typing)
    } else if (isOutboundStatus(msg)) {
      // NanoClaw-side status — informational, don't override bridge status
      console.log(LOG_PREFIX, 'NanoClaw reports status:', msg.status)
    }
  }

  // --- private: writing ----------------------------------------------------

  private writeLine(data: unknown): boolean {
    if (!this.socket || this.socket.destroyed) return false
    try {
      const line = JSON.stringify(data) + '\n'
      this.socket.write(line)
      return true
    } catch (err) {
      console.error(LOG_PREFIX, 'Write failed:', err)
      return false
    }
  }

  // --- private: cleanup ----------------------------------------------------

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.lineBuffer = ''
  }

  private setStatus(s: BridgeStatus): void {
    if (this.status === s) return
    this.status = s
    this.emit('status-changed', s)
  }
}
