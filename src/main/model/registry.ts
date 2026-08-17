/**
 * registry — the one list, and the order in which an assignment is resolved.
 *
 * Two rules carry the whole module:
 *
 *   1. Config entries override bundled ones by id; unknown ids are added.
 *   2. An assignment that names nothing resolves to null, and the caller falls back to
 *      the old value. That is what makes a config file written before this feature behave
 *      exactly as it did.
 *
 * A broken config entry is skipped with a warning rather than taking the registry down:
 * one bad hand-edited line should not cost a user every model they have.
 */

import { configStore } from '../config/config-store'
import { DEFAULT_EINTRAEGE } from './defaults'
import { normaliseEintrag, type ModellEintrag } from './entry'
import { sperrgrund } from './eignung'
import { slotFuerTier, type Tier, type Rolle } from './slots'

export type { Tier, Rolle } from './slots'

export function alleEintraege(): ModellEintrag[] {
  const byId = new Map<string, ModellEintrag>()
  for (const e of DEFAULT_EINTRAEGE) byId.set(e.id, e)

  const eintraege = configStore.get('modelle').eintraege
  if (!Array.isArray(eintraege)) {
    // Same posture as the per-entry skip below: a hand-edited config that broke the shape
    // of the whole list is treated as empty, not as a crash — the docblock above promises
    // exactly that.
    console.warn('[model-registry] modelle.eintraege ist kein Array — wird als leer behandelt.')
    return [...byId.values()]
  }

  for (const raw of eintraege) {
    try {
      const e = normaliseEintrag(raw)
      byId.set(e.id, e)
    } catch (err) {
      // Loud, not silent — a skipped entry that says nothing is the expensive kind of failure.
      console.warn('[model-registry] Eintrag aus der Konfiguration uebersprungen:', err)
    }
  }
  return [...byId.values()]
}

export function eintragNachId(id: string): ModellEintrag | null {
  if (!id) return null
  return alleEintraege().find(e => e.id === id) ?? null
}

export function eintragFuerTier(tier: Tier): ModellEintrag | null {
  return eintragNachId(configStore.get('modelle').zuordnung.tiers[tier])
}

export function eintragFuerRolle(rolle: Rolle): ModellEintrag | null {
  return eintragNachId(configStore.get('modelle').zuordnung.rollen[rolle])
}

/** What resolving a tier's CLI handle produced. Never both fields absent and set at once. */
export interface CliHandleErgebnis {
  /** Only a cli-harness entry has a handle. */
  handle?: string
  /**
   * German: reaches the user, e.g. via the prompt preview. Set exactly when a tier names
   * an entry that exists but is not a cli-harness — the caller degrades to the legacy
   * `agent.modelTiers` value, and this says why, so the degradation is not silent.
   */
  hinweis?: string
}

/**
 * The CLI handle a tier assignment points at, or a hinweis when nothing usable is
 * assigned. Only a cli-harness entry has a handle; anything else means "no assignment for
 * this tier" rather than an error, because a session must still start.
 *
 * Two different "nothing" cases, and only one of them is quiet: an unassigned tier is the
 * normal, expected state for every tier that has not been configured — no warning, no
 * hinweis. A tier that names an entry which exists but is not a cli-harness is a
 * wrong-shaped assignment the user actually made, so it is reported loudly (console.warn
 * for a developer, hinweis for a surface the user actually looks at), the same way
 * alleEintraege() skips a broken config entry loudly rather than losing it without a trace.
 */
export function cliHandleFuerTier(tier: Tier): CliHandleErgebnis {
  const e = eintragFuerTier(tier)
  if (!e) return {}
  if (e.erreichbarkeit.art === 'cli-harness') return { handle: e.erreichbarkeit.handle }

  // The rule that a fremdes-cli laeufer cannot drive this art of entry lives in eignung.ts;
  // this only adds the context (which tier, which entry, what happens instead).
  // The runner is a property of the slot, stated once in slots.ts — not restated here.
  const hinweis =
    `Tier '${tier}' zeigt auf den Eintrag '${e.id}'. ` +
    `${sperrgrund(slotFuerTier(tier).laeufer, e.art)} Es gilt weiterhin der Wert aus agent.modelTiers.`
  console.warn(`[model-registry] ${hinweis}`)
  return { hinweis }
}
