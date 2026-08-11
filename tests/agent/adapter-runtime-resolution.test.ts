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

  it('resolves nanoclaw-channel-route to the NanoClaw adapter once registered', () => {
    expect(makeRegistry().getForRuntime('nanoclaw-channel-route').id).toBe('nanoclaw-channel')
  })

  it('falls back to the default adapter when runtime is empty (M2 section 11.4)', () => {
    expect(makeRegistry().getForRuntime('').id).toBe('claude-code')
  })

  it('throws on an unknown runtime instead of silently using Claude', () => {
    expect(() => makeRegistry().getForRuntime('made-up-runtime')).toThrow(/made-up-runtime/)
  })

  it('throws when the runtime is known but its adapter was never registered', () => {
    const bare = new AdapterRegistry({ getSkipPermissions: () => true })
    expect(() => bare.getForRuntime('nanoclaw-channel-route')).toThrow(/not registered/)
  })
})
