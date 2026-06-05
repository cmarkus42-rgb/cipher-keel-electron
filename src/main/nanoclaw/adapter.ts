/**
 * NanoClawChannelAdapter — Peer of ClaudeCodeAdapter in the adapter garden.
 *
 * Implements AgentAdapter interface for NanoClaw integration via the
 * cipher-keel channel socket. Unlike ClaudeCodeAdapter (tmux-based),
 * this adapter communicates via JSON-Lines over a Unix-Domain-Socket.
 *
 * CK-S2-006: NanoClawChannelAdapter as peer
 * CK-S2-015: Does NOT start/stop NanoClaw daemon
 */

import type {
  AgentAdapter,
  LaunchCommand,
  LaunchOpts,
  AdapterContext,
  ProjectInstructions,
  SendOpts,
} from '../agent/agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../shared/types'
import type { NanoClawBridge } from './bridge'

export class NanoClawChannelAdapter implements AgentAdapter {
  readonly id = 'nanoclaw-channel'
  readonly displayName = 'NanoClaw'
  readonly tier = 'tier-2' as const

  private bridge: NanoClawBridge

  constructor(bridge: NanoClawBridge) {
    this.bridge = bridge
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * NanoClaw sessions are not launched via tmux — the daemon runs independently.
   * This returns a no-op command. The actual communication goes through the bridge.
   * CK-S2-015: cipher-keel does NOT start/stop NanoClaw.
   */
  buildLaunchCommand(_opts: LaunchOpts): LaunchCommand {
    return {
      cmd: 'echo',
      args: ['NanoClaw channel adapter — sessions managed by NanoClaw daemon'],
    }
  }

  // No postLaunchInjection — NanoClaw does not need MCP injection from cipher-keel.

  // --- project awareness ---------------------------------------------------

  getProjectMarkers(): string[] {
    // NanoClaw doesn't have a project marker file convention
    return []
  }

  async readProjectInstructions(_projectPath: string): Promise<ProjectInstructions | null> {
    return null
  }

  // --- runtime signals (capability-gated) ----------------------------------

  supports(feature: AdapterFeature): boolean {
    return this.getCapabilities()[feature] ?? false
  }

  getCapabilities(): AdapterCapabilities {
    return {
      'mcp-injection': false,
      'status-line': false,
      'skip-permissions': false,
      'sub-agents': false,
      'project-instructions': false,
      'message-bus-participant': true, // communicates via IPC channel
      'companion-mcp': false,
    }
  }

  // --- prompt delivery -----------------------------------------------------

  /**
   * Send a message to NanoClaw via the bridge socket (not tmux send-keys).
   * threadId is extracted from the tmuxTarget (pane name).
   */
  async sendPrompt(tmuxTarget: string, prompt: string, _opts?: SendOpts): Promise<void> {
    const threadId = tmuxTarget // pane name serves as thread ID
    const sent = this.bridge.sendMessage(prompt, threadId)
    if (!sent) {
      throw new Error('NanoClaw bridge is not connected — cannot send message')
    }
  }

  // --- prompt fragments ----------------------------------------------------

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session (NanoClaw)

NanoClaw-Sessions laufen ueber den cipher-keel-Channel.
Provider-Konfiguration via NanoClaw CLI (\`/add-ollama-provider\` empfohlen).
Kein Streaming — Antworten kommen als Einzel-Events.
`
    }
    return `### Worker Session (NanoClaw)

NanoClaw sessions run through the cipher-keel channel.
Provider configuration via NanoClaw CLI (\`/add-ollama-provider\` recommended).
No streaming — responses arrive as single events.
`
  }

  buildLauncherPromptFragment(_lang: 'de' | 'en'): string {
    return '' // NanoClaw sessions are not launched from the launcher
  }

  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session (NanoClaw)

NanoClaw-Worker nutzen den cipher-keel-Channel Socket.
Multi-Modell-Routing: verschiedene Agent-Groups koennen verschiedene Provider nutzen.
`
    }
    return `### Worker Session (NanoClaw)

NanoClaw workers use the cipher-keel channel socket.
Multi-model routing: different agent groups can use different providers.
`
  }

  // --- NanoClaw-specific helpers -------------------------------------------

  /**
   * Check if NanoClaw daemon is reachable (socket connected).
   */
  isAvailable(): boolean {
    return this.bridge.isConnected()
  }
}
