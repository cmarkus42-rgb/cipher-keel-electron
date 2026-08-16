import { describe, it, expect } from 'vitest'
import { validatePresetRahmen } from '../../src/main/preset/schema'

// Required fields are id, name, rollenTyp, capabilityNiveau — everything else is optional,
// so a fixture only needs those four plus the runtime under test.
function rahmen(runtime: string) {
  return {
    id: 'probe',
    name: 'Probe',
    rollenTyp: 'beauftragte-instanz',
    capabilityNiveau: 'A',
    runtime,
  }
}

/** validatePresetRahmen collects errors, it does not throw. Look at the runtime field only. */
const runtimeErrors = (runtime: string) =>
  validatePresetRahmen(rahmen(runtime)).errors.filter(e => e.field === 'runtime')

describe('KNOWN_RUNTIMES after the NanoClaw supersession', () => {
  it('accepts the own harness as the third runtime (M8 section 11)', () => {
    expect(runtimeErrors('keel-harness')).toEqual([])
  })

  it('still accepts the CLI path', () => {
    expect(runtimeErrors('claude-cli-tmux')).toEqual([])
  })

  it('rejects nanoclaw-channel-route — superseded on 2026-08-16', () => {
    const errs = runtimeErrors('nanoclaw-channel-route')
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toMatch(/Unknown runtime/)
  })
})
