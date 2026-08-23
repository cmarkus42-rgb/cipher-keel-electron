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
    return {
      ok: false,
      meldung:
        'Der Platz „Sitzung „Niveau B"" ist nicht belegt — ohne Modell startet keine ' +
        'Niveau-B-Zelle. Einstellungen → Modelle.',
    }
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
