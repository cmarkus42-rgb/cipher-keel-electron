import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'

// makeRegistry() used to also register NanoClawChannelAdapter as a second Schenkel, but
// none of the tests below asserted anything about it — it only made the registry
// non-trivial. Removed with the NanoClaw subsystem (2026-08-17); the plain
// constructor-only registry below is behaviorally equivalent for every test here.
function makeRegistry(): AdapterRegistry {
  return new AdapterRegistry({ getStartArgs: () => [] })
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

  // keel-harness had no entry in RUNTIME_TO_ADAPTER_ID until the harness stretch's Task 4
  // landed the KeelHarnessAdapter (2026-08-23) — before that, this test asserted the
  // "valid but not built yet" throw below. That throw is gone now because the gap it
  // named is gone: RUNTIME_TO_ADAPTER_ID maps 'keel-harness' to the adapter the
  // constructor registers, so resolution succeeds like any other known runtime.
  it('resolves keel-harness to the KeelHarnessAdapter now that it is built', () => {
    expect(makeRegistry().getForRuntime('keel-harness').id).toBe('keel-harness')
  })

  // `keel-harness` (test above) now exercises the same resolving outcome as
  // `resolves claude-cli-tmux to the Claude adapter`: adapterId found in
  // RUNTIME_TO_ADAPTER_ID, adapter object present via the constructor, return it. It no
  // longer reaches the "valid but not built yet" branch — that branch has no known
  // runtime left to reach it through, since both entries in RUNTIME_TO_ADAPTER_ID now
  // have adapters.
  //
  // Exactly one branch of getForRuntime() remains uncovered: adapterId *found* in
  // RUNTIME_TO_ADAPTER_ID, but `this.adapters.get(adapterId)` missing — the "is not
  // registered" throw. `nanoclaw-channel-route` was the only known runtime whose adapter
  // was not auto-registered by the constructor, so it was the sole way to reach this
  // branch; removing it (Task 9 of the model-registry plan) leaves the branch
  // unreachable through the public API, since both current mappings (claude-cli-tmux,
  // keel-harness) always have their adapter present via the constructor. It becomes
  // reachable again once some future runtime gets a RUNTIME_TO_ADAPTER_ID mapping whose
  // adapter is not auto-registered by the constructor. Flagged for the harness plan
  // rather than papered over with a redundant or misleading test.
})
