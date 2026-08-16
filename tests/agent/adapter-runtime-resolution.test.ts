import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { NanoClawChannelAdapter } from '../../src/main/nanoclaw/adapter'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'

function makeRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry({ getSkipPermissions: () => true })
  registry.register(new NanoClawChannelAdapter(new NanoClawBridge('/tmp/nope.sock')))
  return registry
}

// The Rahmen's `runtime` field declares which harness an entity runs on (M2 section
// 11.4). Until this was wired, session:create called getDefault() and ignored the field
// entirely — a preset asking for NanoClaw would have started a Claude session with no
// error at all.
describe('runtime to adapter resolution', () => {
  it('resolves claude-cli-tmux to the Claude adapter', () => {
    expect(makeRegistry().getForRuntime('claude-cli-tmux').id).toBe('claude-code')
  })

  it('falls back to the default adapter when runtime is empty (M2 section 11.4)', () => {
    expect(makeRegistry().getForRuntime('').id).toBe('claude-code')
  })

  it('throws on an unknown runtime instead of silently using Claude', () => {
    expect(() => makeRegistry().getForRuntime('made-up-runtime')).toThrow(/made-up-runtime/)
  })

  // NanoClaw was superseded on 2026-08-16; `nanoclaw-channel-route` was the only known
  // runtime whose adapter was not auto-registered by the constructor, so it was the sole
  // vehicle for two branches of getForRuntime(): "known runtime, adapter registered
  // externally" and "known runtime, adapter never registered". Removing it from
  // RUNTIME_TO_ADAPTER_ID (Task 9 of the model-registry plan) leaves both branches without
  // a reachable example through the public API — claude-cli-tmux, the only runtime left,
  // always has its adapter present. Coverage for those two branches is gone until a
  // replacement runtime (e.g. keel-harness, once it gets an adapter mapping) restores a
  // known-but-not-always-registered case. Flagged for the later NanoClaw removal / harness
  // plan rather than papered over with a redundant or misleading test.
})
