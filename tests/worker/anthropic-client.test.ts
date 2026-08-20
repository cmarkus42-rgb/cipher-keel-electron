import { describe, it, expect } from 'vitest'
import {
  messagesUrl,
  describeAnthropicFailure,
  buildMessagesBody,
  ANTHROPIC_DEFAULT_MAX_TOKENS,
} from '../../src/main/worker/anthropic-client'

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

describe('buildMessagesBody', () => {
  // max_tokens belongs to the codec — this is the property the fixed literal in the first
  // cut violated. A value the codec set has to survive the transport untouched.
  it('laesst ein vom Koerper mitgegebenes max_tokens den Transport ueberleben', () => {
    const body = JSON.parse(buildMessagesBody({ messages: [], max_tokens: 4096 }, EP)) as {
      max_tokens: number
    }
    expect(body.max_tokens).toBe(4096)
  })

  it('greift auf die Vorgabe zurueck, wenn der Koerper kein max_tokens nennt', () => {
    const body = JSON.parse(buildMessagesBody({ messages: [] }, EP)) as { max_tokens: number }
    expect(body.max_tokens).toBe(ANTHROPIC_DEFAULT_MAX_TOKENS)
  })

  // The endpoint's model is a transport fact, not a codec one — a stale or foreign model
  // name in the body must never quietly win.
  it('setzt immer das Modell aus dem Endpunkt, nie aus dem Koerper', () => {
    const body = JSON.parse(buildMessagesBody({ model: 'irgendein-anderes-modell' }, EP)) as {
      model: string
    }
    expect(body.model).toBe(EP.model)
  })
})
