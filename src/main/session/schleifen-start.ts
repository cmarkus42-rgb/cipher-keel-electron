/**
 * schleifen-start — what an entity definition and a registry entry become.
 *
 * Pure: no electron, no IO, no configStore access. Everything arrives as an argument, so a
 * test can drive **this** construction instead of a rebuild. The rebuild in
 * werkzeugliste.test.ts was green while half the tool list was not wired up.
 */

import type { EntitaetsTeile } from '../agent/agent-adapter'
import type { SchleifenZelle } from './schleifen-sitzungen'
import type { ModellEintrag } from '../model/entry'
import type { EntityDefinition } from '../preset/registry'
import { getGlobalRules } from '../preset/global-rules'
import { platzNiveauBLeerText } from '../model/sitzungsplatz-text'

export function baueSchleifenSitzung(args: {
  name: string
  cwd: string
  entityId: string
  def: EntityDefinition
  /** From the `sitzung:niveau-b` assignment slot. null means: the slot is empty. */
  eintrag: ModellEintrag | null
}):
  | { ok: true; zelle: SchleifenZelle; praefix: EntitaetsTeile }
  | { ok: false; meldung: string } {
  if (!args.eintrag) {
    // No fallback, and that is the decision: the obvious one would be llm.worker, and that is
    // a one-shot endpoint for a single job, not a session.
    //
    // Last-resort safeguard, not the gate a user actually meets: ipc-handlers.ts calls
    // `adapter.isAvailable()` before ever reaching this function, and KeelHarnessAdapter's
    // own check (agent/adapters/keel-harness.ts) already refuses an empty slot there, with
    // the same text below. This branch only fires if that ordering is ever broken — a caller
    // that skips the availability gate, or a future second Sitzungsart-B adapter that forgets
    // its own check. It stays because "cannot happen today" is not the same guarantee as
    // "cannot happen".
    return { ok: false, meldung: platzNiveauBLeerText() }
  }
  return {
    ok: true,
    zelle: {
      name: args.name, wurzel: args.cwd, entityId: args.entityId,
      eintragId: args.eintrag.id, zustand: 'leerlaufend',
      laufId: null, letzterEndzustand: null,
    },
    praefix: {
      body: args.def.body,
      persona: args.def.persona ?? '',
      // Empty, and permanently so: this entity's capabilities do NOT reach the model through
      // this field, but through the capability root. `materialiseCapabilities` writes them to
      // `.claude/capabilities/`, `leseFaehigkeiten` finds them there, and `baueStabilenTeil`
      // sets name and description as a stub in the stable prefix — the body comes on demand
      // via `faehigkeit_lesen`. Putting the full text here would bypass that lazy loading and
      // pay for text the model does not need in most turns.
      capabilities: '',
      globaleRegeln: getGlobalRules(args.def.rahmen.capabilityNiveau),
    },
  }
}
