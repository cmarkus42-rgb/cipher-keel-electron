/**
 * intent-vor-effekt — the check behind "kein Effekt ohne Intent" (M8 section 3.2, design table
 * row "Kein Effekt ohne Intent").
 *
 * A pure function over the event log, not a rule re-implemented inline in a test: a guard test
 * that hand-builds an event array *and* re-derives the ordering rule over it proves nothing about
 * `lauf.ts`, which is the only place that actually writes these events. Extracting the rule here
 * lets the guard drive `starteLauf` for real and check what the loop actually produced, and lets
 * the checker itself be tested directly against data it did not construct to pass.
 */

import type { Ereignis } from './ereignisse'

/**
 * Every `tool.completed` or `tool.failed` whose `aufrufId` has no preceding `tool.intent` in the
 * same log. Empty means the invariant holds. Order matters — a completion is only covered by an
 * intent that appears *before* it in the sequence, not merely present somewhere in the log.
 */
export function effekteOhneIntent(ereignisse: Ereignis[]): Ereignis[] {
  const angekuendigt = new Set<string>()
  const verletzungen: Ereignis[] = []
  for (const e of ereignisse) {
    if (e.art === 'tool.intent') {
      angekuendigt.add(String(e.nutzlast.aufrufId))
      continue
    }
    if (e.art !== 'tool.completed' && e.art !== 'tool.failed') continue
    if (!angekuendigt.has(String(e.nutzlast.aufrufId))) verletzungen.push(e)
  }
  return verletzungen
}
