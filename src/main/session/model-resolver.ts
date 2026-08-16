/**
 * model-resolver — turn a Rahmen's `model` field into something a harness accepts.
 *
 * M2 sections 5.3 and 6.3 define two forms:
 *   Schenkel 1 (CLI harnesses): a tier label — light | standard | heavy. The concept
 *     calls concrete handles "fragil", which is why the mapping lives in the config
 *     and ships as aliases rather than pinned model ids.
 *   A provider-qualified handle (`ollama:gemma4:26b`) is passed through untouched —
 *     cipher keel does not own that namespace. It used to be labelled "Schenkel 2
 *     (NanoClaw)"; NanoClaw was superseded on 2026-08-16 (M6 addendum), the form was not.
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

/**
 * Where a tier's handle comes from when the registry has an assignment for it. Injected
 * rather than imported so this module stays pure and testable without a config file.
 */
export type TierLookup = (tier: keyof ModelTiers) => string | undefined

export function resolveModel(
  rahmenModel: string,
  tiers: ModelTiers,
  lookup?: TierLookup
): string | undefined {
  if (!rahmenModel) return undefined

  // A colon marks a provider-qualified handle — never a tier, and never a registry lookup.
  if (rahmenModel.includes(':')) return rahmenModel

  if (!TIER_KEYS.has(rahmenModel)) return undefined
  const tier = rahmenModel as keyof ModelTiers

  // Registry first, configured tier value second. An unresolvable value still yields
  // undefined, which means "omit --model" — a missing registry must not stop a session.
  const ausRegistry = lookup?.(tier)
  if (ausRegistry) return ausRegistry

  const handle = tiers[tier]
  return handle ? handle : undefined
}
