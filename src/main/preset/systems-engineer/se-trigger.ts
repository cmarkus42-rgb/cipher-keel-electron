/**
 * createTrigger — SE trigger node creation + triggert edge.
 *
 * Writes a trigger node to the graph and links it to the target phase via
 * a triggert edge. Validates gate_befund_id when provided.
 *
 * CK-3C-003
 */

import type Database from 'better-sqlite3'
import { GraphWriter } from '../../graph/writer'
import type { TriggerAttrs } from '../../graph/node-types'

export interface CreateTriggerResult {
  trigger_uid: string
}

/**
 * Create a trigger node and wire it to the target phase.
 *
 * @param graphDb - open better-sqlite3 database handle
 * @param attrs   - TriggerAttrs; gate_befund_id is validated if non-null
 */
export async function createTrigger(
  graphDb: Database.Database,
  attrs: TriggerAttrs
): Promise<CreateTriggerResult> {
  // 1. Validate gate_befund_id if provided
  if (attrs.gate_befund_id !== null) {
    const exists = graphDb.prepare(
      "SELECT 1 FROM node WHERE uid = ? AND kind = 'gate_befund'"
    ).get(attrs.gate_befund_id)
    if (!exists) {
      throw new Error(
        `createTrigger: gate_befund node '${attrs.gate_befund_id}' not found`
      )
    }
  }

  // 2. Look up target phase by name (phasen_ziel is a phase name, not a UID)
  const phaseRow = graphDb.prepare(
    `SELECT uid FROM node WHERE kind = 'phase' AND json_extract(frontmatter, '$.name') = ?`
  ).get(attrs.phasen_ziel) as { uid: string } | undefined

  if (!phaseRow) {
    throw new Error(
      `createTrigger: phase '${attrs.phasen_ziel}' not found in graph`
    )
  }

  const writer = new GraphWriter(graphDb)

  // 3. Create trigger node (path uses timestamp for uniqueness — each trigger is a distinct event)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const trigger = writer.upsertNode({
    kind: 'trigger',
    title: `Trigger → ${attrs.phasen_ziel}`,
    path: `/triggers/${attrs.entitaets_id}/${attrs.phasen_ziel}-${timestamp}`,
    frontmatter: { ...attrs },
  })

  // 4. Create triggert edge: trigger → phase
  writer.linkEdge({
    src: trigger.uid,
    dst: phaseRow.uid,
    type: 'triggert',
    source: 'inferred',
  })

  return { trigger_uid: trigger.uid }
}
