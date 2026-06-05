/**
 * TmuxManager — Manages a tmux Control Mode connection.
 *
 * Uses `tmux -C` to get structured events from tmux, and sends
 * commands back through stdin. All terminal output is batched
 * at 16ms intervals before being emitted.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-002).
 */

import { spawn, ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { EventEmitter } from 'events'
import { TmuxParser, TmuxEvent } from './tmux-parser'
import { OutputBatcher } from './output-batcher'
import { runCommand } from '../util/exec-util'

export interface TmuxSessionInfo {
  id: string
  name: string
  width: number
  height: number
  created: number
  /** Working directory of the first pane (best-effort, empty string if unavailable) */
  paneCwd: string
}

export interface TmuxManagerEvents {
  output: (paneId: string, data: string) => void
  'sessions-changed': () => void
  'session-changed': (sessionId: string, name: string) => void
  exit: (reason: string) => void
  error: (err: Error) => void
}

export class TmuxManager extends EventEmitter {
  private controlProcess: ChildProcess | null = null
  private parser: TmuxParser
  private batcher: OutputBatcher
  private connected = false
  private pendingCommands: Map<number, {
    resolve: (result: string) => void
    reject: (err: Error) => void
    buffer: string[]
  }> = new Map()
  private outputWatchers: Map<string, { process: ChildProcess; parser: TmuxParser }> = new Map()

  constructor() {
    super()
    this.parser = new TmuxParser()
    this.batcher = new OutputBatcher((paneId, data) => {
      this.emit('output', paneId, data)
    })

    this.parser.onEvent((event: TmuxEvent) => {
      this.handleEvent(event)
    })
  }

  /**
   * Connect to tmux in Control Mode.
   * If socketPath is provided, connects to an existing server.
   */
  async connect(socketPath?: string): Promise<void> {
    if (this.connected) return

    const args = ['-C']
    if (socketPath) {
      args.unshift('-L', socketPath)
    }
    args.push('new-session', '-d', '-s', 'cipher-keel-control', '-x', '200', '-y', '50')

    // Try to attach first, fall back to new session
    try {
      await this.startControlMode(['-C', ...(socketPath ? ['-L', socketPath] : []), 'attach-session', '-t', 'cipher-keel-control'])
    } catch {
      await this.startControlMode(args)
    }
  }

  private startControlMode(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controlProcess = spawn('tmux', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color' },
      })

      let startupResolved = false
      const decoder = new StringDecoder('utf-8')

      this.controlProcess.stdout?.on('data', (chunk: Buffer) => {
        this.parser.feed(decoder.write(chunk))
        if (!startupResolved) {
          startupResolved = true
          this.connected = true
          resolve()
        }
      })

      this.controlProcess.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf-8').trim()
        if (!startupResolved) {
          startupResolved = true
          reject(new Error(`tmux control mode failed: ${msg}`))
        } else {
          this.emit('error', new Error(`tmux stderr: ${msg}`))
        }
      })

      this.controlProcess.on('exit', (code) => {
        this.connected = false
        this.controlProcess = null
        if (!startupResolved) {
          startupResolved = true
          reject(new Error(`tmux exited with code ${code}`))
        }
      })

      this.controlProcess.on('error', (err) => {
        this.connected = false
        if (!startupResolved) {
          startupResolved = true
          reject(err)
        } else {
          this.emit('error', err)
        }
      })
    })
  }

  /**
   * Watch a tmux session's output by attaching a read-only control mode client.
   * Output events are emitted with `emitId` (the session ULID) as paneId,
   * so the renderer can match them to the correct terminal.
   */
  watchSession(sessionName: string, emitId: string): void {
    if (this.outputWatchers.has(sessionName)) return

    const proc = spawn('tmux', ['-C', 'attach-session', '-t', sessionName, '-r'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    })

    const sessionParser = new TmuxParser()
    const sessionDecoder = new StringDecoder('utf-8')
    sessionParser.onEvent((event: TmuxEvent) => {
      if (event.type === 'output') {
        // Remap tmux pane ID → session ULID for renderer matching
        this.batcher.push(emitId, event.data)
      }
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      sessionParser.feed(sessionDecoder.write(chunk))
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[TmuxManager] watcher stderr (${sessionName}):`, chunk.toString('utf-8').trim())
    })

    proc.on('exit', () => {
      this.outputWatchers.delete(sessionName)
    })

    this.outputWatchers.set(sessionName, { process: proc, parser: sessionParser })
  }

  /**
   * Stop watching a session's output.
   */
  unwatchSession(sessionName: string): void {
    const watcher = this.outputWatchers.get(sessionName)
    if (watcher) {
      watcher.process.kill()
      this.outputWatchers.delete(sessionName)
    }
  }

  disconnect(): void {
    // Kill all output watchers
    for (const [, watcher] of this.outputWatchers) {
      watcher.process.kill()
    }
    this.outputWatchers.clear()

    this.batcher.destroy()
    if (this.controlProcess) {
      this.controlProcess.kill()
      this.controlProcess = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  /**
   * Send a raw tmux command via control mode stdin.
   */
  private sendRaw(command: string): void {
    if (!this.controlProcess?.stdin?.writable) {
      throw new Error('tmux control mode not connected')
    }
    this.controlProcess.stdin.write(command + '\n')
  }

  /**
   * Execute a tmux command and wait for the response.
   * Returns the command output as a string.
   */
  async command(cmd: string): Promise<string> {
    // For now, simple fire-and-forget commands
    this.sendRaw(cmd)
    // TODO: implement proper begin/end response matching
    return ''
  }

  /**
   * Create a new tmux session (or window in the control session).
   */
  async createSession(name: string, opts?: {
    cwd?: string
    command?: string
    env?: Record<string, string>
    width?: number
    height?: number
  }): Promise<string> {
    const width = opts?.width ?? 80
    const height = opts?.height ?? 24
    const args = ['new-session', '-d', '-s', name, '-x', String(width), '-y', String(height), '-P', '-F', '#{session_id}']
    if (opts?.cwd) {
      args.push('-c', opts.cwd)
    }

    // Ensure 256-color support inside the session
    args.push('-e', 'TERM=xterm-256color')

    // Set env vars via -e flags (tmux 3.2+)
    if (opts?.env) {
      for (const [key, val] of Object.entries(opts.env)) {
        args.push('-e', `${key}=${val}`)
      }
    }

    const result = await runCommand('tmux', args)
    const sessionId = result.trim()

    // Send command via send-keys so the shell stays alive after command exits
    // Wait for shell to be ready before sending
    if (opts?.command) {
      await new Promise((r) => setTimeout(r, 500))
      await runCommand('tmux', ['send-keys', '-t', name, opts.command, 'Enter'])
    }

    return sessionId
  }

  /**
   * Kill a tmux session by name.
   */
  async killSession(name: string): Promise<void> {
    await runCommand('tmux', ['kill-session', '-t', name])
  }

  /**
   * List all tmux sessions.
   */
  async listSessions(): Promise<TmuxSessionInfo[]> {
    try {
      // Use tab separator instead of colon — session names can contain colons.
      const sep = '\t'
      const output = await runCommand('tmux', [
        'list-panes',
        '-a',
        '-F',
        `#{session_id}${sep}#{session_name}${sep}#{session_width}${sep}#{session_height}${sep}#{session_created}${sep}#{pane_current_path}${sep}#{pane_index}`,
      ])
      const seen = new Set<string>()
      const sessions: TmuxSessionInfo[] = []
      for (const line of output.split('\n')) {
        if (!line.trim()) continue
        const parts = line.split(sep)
        if (parts.length < 6) continue
        const [id, name, width, height, created, paneCwd] = parts
        if (!name) continue
        // Take first pane (index 0) per session for dedup
        if (seen.has(name)) continue
        seen.add(name)
        sessions.push({
          id,
          name,
          width: parseInt(width, 10),
          height: parseInt(height, 10),
          created: parseInt(created, 10),
          paneCwd: paneCwd || '',
        })
      }
      console.log(`[TmuxManager] listSessions found ${sessions.length} tmux sessions:`, sessions.map(s => s.name).join(', '))
      return sessions
    } catch (err) {
      console.warn('[TmuxManager] listSessions failed (no tmux server?):', err)
      return []
    }
  }

  /**
   * Send keystrokes to a tmux pane.
   *
   * Uses the existing Control Mode stdin when connected (no fork/exec per
   * keystroke). Encodes bytes as hex for `send-keys -H` so there is no
   * shell quoting and no ambiguity with special characters.
   */
  async sendKeys(target: string, keys: string): Promise<void> {
    if (!keys) return
    if (this.connected && this.controlProcess?.stdin?.writable) {
      const bytes = Buffer.from(keys, 'utf-8')
      if (bytes.length === 0) return
      const hex = bytes.toString('hex').match(/.{2}/g)!.join(' ')
      this.sendRaw(`send-keys -H -t ${target} ${hex}`)
      return
    }
    // Fallback when control mode isn't available
    await runCommand('tmux', ['send-keys', '-l', '-t', target, keys])
  }

  /**
   * Split a pane in a tmux session.
   */
  async splitPane(target: string, direction: 'horizontal' | 'vertical'): Promise<string> {
    const flag = direction === 'horizontal' ? '-h' : '-v'
    const result = await runCommand('tmux', ['split-window', flag, '-t', target, '-P', '-F', '#{pane_id}'])
    return result.trim()
  }

  /**
   * Resize a tmux pane.
   * Must resize the window first — panes cannot exceed their window dimensions.
   */
  async resizePane(target: string, cols: number, rows: number): Promise<void> {
    await runCommand('tmux', ['resize-window', '-t', target, '-x', String(cols), '-y', String(rows)])
    await runCommand('tmux', ['resize-pane', '-t', target, '-x', String(cols), '-y', String(rows)])
  }

  /**
   * Capture pane content.
   */
  async capturePane(target: string, lines?: number): Promise<string> {
    const args = ['capture-pane', '-t', target, '-p', '-e']
    if (lines) {
      args.push('-S', String(-lines))
    }
    return runCommand('tmux', args)
  }

  /**
   * Get the current command running in a tmux pane.
   * Returns the pane's current command (e.g. 'claude', 'zsh').
   */
  async getPaneCommand(target: string): Promise<string> {
    try {
      const result = await runCommand('tmux', [
        'display-message', '-t', target, '-p', '#{pane_current_command}',
      ])
      return result.trim()
    } catch {
      return ''
    }
  }

  private handleEvent(event: TmuxEvent): void {
    switch (event.type) {
      case 'output':
        this.batcher.push(event.paneId, event.data)
        break
      case 'begin':
        this.pendingCommands.set(event.number, {
          resolve: () => {},
          reject: () => {},
          buffer: [],
        })
        break
      case 'end': {
        const pending = this.pendingCommands.get(event.number)
        if (pending) {
          pending.resolve(pending.buffer.join('\n'))
          this.pendingCommands.delete(event.number)
        }
        break
      }
      case 'error': {
        const pendingErr = this.pendingCommands.get(event.number)
        if (pendingErr) {
          pendingErr.reject(new Error('tmux command error'))
          this.pendingCommands.delete(event.number)
        }
        break
      }
      case 'sessions-changed':
        this.emit('sessions-changed')
        break
      case 'session-changed':
        this.emit('session-changed', event.sessionId, event.name)
        break
      case 'exit':
        this.connected = false
        this.emit('exit', event.reason)
        break
    }
  }
}
