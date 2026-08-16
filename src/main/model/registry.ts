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

export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker'

export function alleEintraege(): ModellEintrag[] {
  const byId = new Map<string, ModellEintrag>()
  for (const e of DEFAULT_EINTRAEGE) byId.set(e.id, e)

  for (const raw of configStore.get('modelle').eintraege) {
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

/**
 * The CLI handle a tier assignment points at, or undefined when nothing is assigned.
 * Only a cli-harness entry has a handle; anything else means "no assignment for this tier"
 * rather than an error, because a session must still start.
 *
 * Two different "nothing" cases, and only one of them is quiet: an unassigned tier is the
 * normal, expected state for every tier that has not been configured — no warning. A tier
 * that names an entry which exists but is not a cli-harness is a wrong-shaped assignment
 * the user actually made, so it is skipped loudly, the same way alleEintraege() skips a
 * broken config entry loudly rather than losing it without a trace.
 */
export function cliHandleFuerTier(tier: Tier): string | undefined {
  const e = eintragFuerTier(tier)
  if (!e) return undefined
  if (e.erreichbarkeit.art === 'cli-harness') return e.erreichbarkeit.handle

  console.warn(
    `[model-registry] Tier '${tier}' zeigt auf den Eintrag '${e.id}', der kein CLI-Harness ` +
      'ist — ein CLI-Harness bringt sein Modell selbst mit. ' +
      'Es gilt weiterhin der Wert aus agent.modelTiers.'
  )
  return undefined
}
