# Niveau-C-Rückgabe-Vertrag — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Niveau-C-Worker, der ein kleines Modell einmal aufruft, dessen Antwort gegen einen Vertrag prüft, bei Formatbruch genau einmal repariert und das Ergebnis sichtbar protokolliert zurückgibt.

**Architecture:** Drei Module unter `src/main/worker/`. `result-contract.ts` prüft eine Antwort (reine Funktionen, kein I/O). `ollama-client.ts` ist der Ein-Schuss-Client, herausgelöst aus `note-tagging.ts`, hinter einem Interface. `c-worker.ts` orchestriert: Formatanweisung anhängen, aufrufen, prüfen, einmal reparieren.

**Tech Stack:** TypeScript, Vitest, `node:http`, Ollama `/api/generate`.

**Spec:** `docs/superpowers/specs/2026-08-13-niveau-c-rueckgabe-vertrag-design.md`

## Global Constraints

- **Sprache:** Code und Kommentare englisch. Prompt-Inhalte und alles unter `docs/superpowers/` deutsch. Die Vertragsmeldungen sind Prompt-Inhalt (sie werden dem Modell als Reparaturanweisung vorgelegt) und damit **deutsch**.
- **Marker:** wörtlich `keel-ergebnis`, als Infostring eines dreifach umzäunten Blocks.
- **Genau ein Reparaturversuch.** Nie zwei, nie null. Immer im Ergebnis sichtbar.
- **Transportfehler bekommen keinen Reparaturversuch.**
- **Kein Test geht ins Netz.** Der Client wird überall injiziert.
- **Das Tagging-Verhalten ändert sich nicht.** Seine bestehenden Tests sind der Wächter.
- **Worker-Timeout:** `WORKER_TIMEOUT_MS = 120_000`. Das Tagging behält seine 60 s.
- **Exit-Codes nie aus abgeschnittener Ausgabe schließen.** `npm run typecheck | tail -3` liefert den Code von `tail`. Richtig: `npm run typecheck >/dev/null 2>&1; echo $?`.
- **Native ABI:** niemals `npm install` ohne Not; `--package-lock-only` ist unschädlich. Symptom eines Bruchs sind rund 497 fallende Tests.

---

## Task 1: Der Vertrag — reine Prüfung einer Antwort

**Files:**
- Create: `src/main/worker/result-contract.ts`
- Test: `tests/worker/result-contract.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `RESULT_MARKER: string`, `type ContractCheck`, `checkWorkerAnswer(raw: string, requiredFields: readonly string[]): ContractCheck`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/worker/result-contract.test.ts
import { describe, it, expect } from 'vitest'
import { checkWorkerAnswer, RESULT_MARKER } from '../../src/main/worker/result-contract'

const FIELDS = ['datei', 'aenderung', 'begruendung']

function block(inner: string): string {
  return '```' + RESULT_MARKER + '\n' + inner + '\n```'
}

describe('checkWorkerAnswer', () => {
  it('accepts a well-formed block and returns the parsed object', () => {
    const raw = 'Klar, hier ist das Ergebnis:\n\n' + block(
      '{ "datei": "src/foo.ts", "aenderung": "x", "begruendung": "y" }'
    )
    const check = checkWorkerAnswer(raw, FIELDS)
    expect(check.ok).toBe(true)
    if (check.ok) expect(check.data.datei).toBe('src/foo.ts')
  })

  it('tolerates prose around the block but never inside it', () => {
    const raw = 'Vorher.\n' + block('{ "a": 1 }') + '\nNachher, mit Erklärung.'
    const check = checkWorkerAnswer(raw, ['a'])
    expect(check.ok).toBe(true)
  })

  it('rejects an answer without the marked block', () => {
    const check = checkWorkerAnswer('{ "datei": "x" }', FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('kein Block')
  })

  it('rejects more than one block instead of guessing which is meant', () => {
    const raw = block('{ "a": 1 }') + '\n\n' + block('{ "a": 2 }')
    const check = checkWorkerAnswer(raw, ['a'])
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('mehr als ein Block')
  })

  it('rejects invalid JSON and names the parser complaint', () => {
    const check = checkWorkerAnswer(block('{ "datei": }'), FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('JSON im Block ist ungültig')
  })

  it('rejects a non-object payload', () => {
    const check = checkWorkerAnswer(block('[1, 2, 3]'), FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('kein JSON-Objekt')
  })

  it('names every missing field', () => {
    const check = checkWorkerAnswer(block('{ "datei": "x" }'), FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.reason).toContain('aenderung')
      expect(check.reason).toContain('begruendung')
      expect(check.reason).not.toContain('datei')
    }
  })

  it('allows extra fields — presence is checked, not exclusivity', () => {
    const raw = block('{ "datei": "x", "aenderung": "y", "begruendung": "z", "extra": 1 }')
    expect(checkWorkerAnswer(raw, FIELDS).ok).toBe(true)
  })

  it('counts an empty value as present — content is the caller\'s business', () => {
    const raw = block('{ "datei": "", "aenderung": "", "begruendung": "" }')
    expect(checkWorkerAnswer(raw, FIELDS).ok).toBe(true)
  })

  it('accepts a block when no fields are required', () => {
    expect(checkWorkerAnswer(block('{}'), []).ok).toBe(true)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/worker/result-contract.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```ts
