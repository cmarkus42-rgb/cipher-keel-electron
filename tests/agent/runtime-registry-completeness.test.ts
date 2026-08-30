import { describe, it, expect } from 'vitest'
import { KNOWN_RUNTIMES } from '../../src/main/preset/schema'
import {
  RUNTIME_TO_ADAPTER_ID,
  RUNTIMES_WITHOUT_ADAPTER,
  AdapterRegistry,
} from '../../src/main/agent/registry'
import { istSchleifenAdapter } from '../../src/main/agent/agent-adapter'

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

// The same kind of drift, one layer down and with a credential attached. `postLaunchInjection`
// and `mcpEinspritzung` are two independently optional members: an adapter can write a bearer
// key into a project and say nothing about where, because TypeScript has no reason to object.
// The failure is silent in the worst way — SESSION_CREATE then has no trust sentence to show,
// so a session that quietly has no tools looks exactly like a healthy one, and a rollback
// message can only speak in generalities about a file it cannot name.
//
// Found by the review of b245386, which called it "eine echte, unabgesicherte Luecke, die ohne
// zusaetzlichen Test beim naechsten Harness lautlos wieder auftreten kann" and suggested
// closing it before the NEXT adapter rather than this one. It is closed here instead: this
// repository has four instances on record of something named as a later task and then not
// built (handleRequest, startStdioServer, postLaunchInjection, materialiseCapabilities), and
// a guard that costs ten lines does not belong on that list. No contract was touched for it.
describe('an adapter that injects MCP config also says where it wrote', () => {
  const registry = new AdapterRegistry({ getStartArgs: () => [] })

  it('every CLI adapter with postLaunchInjection describes it via mcpEinspritzung.ort', () => {
    const stumm = registry.listIds().filter((id) => {
      const adapter = registry.get(id)
      // Loop adapters run in-process and have neither member — the union says so, and asking
      // them would be the question this guard exists to keep honest, not an answer.
      if (!adapter || istSchleifenAdapter(adapter)) return false
      if (!adapter.postLaunchInjection) return false
      return !adapter.mcpEinspritzung?.ort?.trim()
    })
    expect(stumm).toEqual([])
  })

  it('no adapter describes an injection it does not perform', () => {
    const leereBehauptung = registry.listIds().filter((id) => {
      const adapter = registry.get(id)
      if (!adapter || istSchleifenAdapter(adapter)) return false
      return Boolean(adapter.mcpEinspritzung) && !adapter.postLaunchInjection
    })
    expect(leereBehauptung).toEqual([])
  })
})
