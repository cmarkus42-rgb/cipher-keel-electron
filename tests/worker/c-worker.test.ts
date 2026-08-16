import { describe, it, expect } from 'vitest'
import { runCWorker, buildFormatInstruction } from '../../src/main/worker/c-worker'
import { RESULT_MARKER } from '../../src/main/worker/result-contract'
import {
  normaliseEndpoint,
  type ModelClient,
  type GenerateRequest,
} from '../../src/main/worker/model-client'

const FIELDS = ['datei', 'begruendung']
const LOCAL = normaliseEndpoint({ model: 'gemma4:26b' })

function block(inner: string): string {
  return '```' + RESULT_MARKER + '\n' + inner + '\n```'
}

const GOOD = block('{ "datei": "src/foo.ts", "begruendung": "weil" }')
const MISSING_FIELD = block('{ "datei": "src/foo.ts" }')

/** Answers from a list, one per call, and records the prompts it was given. */
function fakeClient(answers: string[]): ModelClient & { prompts: string[] } {
  const prompts: string[] = []
  return {
    prompts,
    async generate(req: GenerateRequest): Promise<string> {
      prompts.push(req.prompt)
      const next = answers.shift()
      if (next === undefined) throw new Error('fake client called more often than expected')
      return next
    },
  }
}

function throwingClient(message: string): ModelClient {
  return { async generate(): Promise<string> { throw new Error(message) } }
}

describe('buildFormatInstruction', () => {
  it('names the marker and every required field', () => {
    const text = buildFormatInstruction(FIELDS)
    expect(text).toContain(RESULT_MARKER)
    expect(text).toContain('datei')
    expect(text).toContain('begruendung')
  })
})

describe('runCWorker', () => {
  it('returns the parsed data without repairing when the first answer holds', async () => {
    const client = fakeClient([GOOD])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL }, client)

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ datei: 'src/foo.ts', begruendung: 'weil' })
    expect(result.repairs).toBe(0)
    expect(result.note).toBeNull()
    expect(client.prompts).toHaveLength(1)
  })

  it('appends the format instruction to the caller\'s prompt', async () => {
    const client = fakeClient([GOOD])
    await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL }, client)

    expect(client.prompts[0]).toContain('Tu etwas')
    expect(client.prompts[0]).toContain(RESULT_MARKER)
  })

  it('repairs exactly once and reports that it had to', async () => {
    const client = fakeClient([MISSING_FIELD, GOOD])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL }, client)

    expect(result.ok).toBe(true)
    expect(result.repairs).toBe(1)
    expect(result.note).toContain('begruendung')
    expect(client.prompts).toHaveLength(2)
  })

  it('hands the model its own broken answer and the reason', async () => {
    const client = fakeClient([MISSING_FIELD, GOOD])
    await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL }, client)

    expect(client.prompts[1]).toContain(MISSING_FIELD)
    expect(client.prompts[1]).toContain('begruendung')
  })

  it('gives up after the second miss, naming both what broke and what still breaks', async () => {
    const client = fakeClient([MISSING_FIELD, block('kein json')])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL }, client)

    expect(result.ok).toBe(false)
    expect(result.data).toBeNull()
    expect(result.repairs).toBe(1)
    expect(result.note).toContain('begruendung')
    expect(result.error).toContain('JSON im Block ist ungültig')
  })

  it('keeps the raw answer on failure so it can be diagnosed', async () => {
    const client = fakeClient([MISSING_FIELD, MISSING_FIELD])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL }, client)

    expect(result.raw).toBe(MISSING_FIELD)
  })

  it('does not repair a transport failure — an unreachable daemon is not a format problem',
    async () => {
      const result = await runCWorker(
        { prompt: 'Tu etwas', requiredFields: FIELDS, endpoint: LOCAL },
        throwingClient('Ollama ist auf 127.0.0.1:11434 nicht erreichbar'),
      )

      expect(result.ok).toBe(false)
      expect(result.repairs).toBe(0)
      expect(result.error).toContain('nicht erreichbar')
    })

  // Found the hard way: the client documented keepAliveSeconds for callers that sweep
  // models, WorkerJob had no such field, and a probe setting it was silently ignored —
  // leaving 83 GB of models pinned "Forever" on a shared machine.
  it('passes keepAliveSeconds through, so a caller can let the model go', async () => {
    let seen: GenerateRequest | null = null
    const client: ModelClient = { async generate(req) { seen = req; return GOOD } }

    await runCWorker(
      { prompt: 'x', requiredFields: FIELDS, endpoint: LOCAL, keepAliveSeconds: 0 },
      client,
    )
    expect(seen).not.toBeNull()
    expect(seen!.keepAliveSeconds).toBe(0)
  })

  it('leaves keepAliveSeconds undefined when the caller says nothing', async () => {
    let seen: GenerateRequest | null = null
    const client: ModelClient = { async generate(req) { seen = req; return GOOD } }

    await runCWorker({ prompt: 'x', requiredFields: FIELDS, endpoint: LOCAL }, client)
    expect(seen!.keepAliveSeconds).toBeUndefined()
  })

  it('passes the endpoint override through to the client', async () => {
    let seen: GenerateRequest | null = null
    const client: ModelClient = {
      async generate(req) { seen = req; return GOOD },
    }
    await runCWorker(
      { prompt: 'x', requiredFields: FIELDS, endpoint: normaliseEndpoint({ model: 'gemma4:26b' }) },
      client,
    )
    expect(seen).not.toBeNull()
    expect(seen!.endpoint).toEqual(normaliseEndpoint({ model: 'gemma4:26b' }))
  })
})
