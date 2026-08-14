import { describe, it, expect } from 'vitest'
import {
  resolveEndpoint,
  describeHttpFailure,
  describeTransportFailure,
  WORKER_TIMEOUT_MS,
  buildRequestBody,
  DEFAULT_KEEP_ALIVE_SECONDS,
} from '../../src/main/worker/ollama-client'

const BASE = { host: '127.0.0.1', port: 11434, model: 'qwen3:30b' }

describe('resolveEndpoint', () => {
  it('returns the base when nothing is overridden', () => {
    expect(resolveEndpoint(undefined, BASE)).toEqual(BASE)
  })

  it('overrides only what is given — a second machine is a host, not a new config', () => {
    expect(resolveEndpoint({ host: '100.64.0.5' }, BASE)).toEqual({
      host: '100.64.0.5', port: 11434, model: 'qwen3:30b',
    })
  })

  it('overrides the model alone, which is what a benchmark run needs', () => {
    expect(resolveEndpoint({ model: 'gemma4:26b' }, BASE).model).toBe('gemma4:26b')
  })
})

describe('describeHttpFailure', () => {
  it('names the model and the pull command on 404 — the usual cause is a missing model', () => {
    const msg = describeHttpFailure(404, BASE)
    expect(msg).toContain('qwen3:30b')
    expect(msg).toContain('ollama pull')
  })

  it('reports any other status with its number', () => {
    expect(describeHttpFailure(500, BASE)).toContain('500')
  })
})

describe('describeTransportFailure', () => {
  it('says unreachable, with host and port, when the connection is refused', () => {
    const msg = describeTransportFailure(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), BASE
    )
    expect(msg).toContain('nicht erreichbar')
    expect(msg).toContain('11434')
  })

  it('names the time budget on timeout so a tight value is recognisable', () => {
    const msg = describeTransportFailure(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), BASE
    )
    expect(msg).toContain('Zeit')
  })

  it('falls back to the error text for anything unexpected', () => {
    expect(describeTransportFailure(new Error('socket hang up'), BASE)).toContain('socket hang up')
  })
})

describe('WORKER_TIMEOUT_MS', () => {
  it('is longer than the tagging budget — a 30B doing real work is not a tag call', () => {
    expect(WORKER_TIMEOUT_MS).toBe(120_000)
  })
})

describe('buildRequestBody', () => {
  // Pinning by default is deliberate: a cold model makes the first request pay its whole
  // load time, and that latency lands on whoever addresses keel first.
  it('pins the model by default', () => {
    const body = JSON.parse(buildRequestBody('hallo', BASE, undefined))
    expect(body.model).toBe('qwen3:30b')
    expect(body.prompt).toBe('hallo')
    expect(body.stream).toBe(false)
    expect(body.keep_alive).toBe(DEFAULT_KEEP_ALIVE_SECONDS)
    expect(body.keep_alive).toBe(-1)
  })

  // The one caller that should not pin is a benchmark sweeping models it will not keep.
  it('accepts a finite budget for callers that must let go', () => {
    expect(JSON.parse(buildRequestBody('x', BASE, 300)).keep_alive).toBe(300)
  })

  it('accepts zero, which releases the model immediately', () => {
    expect(JSON.parse(buildRequestBody('x', BASE, 0)).keep_alive).toBe(0)
  })
})
