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
