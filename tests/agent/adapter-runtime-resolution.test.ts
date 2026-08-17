import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'

// makeRegistry() used to also register NanoClawChannelAdapter as a second Schenkel, but
// none of the tests below asserted anything about it — it only made the registry
// non-trivial. Removed with the NanoClaw subsystem (2026-08-17); the plain
// constructor-only registry below is behaviorally equivalent for every test here.
function makeRegistry(): AdapterRegistry {
  return new AdapterRegistry({ getSkipPermissions: () => true })
}

// The Rahmen's `runtime` field declares which harness an entity runs on (M2 section
// 11.4). Until this was wired, session:create called getDefault() and ignored the field
// entirely — a preset asking for a non-default runtime would have started a Claude
// session with no error at all.
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

  // `keel-harness` (test above) exercises the "known runtime, no RUNTIME_TO_ADAPTER_ID
  // mapping" path — the one that reports it is not built yet. It does not touch the
  // resolving outcome (adapterId found, adapter object present, return it): that outcome
  // is a single path regardless of whether the adapter reached `this.adapters` via the
  // constructor or an external `register()` call, and it is already covered by
  // `resolves claude-cli-tmux to the Claude adapter` above.
  //
  // Exactly one branch of getForRuntime() remains uncovered: adapterId *found* in
  // RUNTIME_TO_ADAPTER_ID, but `this.adapters.get(adapterId)` missing — the "is not
  // registered" throw. `nanoclaw-channel-route` was the only known runtime whose adapter
  // was not auto-registered by the constructor, so it was the sole way to reach this
  // branch; removing it (Task 9 of the model-registry plan) leaves the branch
  // unreachable through the public API, since claude-cli-tmux — the only mapping left —
  // always has its adapter present via the constructor. It becomes reachable again once
  // some future runtime gets a RUNTIME_TO_ADAPTER_ID mapping whose adapter is not
  // auto-registered by the constructor. Flagged for the harness plan rather than papered
  // over with a redundant or misleading test.
})
