import { describe, it, expect } from 'vitest'
import { resolveModel } from '../../src/main/session/model-resolver'

const TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'opus' }

// M2 sections 5.3 and 6.3 define two forms for the Rahmen's model field: a tier label on
// Schenkel 1, a provider:model handle on Schenkel 2. Before this, session:create dropped
// the field entirely because 'heavy' maps to no model id — so every session ran on the
// harness default and the gradient the presets express was never applied.
describe('resolveModel', () => {
  it('maps a tier label to the configured handle', () => {
    expect(resolveModel('heavy', TIERS)).toBe('opus')
    expect(resolveModel('standard', TIERS)).toBe('sonnet')
    expect(resolveModel('light', TIERS)).toBe('haiku')
  })

  it('passes a provider:model handle through verbatim (Schenkel 2, M2 6.3)', () => {
    expect(resolveModel('ollama:gemma3:27b', TIERS)).toBe('ollama:gemma3:27b')
    expect(resolveModel('anthropic:claude-opus-4', TIERS)).toBe('anthropic:claude-opus-4')
  })

  it('returns undefined for an empty model field — harness default', () => {
    expect(resolveModel('', TIERS)).toBeUndefined()
  })

  it('returns undefined when the tier maps to an empty handle', () => {
    expect(resolveModel('heavy', { light: '', standard: '', heavy: '' })).toBeUndefined()
  })

  it('returns undefined for an unknown tier rather than passing it through', () => {
    expect(resolveModel('gigantic', TIERS)).toBeUndefined()
  })
})

describe('resolveModel with a registry lookup', () => {
  it('prefers the registry handle over the configured tier value', () => {
    const lookup = (t: string) => (t === 'heavy' ? 'opus-aus-registry' : undefined)
    expect(resolveModel('heavy', TIERS, lookup)).toBe('opus-aus-registry')
  })

  it('falls back to the tier value when the registry has no assignment', () => {
    expect(resolveModel('heavy', TIERS, () => undefined)).toBe('opus')
  })

  it('behaves exactly as before when no lookup is passed', () => {
    expect(resolveModel('heavy', TIERS)).toBe('opus')
  })

  it('never consults the registry for a provider-qualified handle', () => {
    const lookup = () => { throw new Error('lookup must not be called') }
    expect(resolveModel('ollama:gemma4:26b', TIERS, lookup)).toBe('ollama:gemma4:26b')
  })
})
