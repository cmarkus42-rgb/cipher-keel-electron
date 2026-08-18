import { describe, it, expect } from 'vitest'
import { messagesUrl, describeAnthropicFailure } from '../../src/main/worker/anthropic-client'

const EP = {
  kind: 'anthropic' as const, baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-opus-5', keyRef: 'anthropic',
}

describe('anthropic-client', () => {
  it('haengt /messages an die Basis-URL', () => {
    expect(messagesUrl(EP)).toBe('https://api.anthropic.com/v1/messages')
  })

  it('nennt bei 401 die Schluesselursache, ohne den Schluesselnamen zu verraten', () => {
    const t = describeAnthropicFailure(401, '', EP)
    expect(t).toContain('api.anthropic.com')
    expect(t).not.toContain('anthropic-secret')
    expect(t).toMatch(/Schluessel|Schlüssel/)
  })

  it('nennt bei 404 das Modell', () => {
    expect(describeAnthropicFailure(404, '', EP)).toContain('claude-opus-5')
  })
})
