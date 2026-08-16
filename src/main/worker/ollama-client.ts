/**
 * ollama-client — one request to a local model, no conversation.
 *
 * Lifted out of `notes/note-tagging.ts`, where it lived as a private `ollamaPost`. That
 * was fine while tagging was the only caller; the Niveau-C worker is the second, and two
 * HTTP paths to the same daemon would be one too many.
 *
 * It is now one transport among several behind `ModelClient` — the API path is the other.
 * Types come from `model-client` as *type-only* imports so the factory there can import
 * this module by value without a runtime cycle.
 *
 * Failures are described rather than thrown raw: which model, which host, which port.
 * A `describeMissingTool`-shaped message is the difference between "HTTP 404" and "that
 * model is not installed, pull it".
 */

import * as http from 'node:http'
import type {
  ModelClient,
  GenerateRequest,
  OllamaEndpointSpec,
} from './model-client'

/** A worker doing real work is not a tag call — the tagging path passes its own 60s. */
export const WORKER_TIMEOUT_MS = 120_000

/**
 * Seconds a model stays resident when a caller expresses no preference. Pinning is
 * intentional: a cold model makes the first request pay its whole load time, and that
 * latency lands on whoever addresses keel first. A caller sweeping models it will not keep
 * — a benchmark run — passes a finite value.
 */
export const DEFAULT_KEEP_ALIVE_SECONDS = -1

export function describeHttpFailure(status: number, endpoint: OllamaEndpointSpec): string {
  if (status === 404) {
    return `Modell '${endpoint.model}' ist auf ${endpoint.host}:${endpoint.port} nicht ` +
      `installiert — mit 'ollama pull ${endpoint.model}' laden`
  }
  return `Ollama auf ${endpoint.host}:${endpoint.port} antwortete mit HTTP ${status}`
}

export function describeTransportFailure(err: unknown, endpoint: OllamaEndpointSpec): string {
  const code = (err as { code?: string } | null)?.code
  const where = `${endpoint.host}:${endpoint.port}`
  if (code === 'ECONNREFUSED' || code === 'ENOENT') {
    return `Ollama ist auf ${where} nicht erreichbar`
  }
  if (code === 'ETIMEDOUT') {
    return `Ollama auf ${where} hat die zugestandene Zeit überschritten`
  }
  const msg = err instanceof Error ? err.message : String(err)
  return `Ollama auf ${where}: ${msg}`
}

/**
 * The request body Ollama receives. Pure so the keep-alive decision is testable without
 * a daemon — it is the one field with a consequence beyond the call itself.
 */
export function buildRequestBody(
  prompt: string,
  endpoint: OllamaEndpointSpec,
  keepAliveSeconds: number | undefined,
): string {
  return JSON.stringify({
    model: endpoint.model,
    prompt,
    stream: false,
    keep_alive: keepAliveSeconds ?? DEFAULT_KEEP_ALIVE_SECONDS,
  })
}

export class HttpOllamaClient implements ModelClient {
  generate(req: GenerateRequest): Promise<string> {
    if (req.endpoint.kind !== 'ollama') {
      return Promise.reject(
        new Error('HttpOllamaClient wurde mit einem fremden Endpunkt aufgerufen')
      )
    }
    const endpoint = req.endpoint
    const timeoutMs = req.timeoutMs ?? WORKER_TIMEOUT_MS
    const body = buildRequestBody(req.prompt, endpoint, req.keepAliveSeconds)

    return new Promise<string>((resolve, reject) => {
      const request = http.request(
        {
          hostname: endpoint.host,
          port: endpoint.port,
          path: '/api/generate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(describeHttpFailure(res.statusCode ?? 0, endpoint)))
              return
            }
            const payload = Buffer.concat(chunks).toString('utf-8')
            try {
              const data = JSON.parse(payload) as { response?: string }
              resolve((data.response ?? '').trim())
            } catch {
              reject(new Error(`Ollama lieferte kein verwertbares JSON: ${payload.slice(0, 200)}`))
            }
          })
        },
      )
      request.on('error', (err) => reject(new Error(describeTransportFailure(err, endpoint))))
      request.on('timeout', () => {
        request.destroy()
        reject(new Error(
          `Ollama auf ${endpoint.host}:${endpoint.port} hat die zugestandene Zeit ` +
          `von ${timeoutMs} ms überschritten`
        ))
      })
      request.write(body)
      request.end()
    })
  }
}
