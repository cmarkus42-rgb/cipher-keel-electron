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
import type { ModelClient, ModelEndpoint } from './model-client'

export interface WorkerJob {
  /** The task itself, formulated by the dispatching entity. */
  prompt: string
  /** Field names the answer must carry. Presence is checked, content is not. */
  requiredFields: readonly string[]
  /** Where the job runs — a local daemon or an API provider. Already normalised. */
  endpoint: ModelEndpoint
  timeoutMs?: number
  /**
   * Seconds to keep the model resident. Omitted, the client pins it, which is right for a
   * worker asked the same thing repeatedly. A caller sweeping models it will not keep —
   * a benchmark run — passes `0` so the machine is left as it was found.
   */
  keepAliveSeconds?: number
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
    '{ "feld": "wert" }',
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

export async function runCWorker(job: WorkerJob, client: ModelClient): Promise<WorkerResult> {
  const ask = (prompt: string): Promise<string> =>
    client.generate({
      prompt,
      endpoint: job.endpoint,
      timeoutMs: job.timeoutMs,
      keepAliveSeconds: job.keepAliveSeconds,
    })

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
