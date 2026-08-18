/**
 * anthropic-client — the Messages API, as the sibling module api-client.ts predicted.
 *
 * Different path, different auth header, different version header — but the same ModelClient.
 * Nothing else in the worker changes for it, which is the point of the interface.
 *
 * `generate` exists because the interface requires it and is deliberately not built: the
 * one-shot worker path has no reason to reach this provider, and a half-working second path
 * would be worse than a named refusal.
 */

import * as https from 'node:https'
import type { ChatRequest, GenerateRequest, ModelClient, AnthropicEndpointSpec } from './model-client'
import { resolveApiKey } from './api-keys'

export const ANTHROPIC_TIMEOUT_MS = 120_000
export const ANTHROPIC_VERSION = '2023-06-01'

export function messagesUrl(endpoint: AnthropicEndpointSpec): string {
  return `${endpoint.baseUrl}/messages`
}

export function describeAnthropicFailure(
  status: number, body: string, endpoint: AnthropicEndpointSpec,
): string {
  const where = new URL(endpoint.baseUrl).host
  let detail: string | null = null
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? null
  } catch { detail = null }

  if (status === 401 || status === 403) {
    return `${where} hat den Schluessel abgelehnt (HTTP ${status}) — hinterlegt ist er unter ` +
      `dem in der Config genannten Namen; siehe docs/anpassbare-flaechen.md`
  }
  if (status === 429) return `${where}: Rate-Limit oder Kontingent erschoepft (HTTP 429)`
  if (status === 404) return `${where} kennt das Modell '${endpoint.model}' nicht (HTTP 404)`
  return detail ? `${where} antwortete mit HTTP ${status}: ${detail}` : `${where} antwortete mit HTTP ${status}`
}

export class AnthropicClient implements ModelClient {
  generate(_req: GenerateRequest): Promise<string> {
    return Promise.reject(new Error(
      'Der Anthropic-Transport hat keinen generate-Weg — er bedient die Harness-Schleife ueber chat().',
    ))
  }

  async chat(req: ChatRequest): Promise<unknown> {
    if (req.endpoint.kind !== 'anthropic') {
      throw new Error('AnthropicClient wurde mit einem fremden Endpunkt aufgerufen')
    }
    const endpoint = req.endpoint
    const key = await resolveApiKey(endpoint.keyRef)
    if (!key) {
      throw new Error(
        `Fuer '${endpoint.model}' ist kein API-Schluessel hinterlegt — erwartet im Keychain ` +
        `oder als Umgebungsvariable; siehe docs/anpassbare-flaechen.md`
      )
    }

    const koerper = JSON.stringify({ ...(req.koerper as object), model: endpoint.model, max_tokens: 8192 })
    const url = new URL(messagesUrl(endpoint))

    return new Promise<unknown>((resolve, reject) => {
      const request = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(koerper),
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          timeout: req.timeoutMs ?? ANTHROPIC_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const payload = Buffer.concat(chunks).toString('utf-8')
            if (res.statusCode !== 200) {
              reject(new Error(describeAnthropicFailure(res.statusCode ?? 0, payload, endpoint)))
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
          `${url.host} hat die zugestandene Zeit von ${req.timeoutMs ?? ANTHROPIC_TIMEOUT_MS} ms ueberschritten`
        ))
      })
      request.write(koerper)
      request.end()
    })
  }
}
