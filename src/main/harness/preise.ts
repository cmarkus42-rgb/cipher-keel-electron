/**
 * preise — the versioned price table the cost budget counts against.
 *
 * The arithmetic is deterministic; what is uncertain is the *table*. That is why every cost
 * reason names the table's date: the uncertainty stays visible instead of being smoothed away
 * (M8 section 4.8).
 *
 * An unknown model costs zero rather than an estimate. A guessed price would abort a run on a
 * number nobody measured — and a cost budget that fires on a guess is worse than one that does
 * not fire at all, because it looks like a measurement.
 *
 * The cost calculator (`kostenCent`, called from `lauf.ts`'s `verbrauchAusEreignissen`) keys
 * this table by `Auftrag.modellId`, which is the model registry's `id` field
 * (src/main/model/defaults.ts) — not a vendor model name. Of the seven shipped registry
 * entries, only one runs against a metered API: `openrouter-qwen3-coder`. The three
 * `claude-*-cli` entries run over the Claude Code subscription's quota, not a per-token API
 * meter, so they have no comparable marginal price to enter here; and the three local-http
 * entries (`mac-qwen3-30b`, `spark-gemma4-26b`, `spark-gpt-oss-120b`) already cost nothing per
 * token — the machine is paid for either way. None of those six ids belong in this table, and
 * leaving them out (rather than entering a guess or a zero that looks like a measurement) is
 * the correct state, not a gap.
 *
 * `openrouter-qwen3-coder` is the one entry that should be priced and, before this table was
 * corrected, was not: the table's earlier keys (`claude-opus-5`, `claude-sonnet-5`,
 * `claude-haiku-4-5-20251001`, `gemma4:26b`) matched no registry id and no vendor model
 * string, so the cost budget silently priced every real run at zero, including the only one
 * that actually costs money. The rate below is OpenRouter's own published headline rate for
 * `qwen/qwen3-coder` (fetched from openrouter.ai/qwen/qwen3-coder on 2026-08-19: $0.22 / $1.80
 * per 1M input/output tokens). OpenRouter routes this model across five providers whose prices
 * can differ, and Alibaba's own endpoint prices by context length above 128k input tokens —
 * so this is a headline figure, not a per-provider guarantee, and PREISTABELLE_STAND is the
 * signal for how stale it may be.
 *
 * CK-NFR-012: this is an adjustable surface. It has an entry in docs/anpassbare-flaechen.md,
 * and tests/docs/anpassbare-flaechen.test.ts holds that entry in place.
 */

export const PREISTABELLE_STAND = '2026-08-19'

export interface Preis {
  /** Cent per million input tokens. */
  eingabeProMillion: number
  /** Cent per million output tokens. */
  ausgabeProMillion: number
}

export const VORGABE_PREISE: Record<string, Preis> = {
  // OpenRouter headline rate for qwen/qwen3-coder, keyed by the registry id
  // 'openrouter-qwen3-coder' (src/main/model/defaults.ts) — see the module comment above.
  'openrouter-qwen3-coder': { eingabeProMillion: 22, ausgabeProMillion: 180 },
}

export function kostenCent(
  modellId: string,
  usage: { eingabeToken: number; ausgabeToken: number },
  tabelle: Record<string, Preis>,
): number {
  const p = tabelle[modellId]
  if (!p) return 0
  return (usage.eingabeToken * p.eingabeProMillion + usage.ausgabeToken * p.ausgabeProMillion) / 1_000_000
}
