/**
 * eignung — the two matrices, and the only place either of them is stated.
 *
 * They are separated on purpose. The structural matrix says what is impossible; the
 * warnings say what is risky. A single matrix mixing both cannot be implemented by a
 * surface that must lock *and* warn without rule and display drifting apart — which is
 * exactly what happened to the capability lists that knew the same thing in five places.
 *
 * The basic concept (section 5) says the matrix belongs in the code, not in the surface.
 * `tests/model/eignung-einzige-quelle.test.ts` is what keeps that true.
 */

import type { Anbieterart } from './entry'
import { CapabilityNiveau } from '../preset/niveau'

/** How work is done. Two of the three are session runtimes; `ein-schuss` is per job. */
export type Laeufer = 'fremdes-cli' | 'eigene-schleife' | 'ein-schuss'

export const LAEUFER: readonly Laeufer[] = ['fremdes-cli', 'eigene-schleife', 'ein-schuss']

const STRUKTUR: Record<Laeufer, ReadonlySet<Anbieterart>> = {
  'fremdes-cli': new Set<Anbieterart>(['cli-harness']),
  'eigene-schleife': new Set<Anbieterart>(['local-http', 'api']),
  'ein-schuss': new Set<Anbieterart>(['local-http', 'api']),
}

export function laeuferKannArt(laeufer: Laeufer, art: Anbieterart): boolean {
  return STRUKTUR[laeufer].has(art)
}

/** German: this text reaches the user. Null when the cell is open. */
export function sperrgrund(laeufer: Laeufer, art: Anbieterart): string | null {
  if (laeuferKannArt(laeufer, art)) return null
  if (laeufer === 'fremdes-cli') {
    return 'Ein CLI-Harness bringt sein Modell selbst mit — ein anderes dort einzutragen waere eine stille Falle.'
  }
  // Any keel-driven runner against a cli-harness (eigene-schleife or ein-schuss)
  return (
    'Ein CLI-Harness ist kein Endpunkt, sondern ein eigener Prozess mit eigener Sitzung — ' +
    'keel kann es nicht direkt ansprechen. Und ein Abo-Kontingent wird nie durch eine eigene ' +
    'Schleife gefahren: Das hiesse, ein Abo-OAuth-Token durch eine eigene API-Schleife zu ' +
    'schicken. Das ist eine Nutzungsbedingung, keine Faehigkeitsfrage.'
  )
}

/**
 * A is the strongest demand, C the weakest. Rank rather than string compare, so the rule
 * reads as the rule instead of as an alphabetical accident.
 */
const RANG: Record<CapabilityNiveau, number> = {
  [CapabilityNiveau.A]: 3,
  [CapabilityNiveau.B]: 2,
  [CapabilityNiveau.C]: 1,
}

/**
 * The own loop stands on A because of decision E21 — v1 carries A-worthy work, not only B.
 * With the ratification of 2026-08-16 ("alles 0.1") there is no interim state in which it
 * would carry less, so none is modelled here.
 */
const FAEHIGKEIT: Record<Laeufer, CapabilityNiveau> = {
  'fremdes-cli': CapabilityNiveau.A,
  'eigene-schleife': CapabilityNiveau.A,
  'ein-schuss': CapabilityNiveau.C,
}

export function laeuferFaehigkeit(laeufer: Laeufer): CapabilityNiveau {
  return FAEHIGKEIT[laeufer]
}

export function laeuferTraegtNiveau(laeufer: Laeufer, niveau: CapabilityNiveau): boolean {
  return RANG[FAEHIGKEIT[laeufer]] >= RANG[niveau]
}
