/**
 * ollama-client — one request to a local model, no conversation.
 *
 * Lifted out of `notes/note-tagging.ts`, where it lived as a private `ollamaPost`. That
 * was fine while tagging was the only caller; the Niveau-C worker is the second, and two
 * HTTP paths to the same daemon would be one too many.
 *
 * Two callers, two endpoints, two profiles: tagging is small and frequent and stays on the
 * local daemon; a worker job is large and occasional and belongs on the strongest machine
 * available. `role` picks between them, and either can be overridden per request.
 *
 * Failures are described rather than thrown raw: which model, which host, which port.
 * A `describeMissingTool`-shaped message is the difference between "HTTP 404" and "that
 * model is not installed, pull it".
 */

import * as http from 'node:http'
import { configStore } from '../config/config-store'

/** A worker doing real work is not a tag call — the tagging path keeps its own 60s. */
export const WORKER_TIMEOUT_MS = 120_000

export interface OllamaEndpoint {
  host: string
  port: number
  model: string
}

/**
 * Which of the two configured endpoints a request uses. Tagging is small and frequent and
 * stays local; worker jobs are large and occasional and belong on the strongest machine.
 */
export type LlmRole = 'tagging' | 'worker'

export interface GenerateRequest {
  prompt: string
  /** Picks the configured endpoint. Defaults to the worker's. */
  role?: LlmRole
  /** Overrides parts of the configured endpoint — e.g. a different host or model. */
  endpoint?: Partial<OllamaEndpoint>
  timeoutMs?: number
  /**
   * Seconds to keep the model resident after answering. Defaults to `-1`, which pins it
   * indefinitely — deliberate, and the reason is latency: the first request against a
   * cold model pays the whole load time, and OpenClaw addressing keel should not wait for
   * that. Pass a finite value only where a caller sweeps models it does not intend to
   * keep, such as a benchmark run.
   */
  keepAliveSeconds?: number
}

export interface OllamaClient {
  /** Returns the model's response text. Throws with a described failure otherwise. */
  generate(req: GenerateRequest): Promise<string>
}

/**
 * The endpoint from config, which is what a caller gets without an override.
 *
 * `llm` is a typed section of CipherKeelConfig rather than an untyped pass-through, and
 * that was a deliberate correction carried over from note-tagging: `loadConfig()`
 * deep-merges the on-disk JSON over the defaults and copies every key from the user's
 * file, so a hand-added `llm` section always produced real overrides. Typing it kept that
 * working capability while putting it under the typecheck gate.
 */
export function configuredEndpoint(role: LlmRole = 'worker'): OllamaEndpoint {
  const llm = configStore.get('llm')
  return { ...llm[role] }
}

export function resolveEndpoint(
  override: Partial<OllamaEndpoint> | undefined,
  base: OllamaEndpoint,
): OllamaEndpoint {
  return {
    host: override?.host ?? base.host,
    port: override?.port ?? base.port,
    model: override?.model ?? base.model,
  }
}

export function describeHttpFailure(status: number, endpoint: OllamaEndpoint): string {
  if (status === 404) {
    return `Modell '${endpoint.model}' ist auf ${endpoint.host}:${endpoint.port} nicht ` +
      `installiert — mit 'ollama pull ${endpoint.model}' laden`
  }
  return `Ollama auf ${endpoint.host}:${endpoint.port} antwortete mit HTTP ${status}`
}

export function describeTransportFailure(err: unknown, endpoint: OllamaEndpoint): string {
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
 * Seconds a model stays resident when a caller expresses no preference. Pinning is
 * intentional: a cold model makes the first request pay its whole load time, and that
 * latency lands on whoever addresses keel first.
 */
export const DEFAULT_KEEP_ALIVE_SECONDS = -1

/**
 * The request body Ollama receives. Pure so the keep-alive decision is testable without
 * a daemon — it is the one field with a consequence beyond the call itself.
 */
export function buildRequestBody(
  prompt: string,
  endpoint: OllamaEndpoint,
  keepAliveSeconds: number | undefined,
): string {
  return JSON.stringify({
    model: endpoint.model,
    prompt,
    stream: false,
    keep_alive: keepAliveSeconds ?? DEFAULT_KEEP_ALIVE_SECONDS,
  })
}

export class HttpOllamaClient implements OllamaClient {
  generate(req: GenerateRequest): Promise<string> {
    const endpoint = resolveEndpoint(req.endpoint, configuredEndpoint(req.role ?? 'worker'))
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
