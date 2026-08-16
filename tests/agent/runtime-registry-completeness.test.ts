import { describe, it, expect } from 'vitest'
import { KNOWN_RUNTIMES } from '../../src/main/preset/schema'
import { RUNTIME_TO_ADAPTER_ID, RUNTIMES_WITHOUT_ADAPTER } from '../../src/main/agent/registry'

// Two lists that would otherwise drift independently: the schema's set of valid runtime
// values (KNOWN_RUNTIMES) and the registry's runtime-to-adapter map
// (RUNTIME_TO_ADAPTER_ID). A runtime can be valid without a live adapter yet — that is
// fine, but only when it is named on RUNTIMES_WITHOUT_ADAPTER. Silence about the gap is
// exactly what produced a false "unknown runtime" error for `keel-harness` (Task 9 of the
// model-registry plan): it was valid per the schema but simply missing from the adapter
// map, and getForRuntime could not tell "invalid" from "not built yet" apart. This guard
// keeps that distinction honest as both lists change.
describe('KNOWN_RUNTIMES / RUNTIME_TO_ADAPTER_ID / RUNTIMES_WITHOUT_ADAPTER stay in sync', () => {
  it('every known runtime has either an adapter mapping or a declared pending entry', () => {
    const uncovered = [...KNOWN_RUNTIMES].filter(
      (r) => !RUNTIME_TO_ADAPTER_ID.has(r) && !RUNTIMES_WITHOUT_ADAPTER.has(r)
    )
    expect(uncovered).toEqual([])
  })

  it('no runtime is both mapped and marked pending at the same time', () => {
    const overlap = [...RUNTIMES_WITHOUT_ADAPTER].filter((r) => RUNTIME_TO_ADAPTER_ID.has(r))
    expect(overlap).toEqual([])
  })

  it('RUNTIMES_WITHOUT_ADAPTER only names values the schema actually knows', () => {
    const stale = [...RUNTIMES_WITHOUT_ADAPTER].filter((r) => !KNOWN_RUNTIMES.has(r))
    expect(stale).toEqual([])
  })

  it('every adapter-mapped runtime is a value the schema actually knows', () => {
    const orphaned = [...RUNTIME_TO_ADAPTER_ID.keys()].filter((r) => !KNOWN_RUNTIMES.has(r))
    expect(orphaned).toEqual([])
  })
})