// src/main/worker/result-contract.ts
/**
 * result-contract — decide whether a small model's answer is usable.
 *
 * Niveau C has no harness: a worker's single obligation is to return an answer in an
 * agreed shape. This module decides whether it did, and says precisely what was wrong
 * when it did not.
 *
 * The counter-example lives in `notes/note-tagging.ts`: `parseTagResponse` falls back
 * from JSON to a regex to comma-splitting and yields garbage rather than an error. That
 * is right for tags, where a bad one is harmless. It is wrong for a work result that
 * feeds the next phase, which is why nothing here guesses.
 *
 * The reason strings are German on purpose — they are shown to the dispatching entity
 * *and* handed back to the model as the repair instruction. One text, two uses.
 */

/** Fence info string a worker answer must carry. */
export const RESULT_MARKER = 'keel-ergebnis'

export type ContractCheck =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: string }

/** Matches ```keel-ergebnis … ``` blocks. Global: the count itself is a contract rule. */
function blockPattern(): RegExp {
  return new RegExp('```' + RESULT_MARKER + '[ \\t]*\\r?\\n([\\s\\S]*?)```', 'g')
}

export function checkWorkerAnswer(
  raw: string,
  requiredFields: readonly string[],
): ContractCheck {
  const blocks = [...raw.matchAll(blockPattern())].map(m => m[1])

  if (blocks.length === 0) {
    return { ok: false, reason: `kein Block "${RESULT_MARKER}" in der Antwort` }
  }
  if (blocks.length > 1) {
    return { ok: false, reason: 'mehr als ein Block — es muss genau einer sein' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(blocks[0])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `JSON im Block ist ungültig: ${msg}` }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'im Block steht kein JSON-Objekt' }
  }

  const data = parsed as Record<string, unknown>
  const missing = requiredFields.filter(f => !(f in data))
  if (missing.length > 0) {
    return { ok: false, reason: `fehlende Felder: ${missing.join(', ')}` }
  }

  return { ok: true, data }
}
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/worker/result-contract.test.ts`
Erwartet: PASS, zehn Tests.

- [ ] **Schritt 5: Committen**

```bash
npm test >/dev/null 2>&1; echo "test=$?"
npm run typecheck >/dev/null 2>&1; echo "typecheck=$?"
npm run lint >/dev/null 2>&1; echo "lint=$?"
git add src/main/worker/result-contract.ts tests/worker/result-contract.test.ts
git commit -m "feat(worker): a contract that decides whether a C answer is usable"
```

---

## Task 2: Der Ein-Schuss-Client, herausgelöst

**Files:**
- Create: `src/main/worker/ollama-client.ts`
- Test: `tests/worker/ollama-client.test.ts`

**Interfaces:**
- Consumes: `configStore` aus `../config/config-store`
- Produces: `WORKER_TIMEOUT_MS: number`, `interface OllamaEndpoint`, `interface GenerateRequest`, `interface OllamaClient`, `resolveEndpoint(override: Partial<OllamaEndpoint> | undefined, base: OllamaEndpoint): OllamaEndpoint`, `describeHttpFailure(status: number, endpoint: OllamaEndpoint): string`, `describeTransportFailure(err: unknown, endpoint: OllamaEndpoint): string`, `class HttpOllamaClient implements OllamaClient`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/worker/ollama-client.test.ts
import { describe, it, expect } from 'vitest'
import {
  resolveEndpoint,
  describeHttpFailure,
  describeTransportFailure,
  WORKER_TIMEOUT_MS,
} from '../../src/main/worker/ollama-client'

const BASE = { host: '127.0.0.1', port: 11434, model: 'qwen3:30b' }

describe('resolveEndpoint', () => {
  it('returns the base when nothing is overridden', () => {
    expect(resolveEndpoint(undefined, BASE)).toEqual(BASE)
  })

  it('overrides only what is given — the Spark is a host, not a new config', () => {
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

  it('names the elapsed budget on timeout so a tight value is recognisable', () => {
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
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/worker/ollama-client.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```ts
// src/main/worker/ollama-client.ts
/**
 * ollama-client — one request to a local model, no conversation.
 *
 * Lifted out of `notes/note-tagging.ts`, where it lived as a private `ollamaPost`. That
 * was fine while tagging was the only caller; the Niveau-C worker is the second, and two
 * HTTP paths to the same daemon would be one too many.
 *
 * The request body is carried over unchanged, `keep_alive: -1` included — it keeps the
 * model resident, which matters when a 30B is asked several things in a row.
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

export interface GenerateRequest {
  prompt: string
  /** Overrides parts of the configured endpoint — e.g. a different host or model. */
  endpoint?: Partial<OllamaEndpoint>
  timeoutMs?: number
}

