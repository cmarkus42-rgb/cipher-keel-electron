/**
 * praefix — the order of the prompt, and the reason it is worth money.
 *
 * The stable part must be byte-identical across turns or the provider's prompt cache misses and
 * every turn pays full price for the same opening. That is why there are no timestamps, no
 * counters and no round numbers in it, and why a deferred tool schema is appended to the
 * *history* and never written back in here (M8 section 3.5). The stable part itself never
 * serialises anything — it is plain strings joined together (see `baueStabilenTeil` below) — so
 * there is nothing here whose key order could threaten the cache in the first place.
 *
 * Stubs only: name plus one line. The full schema is fetched on demand.
 */

import type { WerkzeugStummel } from './codec'

export interface PraefixTeile {
  body: string
  capabilities: string
  persona: string
  globaleRegeln: string
  auftragstext: string
}

export function baueStabilenTeil(teile: PraefixTeile, werkzeuge: WerkzeugStummel[]): string {
  const abschnitte = [
    teile.body,
    teile.capabilities,
    teile.persona,
    teile.globaleRegeln,
    `## Auftrag\n\n${teile.auftragstext}`,
  ].filter(a => a.trim().length > 0)

  if (werkzeuge.length > 0) {
    // Sorted by name: the order in which the registry happens to hand them over must not move
    // a single byte of the stable part.
    const zeilen = [...werkzeuge]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(w => `- \`${w.name}\` — ${w.beschreibung}`)
    abschnitte.push(`## Werkzeuge\n\n${zeilen.join('\n')}`)
  }

  return abschnitte.join('\n\n')
}

/**
 * The volatile tail. Empty when there are no units — a run without tool calls appends nothing,
 * and appending an empty heading would be a byte that says nothing.
 */
export function baueFortschritt(offen: string[], erledigt: string[]): string {
  if (offen.length === 0 && erledigt.length === 0) return ''
  const zeilen: string[] = ['## Fortschritt', '']
  for (const e of erledigt) zeilen.push(`- [x] ${e}`)
  for (const o of offen) zeilen.push(`- [ ] ${o}`)
  return zeilen.join('\n')
}
