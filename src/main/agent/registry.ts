/**
 * AdapterRegistry — config-based adapter lookup.
 *
 * Holds all known adapters. Default is claude-code.
 * Community adapters register themselves via register().
 *
 * Ported from cipher-mux 0.9.x (CK-INF-004).
 */

import type { AgentAdapter } from './agent-adapter'
import { ClaudeCodeAdapter, type AgentConfigReader } from './adapters/claude-code'

export class AdapterRegistry {
  private adapters: Map<string, AgentAdapter> = new Map()
  private defaultId = 'claude-code'

  constructor(configReader: AgentConfigReader) {
    const claude = new ClaudeCodeAdapter(configReader)
    this.adapters.set(claude.id, claude)
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id)
  }

  getDefault(): AgentAdapter {
    const adapter = this.adapters.get(this.defaultId)
    if (!adapter) throw new Error(`Default adapter '${this.defaultId}' not registered`)
    return adapter
  }

  listIds(): string[] {
    return Array.from(this.adapters.keys())
  }

  setDefault(id: string): void {
    if (!this.adapters.has(id)) throw new Error(`Adapter '${id}' not registered`)
    this.defaultId = id
  }

  /**
   * Known runtime values from PresetRahmen and their corresponding adapter IDs.
   * CK-ENT-010, CK-ENT-028
   */
  private static readonly RUNTIME_TO_ADAPTER_ID: ReadonlyMap<string, string> = new Map([
    ['claude-cli-tmux', 'claude-code'],
    ['nanoclaw-channel-route', 'nanoclaw-channel'],
  ])

  /**
   * Look up an adapter by the `runtime` field from a PresetRahmen.
   *
   * - Empty / undefined → returns the default adapter (ClaudeCodeAdapter)
   * - Known runtime value → returns the corresponding registered adapter
   * - Unknown runtime value → throws Error with the value; no silent fallback
   *
   * CK-ENT-010, CK-ENT-028
   */
  getForRuntime(runtime: string | undefined): AgentAdapter {
    if (!runtime) {
      return this.getDefault()
    }

    const adapterId = AdapterRegistry.RUNTIME_TO_ADAPTER_ID.get(runtime)
    if (adapterId === undefined) {
      throw new Error(
        `[AdapterRegistry] Unknown runtime value '${runtime}'. ` +
        `Known runtimes: ${[...AdapterRegistry.RUNTIME_TO_ADAPTER_ID.keys()].join(', ')}`
      )
    }

    const adapter = this.adapters.get(adapterId)
    if (!adapter) {
      throw new Error(
        `[AdapterRegistry] Adapter '${adapterId}' for runtime '${runtime}' is not registered`
      )
    }

    return adapter
  }
}
