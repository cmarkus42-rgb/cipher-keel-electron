/**
 * api-client — the OpenAI-compatible transport.
 *
 * One dialect reaches most of the field: OpenAI, DeepSeek, OpenRouter, Together,
 * Fireworks, Groq, Mistral, xAI, vLLM — and Ollama's own `/v1` surface. Vendors with their
 * own shape (Anthropic's Messages API, Google's generateContent) get sibling modules
 * implementing the same `ModelClient`; nothing here needs to change for them.
 *
 * The pure parts — URL, body, extraction, failure description — are exported separately so
 * the decisions in them are testable without a network. What is left in the class is the
 * HTTPS plumbing.
 *
 * Failures are described rather than passed through raw. A 401 is almost always a missing
 * or wrong key, and saying so beats "HTTP 401" — but the key itself, and even the name it
 * is stored under, never appear in a message that may end up in a log.
 */

import * as https from 'node:https'
import * as http from 'node:http'
import type {
  ModelClient,
  GenerateRequest,
  ChatRequest,
  OpenAiCompatibleEndpointSpec,
} from './model-client'
import { resolveApiKey } from './api-keys'

/** Same budget as a local worker job — an API answer is not faster for being remote. */
export const API_TIMEOUT_MS = 120_000

export function chatCompletionsUrl(endpoint: OpenAiCompatibleEndpointSpec): string {
  return `${endpoint.baseUrl}/chat/completions`
}

export function buildChatBody(prompt: string, endpoint: OpenAiCompatibleEndpointSpec): string {
  return JSON.stringify({
    model: endpoint.model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  })
}

export function extractChatText(payload: string): string {
  let parsed: { choices?: Array<{ message?: { content?: string } }> }
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new Error(`Antwort ist kein verwertbares JSON: ${payload.slice(0, 200)}`)
  }
  return (parsed.choices?.[0]?.message?.content ?? '').trim()
}

/** Reads the provider's own message out of an error body, if it left one. */
function providerMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return parsed.error?.message ?? null
  } catch {
    return null
  }
}

export function describeApiFailure(
  status: number,
  body: string,
  endpoint: OpenAiCompatibleEndpointSpec,
): string {
  const where = new URL(endpoint.baseUrl).host
  const detail = providerMessage(body)

  if (status === 401 || status === 403) {
    return `${where} hat den Schlüssel abgelehnt (HTTP ${status}) — hinterlegt ist er unter ` +
      `dem in der Config genannten Namen; siehe docs/anpassbare-flaechen.md`
  }
  if (status === 429) {
    return `${where}: Rate-Limit oder Kontingent erschöpft (HTTP 429)`
  }
  if (status === 404) {
    return `${where} kennt das Modell '${endpoint.model}' nicht (HTTP 404)`
  }
  return detail
    ? `${where} antwortete mit HTTP ${status}: ${detail}`
    : `${where} antwortete mit HTTP ${status}`
}

export class OpenAiCompatibleClient implements ModelClient {
  async generate(req: GenerateRequest): Promise<string> {
    if (req.endpoint.kind !== 'openai-compatible') {
      throw new Error('OpenAiCompatibleClient wurde mit einem fremden Endpunkt aufgerufen')
    }
    const endpoint = req.endpoint
    // An empty keyRef means the endpoint needs no key — Ollama's /v1 surface and vLLM. A named
    // keyRef that resolves to nothing stays a named failure. Same rule as chat() below; this
    // method used to call resolveApiKey('') unconditionally and throw "kein API-Schlüssel
    // hinterlegt" for exactly the endpoints that declared they need none — every local-http
    // entry with codec: 'openai-chat' routing a one-shot role (note tagging) through generate().
    const key = endpoint.keyRef === '' ? null : await resolveApiKey(endpoint.keyRef)
    if (endpoint.keyRef !== '' && !key) {
      throw new Error(
        `Für '${endpoint.model}' ist kein API-Schlüssel hinterlegt — erwartet im Keychain ` +
        `oder als Umgebungsvariable; siehe docs/anpassbare-flaechen.md`
      )
    }

    const body = buildChatBody(req.prompt, endpoint)
    const url = new URL(chatCompletionsUrl(endpoint))
    const transport = url.protocol === 'http:' ? http : https
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }
    if (key) headers.Authorization = `Bearer ${key}`

    return new Promise<string>((resolve, reject) => {
      const request = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'http:' ? 80 : 443),
          path: url.pathname + url.search,
          method: 'POST',
          headers,
          timeout: req.timeoutMs ?? API_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const payload = Buffer.concat(chunks).toString('utf-8')
            if (res.statusCode !== 200) {
              reject(new Error(describeApiFailure(res.statusCode ?? 0, payload, endpoint)))
              return
            }
            try {
              resolve(extractChatText(payload))
            } catch (err) {
              reject(err instanceof Error ? err : new Error(String(err)))
            }
          })
        },
      )
      request.on('error', (err) => reject(
        new Error(`${url.host} ist nicht erreichbar: ${err.message}`)
      ))
      request.on('timeout', () => {
        request.destroy()
        reject(new Error(
          `${url.host} hat die zugestandene Zeit von ${req.timeoutMs ?? API_TIMEOUT_MS} ms ` +
          `überschritten`
        ))
      })
      request.write(body)
      request.end()
    })
  }

  async chat(req: ChatRequest): Promise<unknown> {
    if (req.endpoint.kind !== 'openai-compatible') {
      throw new Error('OpenAiCompatibleClient wurde mit einem fremden Endpunkt aufgerufen')
    }
    const endpoint = req.endpoint
    // An empty keyRef means the endpoint needs no key — Ollama's /v1 surface and vLLM. A named
    // keyRef that resolves to nothing stays a named failure.
    const key = endpoint.keyRef === '' ? null : await resolveApiKey(endpoint.keyRef)
    if (endpoint.keyRef !== '' && !key) {
      throw new Error(
        `Für '${endpoint.model}' ist kein API-Schlüssel hinterlegt — erwartet im Keychain ` +
        `oder als Umgebungsvariable; siehe docs/anpassbare-flaechen.md`
      )
    }

    const body = JSON.stringify({ ...(req.koerper as object), model: endpoint.model })
    const url = new URL(chatCompletionsUrl(endpoint))
    const transport = url.protocol === 'http:' ? http : https
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }
    if (key) headers.Authorization = `Bearer ${key}`

    return new Promise<unknown>((resolve, reject) => {
      const request = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'http:' ? 80 : 443),
          path: url.pathname + url.search,
          method: 'POST',
          headers,
          timeout: req.timeoutMs ?? API_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const payload = Buffer.concat(chunks).toString('utf-8')
            if (res.statusCode !== 200) {
              reject(new Error(describeApiFailure(res.statusCode ?? 0, payload, endpoint)))
              return
            }
            try { resolve(JSON.parse(payload)) }
            catch { reject(new Error(`Antwort ist kein verwertbares JSON: ${payload.slice(0, 200)}`)) }
          })
        },
      )
      request.on('error', (err) => reject(new Error(`${url.host} ist nicht erreichbar: ${err.message}`)))
      request.on('timeout', () => {
        request.destroy()
        reject(new Error(
          `${url.host} hat die zugestandene Zeit von ${req.timeoutMs ?? API_TIMEOUT_MS} ms ueberschritten`
        ))
      })
      request.write(body)
      request.end()
    })
  }
}
