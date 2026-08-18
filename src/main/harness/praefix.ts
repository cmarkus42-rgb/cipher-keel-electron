/**
 * praefix — the order of the prompt, and the reason it is worth money.
 *
 * The stable part must be byte-identical across turns or the provider's prompt cache misses and
 * every turn pays full price for the same opening. That is why there are no timestamps, no
 * counters and no round numbers in it, why keys are serialised sorted, and why a deferred tool
 * schema is appended to the *history* and never written back in here (M8 section 3.5).
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

/** Sorted keys, everywhere, so two equal objects have one spelling. */
export function serialisiereDeterministisch(wert: unknown): string {
  const besucht = new WeakSet<object>()
  return _serialisiere(wert, besucht)
}

function _serialisiere(wert: unknown, besucht: WeakSet<object>): string {
  if (Array.isArray(wert)) {
    return `[${wert.map(item => _serialisiere(item, besucht)).join(',')}]`
  }
  if (wert !== null && typeof wert === 'object') {
    const o = wert as Record<string, unknown>

    // Cycle detection: if this object is already on the current path, error.
    if (besucht.has(o)) {
      throw new Error('Die Eingabe enthaelt einen Zyklus und ist nicht deterministisch serialisierbar.')
    }

    // Add to visited set on the current path.
    besucht.add(o)

    try {
      const paare = Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${_serialisiere(o[k], besucht)}`)
      return `{${paare.join(',')}}`
    } finally {
      // Remove from visited set so the same object can appear in sibling positions.
      besucht.delete(o)
    }
  }
  return JSON.stringify(wert) ?? 'null'
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
