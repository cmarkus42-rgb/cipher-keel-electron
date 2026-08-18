/**
 * model-client — what every transport to a model looks like, whoever serves it.
 *
 * Niveau C started against Ollama alone, and the return contract never cared: a marked
 * block with named fields is transport-independent. What changes when an API vendor or a
 * hoster answers instead is only what sits behind this interface — which is why the
 * interface is named after the model rather than after Ollama.
 *
 * Config carries loose shapes so an existing file keeps working; `normaliseEndpoint` turns
 * them into the discriminated union the rest of the code sees. Looseness stays at the
 * boundary, where it belongs.
 *
 * Keys are never part of an endpoint. An endpoint names a *reference*, and
 * `api-keys.ts` resolves it — see the note there on why the keychain wins over the
 * environment.
 */

import { HttpOllamaClient } from './ollama-client'
import { OpenAiCompatibleClient } from './api-client'
import { AnthropicClient } from './anthropic-client'

/** The shape config may hold. Everything optional except the model. */
export interface RawEndpoint {
  kind?: 'ollama' | 'openai-compatible' | 'anthropic'
  host?: string
  port?: number
  baseUrl?: string
  /** Name under which the API key is stored. Never the key itself. */
  keyRef?: string
  model?: string
}

export interface OllamaEndpointSpec {
  kind: 'ollama'
  host: string
  port: number
  model: string
}

export interface OpenAiCompatibleEndpointSpec {
  kind: 'openai-compatible'
  baseUrl: string
  model: string
  keyRef: string
}

export interface AnthropicEndpointSpec {
  kind: 'anthropic'
  baseUrl: string
  model: string
  keyRef: string
}

/**
 * Where a request goes. `openai-compatible` covers far more than OpenAI — DeepSeek,
 * OpenRouter, Together, Fireworks, Groq, Mistral and vLLM all speak that dialect, and so
 * does Ollama's own `/v1` surface. `anthropic` is the first vendor with its own shape
 * (the Messages API); Google's generateContent would be the next member of this union,
 * not an exception to it.
 */
export type ModelEndpoint = OllamaEndpointSpec | OpenAiCompatibleEndpointSpec | AnthropicEndpointSpec

export const DEFAULT_OLLAMA_HOST = '127.0.0.1'
export const DEFAULT_OLLAMA_PORT = 11434

export interface GenerateRequest {
  prompt: string
  endpoint: ModelEndpoint
  timeoutMs?: number
  /**
   * Seconds to keep a local model resident. Ollama only — an API provider has nothing to
   * keep. Omitted, the Ollama transport pins the model, which is deliberate (see
   * ollama-client).
   */
  keepAliveSeconds?: number
}

/**
 * A chat call. `koerper` is already in the provider's wire form — the codec built it, and the
 * transport neither knows nor needs the canonical form. What comes back is the raw parsed
 * response, which the codec turns back into blocks.
 */
export interface ChatRequest {
  koerper: unknown
  endpoint: ModelEndpoint
  timeoutMs?: number
}

export interface ModelClient {
  /** Returns the model's response text. Throws with a described failure otherwise. */
  generate(req: GenerateRequest): Promise<string>
  chat(req: ChatRequest): Promise<unknown>
}

export function normaliseEndpoint(raw: RawEndpoint): ModelEndpoint {
  if (!raw.model) {
    throw new Error('Endpunkt ohne model — es muss benannt sein, welches Modell antworten soll')
  }

  const kind = raw.kind ?? 'ollama'

  if (kind === 'ollama') {
    return {
      kind: 'ollama',
      host: raw.host ?? DEFAULT_OLLAMA_HOST,
      port: raw.port ?? DEFAULT_OLLAMA_PORT,
      model: raw.model,
    }
  }

  if (kind === 'openai-compatible' || kind === 'anthropic') {
    // No default base URL on purpose: guessing one would send a prompt somewhere nobody
    // asked for, and the mistake would only surface as a strange answer.
    if (!raw.baseUrl) {
      throw new Error(
        `Endpunkt '${raw.model}' ist als ${kind} deklariert, nennt aber keine baseUrl`
      )
    }
    // An empty keyRef is a statement — "this endpoint needs no key", which is true for Ollama's
    // /v1 surface and for vLLM. An absent one is an omission and stays an error. This is the
    // difference `??` does not make, used deliberately.
    if (raw.keyRef === undefined) {
      throw new Error(
        `Endpunkt '${raw.model}' ist als ${kind} deklariert, nennt aber keinen keyRef`
      )
    }
    const gemeinsam = { baseUrl: raw.baseUrl.replace(/\/+$/, ''), model: raw.model, keyRef: raw.keyRef }
    return kind === 'anthropic' ? { kind: 'anthropic', ...gemeinsam } : { kind: 'openai-compatible', ...gemeinsam }
  }

  throw new Error(
    `Unbekannte Endpunkt-Art '${kind}' — bekannt sind ollama, openai-compatible, anthropic`
  )
}

/** A short, log-safe description. Never contains a key or a key reference. */
export function describeEndpoint(endpoint: ModelEndpoint): string {
  return endpoint.kind === 'ollama'
    ? `${endpoint.host}:${endpoint.port}`
    : endpoint.baseUrl
}

/**
 * Which of the two configured endpoints a caller means. Tagging is small and frequent and
 * stays where the notes are; worker jobs are large and occasional and belong on the
 * strongest machine — or on a vendor.
 */
export type LlmRole = 'tagging' | 'worker'

/**
 * The transport that serves this endpoint.
 *
 * Value imports of the clients live here while the clients import only *types* back, so
 * there is no import cycle at runtime. A new provider is a new case and a new module —
 * nothing else in the worker changes.
 */
export function clientForEndpoint(endpoint: ModelEndpoint): ModelClient {
  switch (endpoint.kind) {
    case 'ollama': return new HttpOllamaClient()
    case 'openai-compatible': return new OpenAiCompatibleClient()
    case 'anthropic': return new AnthropicClient()
  }
}
