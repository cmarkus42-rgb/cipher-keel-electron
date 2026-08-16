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

  // keel-harness is valid per KNOWN_RUNTIMES (schema.ts) but has no entry in
  // RUNTIME_TO_ADAPTER_ID yet — the harness has not been built. getForRuntime must not
  // call this "unknown": that would send someone hunting for a typo in their preset
  // instead of learning the harness does not exist yet (found while fixing Task 9's
  // KNOWN_RUNTIMES / RUNTIME_TO_ADAPTER_ID mismatch).
  it('keel-harness is known but not yet built — throws the German "not built yet" message, not "unknown runtime"', () => {
    let message = ''
    try {
      makeRegistry().getForRuntime('keel-harness')
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/ist gültig, aber ihr Adapter ist noch nicht gebaut/)
    expect(message).not.toMatch(/Unknown runtime/)
  })

  // NanoClaw was superseded on 2026-08-16; `nanoclaw-channel-route` was the only known
  // runtime whose adapter was not auto-registered by the constructor, so it was the sole
  // vehicle for the "known runtime, adapter registered externally, resolves" branch of
  // getForRuntime(). Removing it from RUNTIME_TO_ADAPTER_ID (Task 9 of the model-registry
  // plan) leaves that branch without a reachable example through the public API —
  // claude-cli-tmux, the only mapped runtime left, always has its adapter present via the
  // constructor. Coverage for the sibling "known runtime, adapter never registered"
  // branch is restored above via keel-harness. Flagged for the later NanoClaw removal /
  // harness plan rather than papered over with a redundant or misleading test.
})
