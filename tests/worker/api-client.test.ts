import { describe, it, expect } from 'vitest'
import {
  buildChatBody,
  extractChatText,
  describeApiFailure,
  chatCompletionsUrl,
} from '../../src/main/worker/api-client'
import {
  normaliseEndpoint,
  type OpenAiCompatibleEndpointSpec,
} from '../../src/main/worker/model-client'

function apiEndpoint(over: Record<string, unknown> = {}): OpenAiCompatibleEndpointSpec {
  const ep = normaliseEndpoint({
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3-coder',
    keyRef: 'openrouter',
    ...over,
  })
  if (ep.kind !== 'openai-compatible') throw new Error('unerwartete Endpunkt-Art im Test')
  return ep
}

const EP = apiEndpoint()

describe('chatCompletionsUrl', () => {
  it('appends the chat path to the configured base', () => {
    expect(chatCompletionsUrl(EP)).toBe('https://openrouter.ai/api/v1/chat/completions')
  })
})

describe('buildChatBody', () => {
  it('sends the prompt as a single user message', () => {
    const body = JSON.parse(buildChatBody('Tu etwas', EP))
    expect(body.model).toBe('qwen/qwen3-coder')
    expect(body.messages).toEqual([{ role: 'user', content: 'Tu etwas' }])
  })

  // The C worker reads one complete answer and checks it. A stream would have to be
  // reassembled before the contract could look at it, which buys nothing here.
  it('does not stream — the contract needs a whole answer', () => {
    expect(JSON.parse(buildChatBody('x', EP)).stream).toBe(false)
  })

  it('carries no keep_alive — an API provider has no model to keep resident', () => {
    expect('keep_alive' in JSON.parse(buildChatBody('x', EP))).toBe(false)
  })
})

describe('extractChatText', () => {
  it('reads the first choice', () => {
    const payload = JSON.stringify({ choices: [{ message: { content: '  hallo  ' } }] })
    expect(extractChatText(payload)).toBe('hallo')
  })

  it('returns an empty string when a provider answers without content', () => {
    expect(extractChatText(JSON.stringify({ choices: [{ message: {} }] }))).toBe('')
  })

  it('returns an empty string when there are no choices at all', () => {
    expect(extractChatText(JSON.stringify({ choices: [] }))).toBe('')
  })

  it('throws with the payload in view when the answer is not JSON', () => {
    expect(() => extractChatText('<html>502</html>')).toThrow(/502/)
  })
})

describe('describeApiFailure', () => {
  it('names a missing or wrong key on 401 without quoting it', () => {
    const msg = describeApiFailure(401, '{"error":{"message":"bad key"}}', EP)
    expect(msg).toContain('Schlüssel')
    expect(msg).toContain('openrouter.ai')
  })

  it('says quota or rate limit on 429', () => {
    expect(describeApiFailure(429, '', EP)).toMatch(/Rate|Kontingent/)
  })

  it('names an unknown model on 404', () => {
    const msg = describeApiFailure(404, '', EP)
    expect(msg).toContain('qwen/qwen3-coder')
  })

  it('passes the provider message through for anything else, trimmed', () => {
    const msg = describeApiFailure(500, '{"error":{"message":"upstream exploded"}}', EP)
    expect(msg).toContain('500')
    expect(msg).toContain('upstream exploded')
  })

  it('survives a non-JSON error body', () => {
    expect(describeApiFailure(503, 'Service Unavailable', EP)).toContain('503')
  })
})
