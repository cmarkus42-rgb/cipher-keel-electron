/**
 * model-resolver — turn a Rahmen's `model` field into something a harness accepts.
 *
 * M2 sections 5.3 and 6.3 define two forms:
 *   Schenkel 1 (CLI harnesses): a tier label — light | standard | heavy. The concept
 *     calls concrete handles "fragil", which is why the mapping lives in the config
 *     and ships as aliases rather than pinned model ids.
 *   Schenkel 2 (NanoClaw): a `provider:modell` handle, e.g. `ollama:gemma3:27b`.
 *     It is passed through untouched — cipher keel does not own that namespace.
 *
 * An unresolvable value yields undefined, which means "omit --model and let the harness
 * decide" — the behaviour every session had before this existed.
 */

export interface ModelTiers {
  light: string
  standard: string
  heavy: string
}

const TIER_KEYS = new Set<string>(['light', 'standard', 'heavy'])

export function resolveModel(rahmenModel: string, tiers: ModelTiers): string | undefined {
  if (!rahmenModel) return undefined

  // A colon marks a provider-qualified handle (Schenkel 2) — never a tier.
  if (rahmenModel.includes(':')) return rahmenModel

  if (!TIER_KEYS.has(rahmenModel)) return undefined

  const handle = tiers[rahmenModel as keyof ModelTiers]
  return handle ? handle : undefined
}
