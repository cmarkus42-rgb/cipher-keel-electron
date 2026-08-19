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
import { KNOWN_RUNTIMES } from '../preset/schema'

/**
 * Known runtime values from PresetRahmen and their corresponding adapter IDs.
 * Exported (not a class member) so the guard test in
 * tests/agent/runtime-registry-completeness.test.ts can check it against KNOWN_RUNTIMES
 * and RUNTIMES_WITHOUT_ADAPTER without reaching into class internals.
 * CK-ENT-010, CK-ENT-028
 */
export const RUNTIME_TO_ADAPTER_ID: ReadonlyMap<string, string> = new Map([
  ['claude-cli-tmux', 'claude-code'],
])

/**
 * Runtime values that KNOWN_RUNTIMES (src/main/preset/schema.ts) accepts as valid but
 * that have no entry in RUNTIME_TO_ADAPTER_ID yet. Declared explicitly so the gap between
 * "valid preset value" and "resolvable adapter" is an intentional, named fact rather than
 * an accident that getForRuntime would otherwise mask with a false "unknown runtime" error.
 *
 * The own loop exists since the harness stretch of 2026-08-18, but no adapter starts a session
 * through it: that needs writing tools and a shell, which travel with the sandbox. Until then
 * 'keel-harness' is a known runtime without a live adapter, and no slot in model/slots.ts
 * offers it — a slot before its adapter would be a surface for a dummy. If the adapter lands
 * in a later stretch, this entry falls with it.
 *
 * When an adapter for one of these lands, add it to RUNTIME_TO_ADAPTER_ID and remove it
 * from here — the guard test in tests/agent/runtime-registry-completeness.test.ts fails
 * if a value is in both, or in neither, of RUNTIME_TO_ADAPTER_ID and this list.
 */
export const RUNTIMES_WITHOUT_ADAPTER: ReadonlySet<string> = new Set(['keel-harness'])

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
   * Look up an adapter by the `runtime` field from a PresetRahmen.
   *
   * - Empty / undefined → returns the default adapter (ClaudeCodeAdapter)
   * - Known runtime value → returns the corresponding registered adapter
   * - Known runtime value with no adapter yet (RUNTIMES_WITHOUT_ADAPTER) → throws a
   *   German, user-facing error saying so — this is not the same as "unknown"
   * - Unknown runtime value → throws Error with the value; no silent fallback
   *
   * CK-ENT-010, CK-ENT-028
   */
  getForRuntime(runtime: string | undefined): AgentAdapter {
    if (!runtime) {
      return this.getDefault()
    }

    const adapterId = RUNTIME_TO_ADAPTER_ID.get(runtime)
    if (adapterId === undefined) {
      // Known to the schema but not yet in RUNTIME_TO_ADAPTER_ID — the guard test keeps
      // this equivalent to RUNTIMES_WITHOUT_ADAPTER.has(runtime); KNOWN_RUNTIMES is the
      // one checked here since it is the authoritative "is this a real runtime" answer.
      if (KNOWN_RUNTIMES.has(runtime)) {
        throw new Error(
          `Die Laufzeit '${runtime}' ist gültig, aber ihr Adapter ist noch nicht gebaut — ` +
          `das eigene Harness kommt in einem späteren Schritt.`
        )
      }
      throw new Error(
        `[AdapterRegistry] Unknown runtime value '${runtime}'. ` +
        // Sourced from KNOWN_RUNTIMES, not RUNTIME_TO_ADAPTER_ID.keys() — a mistyping
        // user needs every schema-valid value here, including ones without an adapter
        // yet (those still resolve to the clearer "not built yet" branch above; this
        // list only exists to help someone who typed something not on it at all).
        `Known runtimes: ${[...KNOWN_RUNTIMES].join(', ')}`
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
