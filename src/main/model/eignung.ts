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
  return (
    'Ein Abo-Kontingent wird nie durch die eigene Schleife gefahren: Das hiesse, ein ' +
    'Abo-OAuth-Token durch eine eigene API-Schleife zu schicken. Das ist eine ' +
    'Nutzungsbedingung, keine Faehigkeitsfrage.'
  )
}