export interface OllamaClient {
  /** Returns the model's response text. Throws with a described failure otherwise. */
  generate(req: GenerateRequest): Promise<string>
}

/** The endpoint from config, which is what a caller gets without an override. */
export function configuredEndpoint(): OllamaEndpoint {
  const llm = configStore.get('llm')
  return { host: llm.ollamaHost, port: llm.ollamaPort, model: llm.ollamaModel }
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

export class HttpOllamaClient implements OllamaClient {
  generate(req: GenerateRequest): Promise<string> {
    const endpoint = resolveEndpoint(req.endpoint, configuredEndpoint())
    const timeoutMs = req.timeoutMs ?? WORKER_TIMEOUT_MS
    const body = JSON.stringify({
      model: endpoint.model,
      prompt: req.prompt,
      stream: false,
      keep_alive: -1,
    })

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
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/worker/ollama-client.test.ts`
Erwartet: PASS, neun Tests.

- [ ] **Schritt 5: Committen**

```bash
npm test >/dev/null 2>&1; echo "test=$?"
npm run typecheck >/dev/null 2>&1; echo "typecheck=$?"
npm run lint >/dev/null 2>&1; echo "lint=$?"
git add src/main/worker/ollama-client.ts tests/worker/ollama-client.test.ts
git commit -m "feat(worker): a single-shot Ollama client with described failures"
```

---

## Task 3: Der Worker — anweisen, prüfen, einmal reparieren

**Files:**
- Create: `src/main/worker/c-worker.ts`
- Test: `tests/worker/c-worker.test.ts`

**Interfaces:**
- Consumes: `checkWorkerAnswer`, `RESULT_MARKER` (Task 1); `OllamaClient`, `GenerateRequest`, `OllamaEndpoint` (Task 2)
- Produces: `interface WorkerJob`, `interface WorkerResult`, `buildFormatInstruction(requiredFields: readonly string[]): string`, `runCWorker(job: WorkerJob, client: OllamaClient): Promise<WorkerResult>`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/worker/c-worker.test.ts
import { describe, it, expect } from 'vitest'
import { runCWorker, buildFormatInstruction } from '../../src/main/worker/c-worker'
import { RESULT_MARKER } from '../../src/main/worker/result-contract'
import type { OllamaClient, GenerateRequest } from '../../src/main/worker/ollama-client'

const FIELDS = ['datei', 'begruendung']

function block(inner: string): string {
  return '```' + RESULT_MARKER + '\n' + inner + '\n```'
}

const GOOD = block('{ "datei": "src/foo.ts", "begruendung": "weil" }')
const MISSING_FIELD = block('{ "datei": "src/foo.ts" }')

/** Answers from a list, one per call, and records the prompts it was given. */
function fakeClient(answers: string[]): OllamaClient & { prompts: string[] } {
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

function throwingClient(message: string): OllamaClient {
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
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS }, client)

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ datei: 'src/foo.ts', begruendung: 'weil' })
    expect(result.repairs).toBe(0)
    expect(result.note).toBeNull()
    expect(client.prompts).toHaveLength(1)
  })

  it('appends the format instruction to the caller\'s prompt', async () => {
    const client = fakeClient([GOOD])
    await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS }, client)

    expect(client.prompts[0]).toContain('Tu etwas')
    expect(client.prompts[0]).toContain(RESULT_MARKER)
  })

  it('repairs exactly once and reports that it had to', async () => {
    const client = fakeClient([MISSING_FIELD, GOOD])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS }, client)

    expect(result.ok).toBe(true)
    expect(result.repairs).toBe(1)
    expect(result.note).toContain('begruendung')
    expect(client.prompts).toHaveLength(2)
  })

  it('hands the model its own broken answer and the reason', async () => {
    const client = fakeClient([MISSING_FIELD, GOOD])
    await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS }, client)

    expect(client.prompts[1]).toContain(MISSING_FIELD)
    expect(client.prompts[1]).toContain('begruendung')
  })

  it('gives up after the second miss, naming both what broke and what still breaks', async () => {
    const client = fakeClient([MISSING_FIELD, block('kein json')])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS }, client)

    expect(result.ok).toBe(false)
    expect(result.data).toBeNull()
    expect(result.repairs).toBe(1)
    expect(result.note).toContain('begruendung')
    expect(result.error).toContain('JSON im Block ist ungültig')
  })

  it('keeps the raw answer on failure so it can be diagnosed', async () => {
    const client = fakeClient([MISSING_FIELD, MISSING_FIELD])
    const result = await runCWorker({ prompt: 'Tu etwas', requiredFields: FIELDS }, client)

    expect(result.raw).toBe(MISSING_FIELD)
  })

  it('does not repair a transport failure — an unreachable daemon is not a format problem',
    async () => {
      const result = await runCWorker(
        { prompt: 'Tu etwas', requiredFields: FIELDS },
        throwingClient('Ollama ist auf 127.0.0.1:11434 nicht erreichbar'),
      )

      expect(result.ok).toBe(false)
      expect(result.repairs).toBe(0)
      expect(result.error).toContain('nicht erreichbar')
    })

  it('passes the endpoint override through to the client', async () => {
    let seen: GenerateRequest | null = null
    const client: OllamaClient = {
      async generate(req) { seen = req; return GOOD },
    }
    await runCWorker(
      { prompt: 'x', requiredFields: FIELDS, endpoint: { model: 'gemma4:26b' } },
      client,
    )
    expect(seen!.endpoint).toEqual({ model: 'gemma4:26b' })
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/worker/c-worker.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```ts
// src/main/worker/c-worker.ts
/**
 * c-worker — Niveau C: one prompt in, one checked answer out.
 *
 * The three niveaus are three runtimes. A is Claude Code, B is NanoClaw, and C is keel
 * itself: a small model with no tools, no state and no conversation, whose single
 * obligation is to answer in an agreed shape. Iterations are new calls, not turns.
 *
 * keel appends the format instruction rather than leaving it to the caller — a model
 * cannot meet a format nobody told it about, so the instruction belongs to the contract.
 *
 * Exactly one repair attempt, and it is never silent: `repairs` and `note` say that the
 * model missed on its first try even when the second one worked. A dispatching entity
 * that sees a model repair constantly is being told something about that model.
 */

import { checkWorkerAnswer, RESULT_MARKER } from './result-contract'
import type { OllamaClient, OllamaEndpoint } from './ollama-client'

export interface WorkerJob {
  /** The task itself, formulated by the dispatching entity. */
  prompt: string
  /** Field names the answer must carry. Presence is checked, content is not. */
  requiredFields: readonly string[]
  /** Overrides the configured endpoint — e.g. to reach a second machine. */
  endpoint?: Partial<OllamaEndpoint>
  timeoutMs?: number
}

export interface WorkerResult {
  ok: boolean
  /** The parsed object, or null when the contract was not met. */
  data: Record<string, unknown> | null
  /** 0 or 1 — a repair is always visible, never silent. */
  repairs: number
  /** What broke on the first attempt, even when the repair succeeded. */
  note: string | null
  /** Why it failed for good. */
  error: string | null
  /** The model's last answer, verbatim — kept on success and failure alike. */
  raw: string
}

export function buildFormatInstruction(requiredFields: readonly string[]): string {
  const felder = requiredFields.length > 0
    ? `mit genau diesen Feldern: ${requiredFields.join(', ')}`
    : 'mit den Feldern, die die Aufgabe verlangt'

  return [
    '',
    '---',
    '',
    'Antworte mit **genau einem** umzäunten Block, dessen Kennzeichnung',
    `\`${RESULT_MARKER}\` lautet:`,
    '',
    '```' + RESULT_MARKER,
    `{ "feld": "wert" }`,
    '```',
    '',
    `Im Block steht ein einziges JSON-Objekt ${felder}.`,
    'Schreibe nichts anderes in den Block — keine Kommentare, keinen zweiten Block.',
    'Text außerhalb des Blocks wird ignoriert; du darfst dort erklären, was du getan hast.',
  ].join('\n')
}

function buildRepairPrompt(job: WorkerJob, badAnswer: string, reason: string): string {
  return [
    job.prompt,
    '',
    '---',
    '',
    'Dein vorheriger Versuch war unbrauchbar. Das war er:',
    '',
    badAnswer,
    '',
    `Das Problem: ${reason}`,
    '',
    'Antworte erneut, diesmal formatgerecht.',
    buildFormatInstruction(job.requiredFields),
  ].join('\n')
}

export async function runCWorker(job: WorkerJob, client: OllamaClient): Promise<WorkerResult> {
  const ask = (prompt: string): Promise<string> =>
    client.generate({ prompt, endpoint: job.endpoint, timeoutMs: job.timeoutMs })

  // A transport failure is not a format problem: telling an unreachable daemon that a
  // field was missing would waste a call and mislead the caller about the cause.
  let first: string
  try {
    first = await ask(job.prompt + buildFormatInstruction(job.requiredFields))
  } catch (err) {
    return {
      ok: false, data: null, repairs: 0, note: null,
      error: err instanceof Error ? err.message : String(err), raw: '',
    }
  }

  const firstCheck = checkWorkerAnswer(first, job.requiredFields)
  if (firstCheck.ok) {
    return { ok: true, data: firstCheck.data, repairs: 0, note: null, error: null, raw: first }
  }

  let second: string
  try {
    second = await ask(buildRepairPrompt(job, first, firstCheck.reason))
  } catch (err) {
    return {
      ok: false, data: null, repairs: 1, note: firstCheck.reason,
      error: err instanceof Error ? err.message : String(err), raw: first,
    }
  }

  const secondCheck = checkWorkerAnswer(second, job.requiredFields)
  if (secondCheck.ok) {
    return {
      ok: true, data: secondCheck.data, repairs: 1,
      note: firstCheck.reason, error: null, raw: second,
    }
  }

  return {
    ok: false, data: null, repairs: 1,
    note: firstCheck.reason, error: secondCheck.reason, raw: second,
  }
}
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/worker/c-worker.test.ts`
Erwartet: PASS, neun Tests.

- [ ] **Schritt 5: Committen**

```bash
npm test >/dev/null 2>&1; echo "test=$?"
npm run typecheck >/dev/null 2>&1; echo "typecheck=$?"
npm run lint >/dev/null 2>&1; echo "lint=$?"
git add src/main/worker/c-worker.ts tests/worker/c-worker.test.ts
git commit -m "feat(worker): a Niveau-C worker that checks its answer and repairs once"
```

---

## Task 4: Das Tagging benutzt denselben Client

**Files:**
- Modify: `src/main/notes/note-tagging.ts`

**Interfaces:**
- Consumes: `HttpOllamaClient` (Task 2)
- Produces: nichts

Der Wächter dieses Tasks sind die **bestehenden** Tagging-Tests. Sie werden nicht angefasst; ändert sich dort Verhalten, war die Herauslösung falsch.

- [ ] **Schritt 1: Bestehende Tagging-Tests laufen lassen und Stand festhalten**

```bash
npx vitest run tests/notes 2>&1 | tail -5
```

Die Zahl grüner Tests notieren. Sie muss am Ende dieselbe sein.

- [ ] **Schritt 2: Umbauen**

In `src/main/notes/note-tagging.ts` die private Funktion `ollamaPost` und den Import
`import * as http from 'node:http'` **entfernen**, ebenso die Konstante `TIMEOUT_MS`,
falls sie danach ungenutzt ist (der Lint-Gate meldet das).

Stattdessen oben ergänzen:

```ts
import { HttpOllamaClient } from '../worker/ollama-client'

/** Tagging keeps its own 60s budget — a tag is not a work item (see worker/ollama-client). */
const TAGGING_TIMEOUT_MS = 60_000
const ollama = new HttpOllamaClient()
```

Die Aufrufstelle (heute `const body = JSON.stringify({...}); const raw = await ollamaPost(body)`
gefolgt von `JSON.parse(raw)` und `data.response`) wird zu:

```ts
      const text = await ollama.generate({ prompt, timeoutMs: TAGGING_TIMEOUT_MS })
      if (!text) return null

      return parseTagResponse(text)
```

Der Client liefert bereits `data.response` getrimmt, deshalb entfallen `JSON.parse` und der
`.trim()`-Schritt. `getLlmConfig()` wird dadurch möglicherweise ungenutzt — dann ebenfalls
entfernen, der Lint-Gate zeigt es an.

**Der umgebende `try { … } catch { return null }` bleibt unverändert.** Das Tagging degradiert
weiterhin still, wenn Ollama fehlt (CK-NOTES-002, CK-NFR-010); nur der Worker will die
beschriebenen Fehler sehen.

- [ ] **Schritt 3: Tagging-Tests erneut laufen lassen**

```bash
npx vitest run tests/notes 2>&1 | tail -5
```

Erwartet: **dieselbe** Zahl grüner Tests wie in Schritt 1.

- [ ] **Schritt 4: Committen**

```bash
npm test >/dev/null 2>&1; echo "test=$?"
npm run typecheck >/dev/null 2>&1; echo "typecheck=$?"
npm run lint >/dev/null 2>&1; echo "lint=$?"
git add src/main/notes/note-tagging.ts
git commit -m "refactor(notes): tagging shares the worker's Ollama client"
```

---

## Task 5: Der Modell-Default und das Inventar

**Files:**
- Modify: `src/main/config/config-store.ts`
- Modify: `docs/anpassbare-flaechen.md`

**Interfaces:**
- Consumes: nichts
- Produces: nichts

- [ ] **Schritt 1: Default korrigieren**

In `src/main/config/config-store.ts` im `defaults`-Objekt:

```ts
  llm: {
    ollamaHost: '127.0.0.1',
    ollamaPort: 11434,
    // Placeholder, not a choice: the target is whichever coding flagship runs well on the
    // hardware. The previous value (gemma3:12b) predates Qwen3 and Gemma4 and is not
    // installed on the development machine at all, so it failed at the first request.
    ollamaModel: 'qwen3:30b-a3b-instruct-2507-q4_K_M',
  },
```

- [ ] **Schritt 2: Inventar nachziehen (CK-NFR-012)**

In `docs/anpassbare-flaechen.md` die drei `llm.*`-Zeilen ersetzen:

```markdown
| `llm.ollamaHost` | Host des lokalen Ollama — auch der Weg zu einem zweiten Rechner | nein | nein — nur Config-Datei |
| `llm.ollamaPort` | Port des lokalen Ollama | nein | nein — nur Config-Datei |
| `llm.ollamaModel` | Modell für Notizen-Tagging **und** Niveau-C-Worker. Default ist ein Platzhalter für das jeweilige Coding-Flaggschiff | nein | nein — nur Config-Datei |
```

- [ ] **Schritt 3: Suite, Typecheck, Lint, Committen**

```bash
npm test >/dev/null 2>&1; echo "test=$?"
npm run typecheck >/dev/null 2>&1; echo "typecheck=$?"
npm run lint >/dev/null 2>&1; echo "lint=$?"
git add src/main/config/config-store.ts docs/anpassbare-flaechen.md
git commit -m "fix(config): default to a model that exists, and say it is a placeholder"
```

---

## Task 6: Gegen ein echtes Modell belegen

Kein Test dieses Repos spricht mit einem Modell. Was hier gemessen wird, ist der einzige
Beleg, dass der Vertrag an einer echten Antwort trägt.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-13-niveau-c-rueckgabe-vertrag.md` (Messprotokoll)

- [ ] **Schritt 1: Erreichbarkeit und Modell prüfen**

```bash
curl -s --max-time 5 http://127.0.0.1:11434/api/tags | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  console.log(JSON.parse(s).models.map(m=>m.name).join('\n'))})"
```

Erwartet: `qwen3:30b-a3b-instruct-2507-q4_K_M` steht in der Liste. Fehlt es, ist Task 5
Schritt 1 auf einen nicht vorhandenen Wert gelaufen — dann hier abbrechen und melden.

- [ ] **Schritt 2: Ein echter Auftrag, der gelingen sollte**

Ein Wegwerf-Skript im Scratchpad-Verzeichnis (nicht im Repo) mit `npx tsx` ausführen, das
`runCWorker` mit `HttpOllamaClient` gegen einen einfachen Auftrag laufen lässt, etwa:

```ts
runCWorker({
  prompt: 'Nenne die Hauptstadt von Frankreich und begründe in einem Satz, woher du das weißt.',
  requiredFields: ['stadt', 'begruendung'],
}, new HttpOllamaClient())
```

Zu protokollieren: `ok`, `repairs`, `data`, und die ersten Zeilen von `raw`.

- [ ] **Schritt 3: Den Reparaturpfad erzwingen**

Nicht auf einen Zufallsfehler warten. Ein Auftrag mit einem Feldnamen, den das Modell im
ersten Anlauf mit hoher Wahrscheinlichkeit nicht liefert — zum Beispiel ein zusätzliches,
im Aufgabentext nicht erwähntes Feld:

```ts
runCWorker({
  prompt: 'Nenne die Hauptstadt von Frankreich.',
  requiredFields: ['stadt', 'einwohnerzahl', 'quellenlage'],
}, new HttpOllamaClient())
```

Erwartet: entweder `repairs: 0` (das Modell war brav) oder `repairs: 1` mit `note`, das die
fehlenden Felder nennt. Tritt selbst dann keine Reparatur ein, den Fall **künstlich**
erzeugen, indem ein Auftrag einen unmöglichen Marker verlangt — der Beleg muss zeigen, dass
der zweite Aufruf stattfindet und protokolliert wird.

- [ ] **Schritt 4: Den Fehlerpfad belegen**

Mit `endpoint: { model: 'gibtsnicht:1b' }` einen Auftrag absetzen.
Erwartet: `ok: false`, `repairs: 0`, und ein `error`, der das Modell beim Namen nennt und
`ollama pull` vorschlägt — **nicht** „HTTP 404".

- [ ] **Schritt 5: Protokollieren und committen**

Das Ergebnis wörtlich als Abschnitt „Messprotokoll Task 6" an diesen Plan anhängen:
Modellname, die drei Läufe mit `ok`/`repairs`/`note`/`error`, und bei mindestens einem Lauf
die Rohantwort im Original, damit sichtbar ist, wie das Modell tatsächlich formatiert.

```bash
git add docs/superpowers/plans/2026-08-13-niveau-c-rueckgabe-vertrag.md
git commit -m "docs: measurement protocol for the Niveau-C return contract"
```

---

## Selbstprüfung des Plans

**Spec-Abdeckung.** §4 Architektur → Tasks 1–3. §5 Schnittstellen → Tasks 1–3, Typen wörtlich
übernommen. §6 Formatanweisung → Task 3 (`buildFormatInstruction`). §7 Prüfschritte und
Reparatur → Tasks 1 und 3. §8 Fehler jenseits des Formats → Task 2
(`describeHttpFailure`/`describeTransportFailure`) und Task 3 (kein Reparaturversuch bei
Transportfehler). §9 Modell-Default → Task 5. §10 Benchmark-Voraussetzung → durch
`endpoint`-Override in Task 2/3 erfüllt, nichts gebaut. §11 Test → jede Ebene hat ihre Tests,
der App-Beleg ist Task 6. §12 Nicht dabei → keine Task berührt IPC, Graph, Dateien oder die
C-Assemblierung. Keine Lücke.

**Typkonsistenz.** `checkWorkerAnswer(raw, requiredFields)` heißt in Task 1 und 3 gleich.
`ContractCheck` ist die diskriminierte Union aus Task 1, in Task 3 über `.ok` verzweigt.
`OllamaClient.generate(req)` hat in Task 2 und in den Fakes aus Task 3 dieselbe Signatur.
`WORKER_TIMEOUT_MS` ist in Task 2 definiert, in Task 3 nur indirekt über `timeoutMs` benutzt.
`RESULT_MARKER` stammt aus Task 1 und wird in Task 3 und in beiden Testdateien importiert.
`Partial<OllamaEndpoint>` ist in `WorkerJob.endpoint` und `GenerateRequest.endpoint` derselbe
Typ.

**Reihenfolge.** Task 3 braucht 1 und 2. Task 4 braucht 2. Task 6 braucht 3, 4 und 5. Task 5
ist unabhängig, steht aber vor 6, weil Task 6 Schritt 1 den neuen Default prüft.

**Keine Platzhalter.** Jeder Code-Schritt trägt vollständigen Code; die einzige Stelle ohne
festen Wortlaut ist das Wegwerf-Skript in Task 6, das ausdrücklich nicht ins Repo gehört.

---

## Messprotokoll Task 6

**Datum:** 2026-08-13 · **Aufbau:** `runCWorker` mit `HttpOllamaClient` gegen das lokale
Ollama auf `127.0.0.1:11434`, über ein Wegwerf-Skript im Scratchpad (nicht im Repo).

### Der Default ist installiert

`qwen3:30b-a3b-instruct-2507-q4_K_M` steht in `/api/tags`. Task 5 Schritt 1 ist damit nicht
auf einen leeren Wert gelaufen.

### Läufe gegen den Default (30.5B MoE)

| Lauf | Auftrag | Ergebnis |
|---|---|---|
| 1 | Hauptstadt + Begründung, Felder `stadt`, `begruendung` | `ok: true`, `repairs: 0`, 27 s |
| 2 | Hauptstadt, Felder `stadt`, `einwohnerzahl`, `quellenlage` — im Aufgabentext **nicht** erwähnt | `ok: true`, `repairs: 0`, 1 s |
| 3 | `endpoint: { model: 'gibtsnicht:1b' }` | `ok: false`, `repairs: 0` |

Rohantwort aus Lauf 1, unverändert:

````
```keel-ergebnis
{ "stadt": "Paris", "begruendung": "Ich weiß das, weil Paris seit Jahrhunderten als die Hauptstadt Frankreichs anerkannt ist und dies in allen standardmäßigen geografischen Quellen und Lehrbüchern steht." }
```
````

**Lauf 2 ist der interessantere:** Das Modell füllte die drei Felder, obwohl die Aufgabe nur
nach der Hauptstadt fragte — die Formatanweisung allein genügte, um `einwohnerzahl` und
`quellenlage` zu erzeugen. 27 s im ersten, 1 s im zweiten Lauf: `keep_alive: -1` hält das
Modell geladen, wie beabsichtigt.

**Lauf 3 belegt den Fehlerpfad wörtlich:**

```
Modell 'gibtsnicht:1b' ist auf 127.0.0.1:11434 nicht installiert —
mit 'ollama pull gibtsnicht:1b' laden
```

Kein „HTTP 404". `repairs: 0` — ein Transportfehler bekommt keinen Reparaturversuch.

### Der Reparaturpfad, an einem wirklich schwachen Modell

Die Läufe 1–3 lösten **keine** Reparatur aus: Das 30B-Modell formatierte auf Anhieb sauber.
Ein Beleg, der die Reparatur nicht zeigt, belegt sie nicht. Statt den Fall künstlich zu
erzwingen, wurde derselbe Auftrag (`stadt`, `einwohner`) gegen zwei kleinere Modelle geführt:

| Modell | `ok` | `repairs` | Befund |
|---|---|---|---|
| `mistral-nemo:latest` (12B) | true | 0 | sauberer Block im ersten Anlauf |
| `moondream:latest` (1B) | **false** | **1** | beide Versuche daneben |

Moondreams letzte Antwort, unverändert:

```
[
  "feld": "wert",
  "kleiner-kennzeichnung": "keel-ergebnis"
 ]
```

Weder umzäunter Block noch gültiges JSON — das Modell hat die Formatanweisung als Inhalt
missverstanden. `note` und `error` lauten beide `kein Block "keel-ergebnis" in der Antwort`,
die Rohantwort ist erhalten.

**Das ist der Kern des Vertrags, an einem echten Fall:** Dieselbe Antwort hätte
`parseTagResponse` über seinen Komma-Rückfall stillschweigend in Tags verwandelt. Hier ist
sie ein gemeldeter Fehlschlag mit `ok: false`, einem benannten Grund und der Rohantwort zur
Nachschau.

### Was dieser Lauf nicht belegt

- **Kein Auftraggeber.** Es gibt keine Session, die einen C-Worker beauftragt — der Lauf ging
  über ein Skript. Die Auftrags-Schnittstelle ist ausdrücklich nicht Teil dieses Plans.
- **Kein mehrzeiliges Nutzlastfeld.** Die Schwäche aus Spec §3 — maskierte Zeilenumbrüche in
  JSON-Textfeldern — wurde hier nicht ausgereizt. Alle Werte waren einzeilig.
- **Keine Aussage über Arbeitsqualität.** Gemessen ist Formattreue, nicht ob das Modell die
  Aufgabe gut löst. Das wäre die Benchmark-Strecke, und die ist nicht gebaut.
