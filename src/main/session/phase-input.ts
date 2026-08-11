/**
 * phase-input — the fifth assembly layer, the one that says where in the process we are.
 *
 * M2 sections 9.1 and 17.4 list five layers for an entity prompt: body, persona, global
 * rules, capability branches, and the graph-resolved phaseninput. Four were assembled;
 * this is the fifth. Without it an entity starts knowing its role and not its task, and
 * M4's graph-mediated handoff (section 6.1) has no carrier in the prompt at all.
 *
 * **Pointers, not content.** A phasenoutput artefakt is named here by uid, title and —
 * when it has one — path. It is deliberately not inlined: the artefakte of a preceding
 * phase can be arbitrarily large, and every entity that receives this layer has graph
 * access to fetch them. The uid is the reliable pointer; `node.path` is free-form and
 * nullable (see writer.ts), so it travels as a hint. No `@`-line is emitted for it —
 * an `@`-reference to a path that is not a file in the project is a dangling reference,
 * which is worse than a title.
 *
 * CK-PROC-003: phaseninput as a typed graph reference, resolved by query rather than by
 * a fixed predecessor — which is why an entity bound to several phases (the Workshop,
 * across fixing and development) simply resolves several times.
 */

import type Database from 'better-sqlite3'
import { resolvePhaseInput, type PhaseInputArtefakt } from '../graph/phase-contract'

/** One line per artefakt: what it is, and how to fetch it. */
function formatArtefakt(a: PhaseInputArtefakt): string {
  const pfad = a.path ? `, Pfad \`${a.path}\`` : ''
  return `- **${a.title}** (${a.kind}) — uid \`${a.uid}\`${pfad}`
}

/**
 * Build the PhaseInput section body for an entity's bound phases, or undefined when
 * there is nothing to say.
 *
 * Undefined rather than an empty section in three cases, all of them normal:
 *   - the entity is bound to no phase (the Systems Engineer lies across them)
 *   - no bound phase has a predecessor output yet (a fresh project)
 *   - the graph is unavailable — a degraded graph must never block a session start
 */
export async function buildPhaseInputSection(
  graphDb: Database.Database | null,
  phasenBindung: readonly string[],
): Promise<string | undefined> {
  if (!graphDb || phasenBindung.length === 0) return undefined

  const bloecke: string[] = []
  for (const phase of phasenBindung) {
    let input
    try {
      input = await resolvePhaseInput(graphDb, phase)
    } catch (err) {
      // A broken query must cost the entity its context layer, not its session.
      console.warn(`[phase-input] resolve failed for phase '${phase}':`, err)
      continue
    }
    if (input.artefakte.length === 0) continue
    bloecke.push(`## Phase ${phase}\n${input.artefakte.map(formatArtefakt).join('\n')}`)
  }

  if (bloecke.length === 0) return undefined

  return (
    'Das ist der Input deiner Phase — die Ergebnisse der jeweils vorangegangenen Phase. ' +
    'Lies die Artefakte über den Graphen (uid), bevor du mit der Arbeit beginnst; sie sind ' +
    'hier bewusst nur benannt, nicht eingefügt.\n\n' +
    bloecke.join('\n\n')
  )
}
