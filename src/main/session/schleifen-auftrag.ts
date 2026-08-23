/**
 * schleifen-auftrag — the one place that beauftragt a Niveau-B-Gitterzelle.
 *
 * `SESSION_AUFTRAG` (ipc-handlers.ts) and the `keel_zelle_beauftragen` MCP tool
 * (graph/mcp-server.ts) are two different doors into the same act: give a cell an order. Before
 * this file existed, only the IPC handler carried the beiStart/beiEnde wiring, and the MCP tool
 * would have had to copy it — the exact "two Zusammenbauten" this whole stretch has argued
 * against. `beauftrageZelle` is that one Zusammenbau; both doors call it.
 *
 * The race it guards against is documented in full at `SchleifenStartOpts.beiStart`
 * (agent-adapter.ts): `starteAuftrag` returns home as soon as the first `run.started` is
 * written, and the rest of the run continues in the background. `beiStart` — not the return
 * value — is what records the laufId, because a very short run can call `beiEnde` before
 * `starteAuftrag` itself resolves. Whoever only wrote the laufId in from the return value would
 * lose that race and leave the cell on `laeuft` forever.
 */

import type Database from 'better-sqlite3'
import type { Zellenregister } from './schleifen-sitzungen'
import { pruefeZelleFrei } from './schleifen-sitzungen'
import type { EntitaetsTeile, SchleifenSitzungsAdapter, SchleifenStartErgebnis } from '../agent/agent-adapter'
import type { SessionStatusChanged } from '../../shared/harness-types'
import type { Ereignis } from '../harness/ereignisse'

export type BeauftrageZelleErgebnis =
  | { ok: true; wert: SchleifenStartErgebnis }
  | { ok: false; meldung: string }

export interface BeauftrageZelleOpts {
  name: string
  /** Untrimmed — trimming happens here, once, so both callers can pass the raw field value. */
  auftragstext: string
  register: Zellenregister
  praefixJeZelle: ReadonlyMap<string, EntitaetsTeile>
  /**
   * The keel-harness adapter, already resolved and narrowed by the caller (`adapterRegistry.get
   * ('keel-harness')` plus `istSchleifenAdapter`). `undefined` means "not registered or not a
   * loop adapter" — the caller doesn't need to know the exact reason to hand this in.
   */
  adapter: SchleifenSitzungsAdapter | undefined
  harnessDb: () => Database.Database
  lesen: (db: Database.Database, laufId: string) => Ereignis[]
  /**
   * Called on every state transition (`laeuft` / `leerlaufend`). Optional: `SESSION_AUFTRAG`
   * broadcasts this to the renderer (the grid derives nothing itself, see
   * schleifen-sitzungen.ts); an MCP caller has no window to tell and can omit it — the register
   * mutation happens either way, since that register is the single source both paths read.
   */
  sendeStatus?: (status: SessionStatusChanged) => void
}

/**
 * Beauftragt a cell. Rejects an empty order, an unknown or busy cell, a missing adapter or a
 * cell without prefix parts — same four checks and same order `SESSION_AUFTRAG` always ran —
 * then drives `starteAuftrag` with the beiStart/beiEnde wiring described above.
 */
export async function beauftrageZelle(opts: BeauftrageZelleOpts): Promise<BeauftrageZelleErgebnis> {
  const text = opts.auftragstext.trim()
  if (text === '') return { ok: false, meldung: 'Der Auftrag ist leer.' }

  const frei = pruefeZelleFrei(opts.name, opts.register)
  if (!frei.ok) return { ok: false, meldung: frei.meldung }

  if (!opts.adapter) {
    return { ok: false, meldung: 'Der keel-harness-Adapter ist nicht registriert.' }
  }
  const praefix = opts.praefixJeZelle.get(opts.name)
  if (!praefix) {
    return { ok: false, meldung: `Fuer die Zelle '${opts.name}' liegen keine Praefixteile vor.` }
  }

  const sendeStatus = opts.sendeStatus ?? ((): void => {})

  // Set by beiStart as soon as the laufId is fixed — the only place the catch below knows which
  // run belongs to this cell. Stays null if the start fails before beiStart ever ran (e.g. an
  // unknown registry entry) — then this call never touched the cell, and the catch has nothing
  // to roll back.
  let gestarteterLauf: string | null = null

  try {
    const ergebnis = await opts.adapter.starteAuftrag({
      wurzel: frei.zelle.wurzel, sitzungsname: opts.name, auftragstext: text,
      eintragId: frei.zelle.eintragId, praefix, letzteLaufId: frei.zelle.laufId,

      beiStart: (laufId) => {
        gestarteterLauf = laufId
        opts.register.setzeLauf(opts.name, laufId)
        sendeStatus({ name: opts.name, zustand: 'laeuft', laufId })
      },

      beiEnde: (beendeterLauf) => {
        const zelle = opts.register.hole(opts.name)
        // Still the same run this cell owns? After a destroy-and-recreate under the same name,
        // the old run's finally would otherwise land on the new cell.
        if (!zelle || zelle.laufId !== beendeterLauf) return
        const letztes = [...opts.lesen(opts.harnessDb(), beendeterLauf)]
          .reverse().find(e => e.art === 'run.finished')
        const endzustand = typeof letztes?.nutzlast.endzustand === 'string'
          ? letztes.nutzlast.endzustand : null
        opts.register.setzeZustand(opts.name, 'leerlaufend', endzustand)
        sendeStatus({ name: opts.name, zustand: 'leerlaufend', endzustand })
      },
    })
    return { ok: true, wert: ergebnis }
  } catch (err) {
    // beiStart can have run BEFORE this throw (in the fresh branch it stands synchronously
    // ahead of starteHarnessLauf) — then the cell already stands on 'laeuft' with no beiEnde
    // ever coming, because starteHarnessLauf registers its `.finally()` only AFTER
    // baueLaufUmgebung. Same id comparison as beiEnde above, same reason: during this await
    // window the cell could have been destroyed and recreated with a new, genuinely running
    // order — that must not be rolled back here.
    if (gestarteterLauf) {
      const zelle = opts.register.hole(opts.name)
      if (zelle && zelle.laufId === gestarteterLauf) {
        // Explicit null, not omitting the third argument — setzeZustand would otherwise leave
        // an old letzterEndzustand standing (see its own comment: "if (endzustand !==
        // undefined)"), and register vs. broadcast would diverge on exactly this error path.
        opts.register.setzeZustand(opts.name, 'leerlaufend', null)
        sendeStatus({ name: opts.name, zustand: 'leerlaufend', endzustand: null })
      }
    }
    return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
  }
}
