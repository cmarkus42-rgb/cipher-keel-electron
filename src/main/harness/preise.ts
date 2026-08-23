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
 * (src/main/model/defaults.ts) — not a vendor model name. Of the sixteen shipped registry
 * entries, nine run against a metered API: `openrouter-qwen3-coder` and the eight OpenRouter
 * entries added 2026-08-24. The three `claude-*-cli` entries run over the Claude Code
 * subscription's quota, not a per-token API meter, so they have no comparable marginal price to
 * enter here; and the four local-http entries (`mac-qwen3-30b`, `spark-gemma4-26b`,
 * `spark-gpt-oss-120b`, `spark-qwen38-27b`) already cost nothing per token — the machine is paid
 * for either way. None of those seven ids belong in this table, and leaving them out (rather
 * than entering a guess or a zero that looks like a measurement) is the correct state, not a gap.
 * (Review-Fund 2026-08-24: an earlier version of this paragraph said "fifteen"/"three"/"six" —
 * miscounted by adding to a stale tally instead of recounting `DEFAULT_EINTRAEGE` itself, and
 * `spark-qwen38-27b` was missing from the local-http list because of it.)
 *
 * `openrouter-qwen3-coder` was the one entry that should be priced and, before this table was
 * first corrected, was not: the table's earlier keys (`claude-opus-5`, `claude-sonnet-5`,
 * `claude-haiku-4-5-20251001`, `gemma4:26b`) matched no registry id and no vendor model
 * string, so the cost budget silently priced every real run at zero, including the only one
 * that actually costs money. Its rate was OpenRouter's published headline rate for
 * `qwen/qwen3-coder` fetched on 2026-08-19 ($0.22 / $1.80 per 1M input/output tokens) —
 * refreshed on 2026-08-24 against the same catalog fetch that priced the eight new rows below,
 * because leaving a superseded rate in place under a table `PREISTABELLE_STAND` calls current
 * would have made that date vouch for a number the catalog no longer agrees with. Current
 * headline rate: $0.30 / $1.00 per 1M input/output tokens. OpenRouter routes this model across
 * several providers whose prices can differ, and Alibaba's own endpoint prices by context length
 * above 128k input tokens — so this remains a headline figure, not a per-provider guarantee, and
 * PREISTABELLE_STAND is the signal for how stale it may be. **A row in this table is not
 * "priced once and done" — it needs re-checking whenever PREISTABELLE_STAND moves, this row
 * being the proof.**
 *
 * The eight rows added 2026-08-24 (model/defaults.ts, the OpenRouter block comment there) come
 * straight from `GET https://openrouter.ai/api/v1/models` on that date — the `pricing.prompt`/
 * `pricing.completion` fields, which are USD per token, converted to cent per million tokens
 * (`usd_per_token * 1_000_000 * 100`, rounded to two decimal places — visible in
 * `openrouter-deepseek-v4-pro` below, whose raw conversion is 39.6894 / 79.3788). Every one of
 * them is the same kind of headline figure as `openrouter-qwen3-coder` above: OpenRouter can
 * route across several providers per model, and a provider can price by context length the way
 * Alibaba does — this table is not a guarantee for a specific request, only the best available
 * anchor, dated so its staleness stays visible.
 *
 * CK-NFR-012: this is an adjustable surface. It has an entry in docs/anpassbare-flaechen.md,
 * and tests/docs/anpassbare-flaechen.test.ts holds that entry in place.
 */

export const PREISTABELLE_STAND = '2026-08-24'

export interface Preis {
  /** Cent per million input tokens. */
  eingabeProMillion: number
  /** Cent per million output tokens. */
  ausgabeProMillion: number
}

export const VORGABE_PREISE: Record<string, Preis> = {
  // OpenRouter headline rate for qwen/qwen3-coder, keyed by the registry id
  // 'openrouter-qwen3-coder' (src/main/model/defaults.ts) — see the module comment above.
  // Refreshed 2026-08-24 (was 22/180, fetched 2026-08-19) so this row matches
  // PREISTABELLE_STAND instead of being silently superseded by it.
  'openrouter-qwen3-coder': { eingabeProMillion: 30, ausgabeProMillion: 100 },

  // The eight rows below: fetched from https://openrouter.ai/api/v1/models on 2026-08-24,
  // USD-per-token converted to cent-per-million-tokens — see the module comment above.
  'openrouter-qwen3-coder-plus': { eingabeProMillion: 65, ausgabeProMillion: 325 },
  'openrouter-kimi-k27-code': { eingabeProMillion: 67, ausgabeProMillion: 340 },
  'openrouter-codestral-2508': { eingabeProMillion: 30, ausgabeProMillion: 90 },
  'openrouter-deepseek-v4-pro': { eingabeProMillion: 39.69, ausgabeProMillion: 79.38 },
  'openrouter-glm-53': { eingabeProMillion: 140, ausgabeProMillion: 440 },
  'openrouter-minimax-m3': { eingabeProMillion: 30, ausgabeProMillion: 120 },
  'openrouter-qwen38-27b': { eingabeProMillion: 40, ausgabeProMillion: 300 },
  'openrouter-gpt-oss-120b': { eingabeProMillion: 3.70, ausgabeProMillion: 17 },
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
