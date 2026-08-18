import { describe, it, expect } from 'vitest'
import {
  normaliseEndpoint,
  describeEndpoint,
  clientForEndpoint,
  type RawEndpoint,
} from '../../src/main/worker/model-client'

describe('normaliseEndpoint', () => {
  // Config carries loose shapes so an older file keeps working; the union is what the rest
  // of the code sees. Everything without a `kind` is the Ollama endpoint keel started with.
  it('treats an endpoint without a kind as Ollama', () => {
    const ep = normaliseEndpoint({ host: '127.0.0.1', port: 11434, model: 'gemma4:26b' })
    expect(ep.kind).toBe('ollama')
    if (ep.kind === 'ollama') {
      expect(ep.host).toBe('127.0.0.1')
      expect(ep.port).toBe(11434)
    }
  })

  it('fills Ollama defaults when host or port are missing', () => {
    const ep = normaliseEndpoint({ model: 'gemma4:26b' })
    if (ep.kind === 'ollama') {
      expect(ep.host).toBe('127.0.0.1')
      expect(ep.port).toBe(11434)
    }
  })

  it('recognises an OpenAI-compatible endpoint by its kind', () => {
    const ep = normaliseEndpoint({
      kind: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3-coder',
      keyRef: 'openrouter',
    })
    expect(ep.kind).toBe('openai-compatible')
    if (ep.kind === 'openai-compatible') {
      expect(ep.baseUrl).toBe('https://openrouter.ai/api/v1')
      expect(ep.keyRef).toBe('openrouter')
    }
  })

  it('strips a trailing slash from the base URL so paths never double up', () => {
    const ep = normaliseEndpoint({
      kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1/', model: 'x', keyRef: 'd',
    })
    if (ep.kind === 'openai-compatible') expect(ep.baseUrl).toBe('https://api.deepseek.com/v1')
  })

  // A missing baseUrl is a configuration error that must be named, not a silent fallback to
  // some default host — that would send a prompt somewhere nobody asked for.
  it('refuses an OpenAI-compatible endpoint without a base URL', () => {
    expect(() => normaliseEndpoint({
      kind: 'openai-compatible', model: 'x', keyRef: 'd',
    } as RawEndpoint)).toThrow(/baseUrl/)
  })

  it('refuses an OpenAI-compatible endpoint without a key reference', () => {
    expect(() => normaliseEndpoint({
      kind: 'openai-compatible', baseUrl: 'https://x/v1', model: 'x',
    } as RawEndpoint)).toThrow(/keyRef/)
  })

  it('refuses any endpoint without a model', () => {
    expect(() => normaliseEndpoint({ host: 'x' } as RawEndpoint)).toThrow(/model/)
  })

  it('rejects an unknown kind by name instead of guessing', () => {
    expect(() => normaliseEndpoint({ kind: 'telepathy', model: 'x' } as unknown as RawEndpoint))
      .toThrow(/telepathy/)
  })
})

describe('describeEndpoint', () => {
  it('names host and port for Ollama', () => {
    const text = describeEndpoint(normaliseEndpoint({ host: '10.0.0.1', port: 11434, model: 'm' }))
    expect(text).toContain('10.0.0.1:11434')
  })

  // The key must never appear — this string lands in error messages and logs.
  it('names the base URL for an API endpoint and never the key reference', () => {
    const text = describeEndpoint(normaliseEndpoint({
      kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x',
      keyRef: 'openai-secret-name',
    }))
    expect(text).toContain('api.openai.com')
    expect(text).not.toContain('openai-secret-name')
  })
})

describe('clientForEndpoint', () => {
  it('picks the Ollama transport for a local endpoint', () => {
    const client = clientForEndpoint(normaliseEndpoint({ model: 'gemma4:26b' }))
    expect(client.constructor.name).toBe('HttpOllamaClient')
  })

  it('picks the OpenAI-compatible transport for an API endpoint', () => {
    const client = clientForEndpoint(normaliseEndpoint({
      kind: 'openai-compatible', baseUrl: 'https://x/v1', model: 'm', keyRef: 'r',
    }))
    expect(client.constructor.name).toBe('OpenAiCompatibleClient')
  })
})

describe('keyRef als Aussage gegen keyRef als Versaeumnis', () => {
  it('nimmt einen leeren keyRef als "braucht keinen Schluessel" hin', () => {
    const ep = normaliseEndpoint({
      kind: 'openai-compatible', baseUrl: 'http://100.78.7.108:11434/v1', model: 'gemma4:26b', keyRef: '',
    })
    if (ep.kind === 'openai-compatible') expect(ep.keyRef).toBe('')
  })

  it('kennt den Anthropic-Endpunkt als dritte Art', () => {
    const ep = normaliseEndpoint({
      kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', keyRef: 'anthropic',
    })
    expect(ep.kind).toBe('anthropic')
  })

  it('gibt fuer den Anthropic-Endpunkt einen eigenen Transport', () => {
    const ep = normaliseEndpoint({
      kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'm', keyRef: 'a',
    })
    expect(clientForEndpoint(ep).constructor.name).toBe('AnthropicClient')
  })
})
