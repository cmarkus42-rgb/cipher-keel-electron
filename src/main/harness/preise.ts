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
 * CK-NFR-012: this is an adjustable surface. It has an entry in docs/anpassbare-flaechen.md,
 * and tests/docs/anpassbare-flaechen.test.ts holds that entry in place.
 */

export const PREISTABELLE_STAND = '2026-08-18'

export interface Preis {
  /** Cent per million input tokens. */
  eingabeProMillion: number
  /** Cent per million output tokens. */
  ausgabeProMillion: number
}

export const VORGABE_PREISE: Record<string, Preis> = {
  'claude-opus-5': { eingabeProMillion: 1500, ausgabeProMillion: 7500 },
  'claude-sonnet-5': { eingabeProMillion: 300, ausgabeProMillion: 1500 },
  'claude-haiku-4-5-20251001': { eingabeProMillion: 100, ausgabeProMillion: 500 },
  // Everything local costs nothing per token; the machine is paid for either way.
  'gemma4:26b': { eingabeProMillion: 0, ausgabeProMillion: 0 },
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
