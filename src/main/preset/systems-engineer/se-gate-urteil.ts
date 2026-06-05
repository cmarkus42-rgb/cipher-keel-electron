/**
 * seGateUrteil — SE-initiated gate assessment with gewichtung annotation.
 *
 * Delegates structural coverage to autoGateBefund, then sets the SE's
 * gewichtung annotation on the freshly written befund node.
 *
 * CK-3C-003
 */

import type Database from 'better-sqlite3'
import { autoGateBefund } from '../../graph/phase-contract'
import { graphQuery } from '../../graph/query'
import type { GateBefundAttrs } from '../../graph/node-types'

export interface GateUrteilResult {
  befund_uid: string
  attrs: GateBefundAttrs
}

/**
 * Run a gate assessment for a phase and annotate the befund with a gewichtung.
 *
 * @param graphDb   - open better-sqlite3 database handle
 * @param phaseUid  - UID of the phase node to assess
 * @param gewichtung - SE's weighting annotation (free text)
 */
export async function seGateUrteil(
  graphDb: Database.Database,
  phaseUid: string,
  gewichtung: string
): Promise<GateUrteilResult> {
  // 1. Run structural coverage gate — creates gate_befund node + gate_fuer edge
  const attrs = await autoGateBefund(graphDb, phaseUid, 'coverage')

  // 2. Locate the freshly created befund (most recent for this phase)
  const queryResult = graphQuery(graphDb, {
    template: 'gate_befunde_fuer_phase',
    params: { phase_uid: phaseUid },
  })

  const befundUid = queryResult.rows[0]?.uid as string | undefined
  if (!befundUid) {
    throw new Error(`seGateUrteil: gate_befund node not found after creation for phase '${phaseUid}'`)
  }

  // 3. Persist gewichtung annotation into the befund frontmatter
  graphDb.prepare(
    `UPDATE node SET frontmatter = json_set(frontmatter, '$.gewichtung', ?) WHERE uid = ?`
  ).run(gewichtung, befundUid)

  return {
    befund_uid: befundUid,
    attrs: { ...attrs, gewichtung },
  }
}
