/**
 * harness-handlers — the harness's IPC surface.
 *
 * It lives *outside* src/main/harness/ on purpose. settings/handlers.ts imports electron from
 * inside its feature directory, and copying that here would mean an exception in the guard test
 * that checks the core knows no Electron. An exception list is how a guard quietly stops
 * guarding — this project had that exact failure this month. So the rule stays "no module under
 * src/main/harness/ imports electron", with no addendum, and the surface lives here.
 *
 * Both rules of the settings handlers hold: validate in main, never trust the renderer; and
 * broadcast through event-bus, never through a captured BrowserWindow.
 *
 * One correction against the sketch this file was built from: `LaufUmgebung.sende` takes the
 * wire body *and* the praefix (`(koerper, praefix) => Promise<ModelAntwort>`) — neither codec's
 * `toWire()` writes a system prompt, so folding the praefix in is this transport glue's job, not
 * the loop's (see `mitSystemPraefix` below). And `HARNESS_LAUF_STARTEN` does not `await` the run
 * to completion: `starteLauf` only resolves once the whole multi-turn loop is done, and awaiting
 * it here would block the IPC round trip for the run's entire duration — the renderer's abort
 * button, gated on having a laufId, would only ever become clickable after there was nothing
 * left to abort. Instead the handler races the loop's own first write against the run promise
 * settling, so a synchronous startup failure (unknown codec, a cli-harness entry with no
 * capability row) still surfaces as a normal error response, while a successful start returns
 * immediately and the rest of the run continues in the background, reachable from here on only
 * through the broadcast stream and the abort mark.
 */

import { ipcMain, app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  HARNESS_LAUF_STARTEN, HARNESS_LAUF_LESEN, HARNESS_LAUF_ABBRECHEN, HARNESS_EREIGNIS,
} from '../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis, LaufAnzeige, LaufStartWunsch } from '../shared/harness-types'
import { broadcast } from './event-bus'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { eintragNachId } from './model/registry'
import { toModelEndpoint, type Faehigkeiten, type ModellEintrag } from './model/entry'
import { clientForEndpoint } from './worker/model-client'
import { assemblePraefixTeile } from './harness-praefix-quelle'
import {
  starteLauf, oeffneHarnessDb, lesen, laufIds, codecFuer,
  WerkzeugRegistry, DATEI_WERKZEUGE, GRAPH_WERKZEUGE,
} from './harness'
import type { ModelAntwort } from './harness'
import type { AppServices } from './window-manager'

let db: ReturnType<typeof oeffneHarnessDb> | null = null
/** Run ids marked for cancellation. Read at the loop's turn boundary, never mid-request (9.1). */
const abbruchmarken = new Set<string>()

/** Placeholder until the harness window can set its own budgets — every run gets the same one. */
const STANDARD_BUDGETS = { runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8 }

function harnessDb(): ReturnType<typeof oeffneHarnessDb> {
  if (!db) {
    db = oeffneHarnessDb(
      join(app.getPath('userData'), 'harness.db'),
      resolveBetterSqliteBinding(join(app.getAppPath(), 'node_modules', 'better-sqlite3')),
    )
  }
  return db
}

function fehler(err: unknown): HarnessAntwort<never> {
  return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
}

/**
 * Folds the volatile praefix into the wire body. Neither codec's `toWire()` writes a system
 * field — it only knows the conversation and the tool stubs — so the transport is where the two
 * pieces the loop hands over separately (`koerper`, `praefix`) become the one request a provider
 * actually expects: Anthropic as its own top-level field, OpenAI-compatible dialects as the
 * first message.
 */
function mitSystemPraefix(koerper: unknown, praefix: string, codec: Faehigkeiten['codec']): unknown {
  const k = koerper as Record<string, unknown>
  if (codec === 'anthropic') return { ...k, system: praefix }
  const nachrichten = Array.isArray(k.messages) ? k.messages : []
  return { ...k, messages: [{ role: 'system', content: praefix }, ...nachrichten] }
}

/**
 * The transport, wired to the codec. The loop hands over the wire body and gets blocks back —
 * it never learns which of the three clients answered.
 *
 * Built eagerly in the handler but only touches `eintrag.faehigkeiten` once actually called:
 * by the time the loop invokes `sende`, `starteLauf`'s own `pruefeStartbedingungen` has already
 * run and would have thrown otherwise, so the non-null assertion here is safe and never the
 * first thing to fail.
 */
function sendeUeberTransport(eintrag: ModellEintrag) {
  return async (koerper: unknown, praefix: string): Promise<ModelAntwort> => {
    const f = eintrag.faehigkeiten!
    const endpunkt = toModelEndpoint(eintrag.erreichbarkeit, f.codec)
    const roh = await clientForEndpoint(endpunkt).chat({
      koerper: mitSystemPraefix(koerper, praefix, f.codec), endpoint: endpunkt,
    })
    return codecFuer(f.codec).fromWire(roh)
  }
}

/** Every run's summary, oldest first — same order as `laufIds()`. There is no run table; this
 *  reads each run's own log, exactly as `laufIds()` itself derives the id list from it. */
function laufUebersicht(datenbank: ReturnType<typeof oeffneHarnessDb>): LaufAnzeige[] {
  return laufIds(datenbank).map((id) => {
    const ereignisse = lesen(datenbank, id)
    const gestartet = ereignisse.find((e) => e.art === 'run.started')
    const beendet = [...ereignisse].reverse().find((e) => e.art === 'run.finished')
    return {
      laufId: id,
      modellId: typeof gestartet?.nutzlast.modellId === 'string' ? gestartet.nutzlast.modellId : '',
      gestartetTs: gestartet?.ts ?? '',
      endzustand: typeof beendet?.nutzlast.endzustand === 'string' ? beendet.nutzlast.endzustand : null,
    }
  })
}

export function registerHarnessHandlers(services: AppServices): void {
  ipcMain.handle(HARNESS_LAUF_STARTEN, async (_e, roh: unknown): Promise<HarnessAntwort<string>> => {
    try {
      const w = roh as Partial<LaufStartWunsch> | null
      if (!w || typeof w.auftragstext !== 'string' || w.auftragstext.trim() === '') {
        return { ok: false, meldung: 'Der Auftrag ist leer.' }
      }
      if (typeof w.modellId !== 'string' || w.modellId === '') {
        return { ok: false, meldung: 'Es ist kein Modell gewaehlt.' }
      }
      if (typeof w.wurzel !== 'string' || w.wurzel === '') {
        return { ok: false, meldung: 'Es ist keine Projektwurzel gewaehlt.' }
      }
      let wurzelStat
      try {
        wurzelStat = statSync(w.wurzel)
      } catch {
        return { ok: false, meldung: `Die Wurzel '${w.wurzel}' ist nicht erreichbar.` }
      }
      if (!wurzelStat.isDirectory()) {
        return { ok: false, meldung: `Die Wurzel '${w.wurzel}' ist kein Verzeichnis.` }
      }

      const eintrag = eintragNachId(w.modellId)
      if (!eintrag) return { ok: false, meldung: `Kein Registry-Eintrag '${w.modellId}'.` }

      // Minted here, not inside starteLauf: the abort mark is keyed by it, and a run that
      // cannot be cancelled during its first turn is a run that cannot be cancelled.
      const laufId = randomUUID()

      let markiereGestartet: (() => void) | null = null
      const wennGestartet = new Promise<void>((resolve) => { markiereGestartet = resolve })

      const laufPromise = starteLauf(
        {
          auftragstext: w.auftragstext,
          modellId: w.modellId,
          wurzel: w.wurzel,
          anhaenge: Array.isArray(w.anhaenge) ? w.anhaenge.filter((a): a is string => typeof a === 'string') : undefined,
          budgets: STANDARD_BUDGETS,
        },
        {
          db: harnessDb(),
          eintrag,
          praefixTeile: assemblePraefixTeile(w.auftragstext),
          wache: {
            wurzel: w.wurzel,
            heim: homedir(),
            userDataPfad: app.getPath('userData'),
          },
          graphDb: services.graphDb,
          registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE]),
          strom: (ev) => {
            broadcast(HARNESS_EREIGNIS, ev as HarnessEreignis)
            // The first appended event is always run.started — see lauf.ts's starteLauf, which
            // writes it before entering the loop. Once it lands, startup has succeeded.
            if (markiereGestartet) { markiereGestartet(); markiereGestartet = null }
          },
          uhr: () => Date.now(),
          abgebrochen: () => abbruchmarken.has(laufId),
          sende: sendeUeberTransport(eintrag),
        },
        laufId,
      )

      // A bug in the loop past this point is reported through run.finished, not a rejection —
      // see lauf.ts's own try/catch around the transport call. This is only a safety net so an
      // exception nobody awaits does not become a silent unhandled rejection, plus cleanup of
      // the abort mark so it does not outlive the run it was keyed to.
      laufPromise
        .catch((err) => {
          console.error(
            `[harness-handlers] Lauf '${laufId}' endete mit einem unbehandelten Fehler:`,
            err instanceof Error ? err.message : String(err),
          )
        })
        .finally(() => { abbruchmarken.delete(laufId) })

      await Promise.race([wennGestartet, laufPromise])
      return { ok: true, wert: laufId }
    } catch (err) {
      return fehler(err)
    }
  })

  ipcMain.handle(HARNESS_LAUF_LESEN, (_e, laufId: unknown): HarnessAntwort<HarnessEreignis[] | LaufAnzeige[]> => {
    try {
      const datenbank = harnessDb()
      if (typeof laufId !== 'string' || laufId === '') {
        // No argument means "which runs exist" — the run list is a projection too, just like
        // laufIds() itself: there is no run table to query instead.
        return { ok: true, wert: laufUebersicht(datenbank) }
      }
      return { ok: true, wert: lesen(datenbank, laufId) as HarnessEreignis[] }
    } catch (err) {
      return fehler(err)
    }
  })

  ipcMain.handle(HARNESS_LAUF_ABBRECHEN, (_e, laufId: unknown): HarnessAntwort<true> => {
    if (typeof laufId !== 'string' || laufId === '') {
      return { ok: false, meldung: 'Es ist kein Lauf genannt.' }
    }
    // The mark is read at the turn boundary. A request in flight is not cut off — see spec 9.1.
    // An id that names no running (or no longer existing) run is accepted without complaint:
    // the mark is a cheap set membership that self-cleans once its run finishes, and telling
    // "already finished" apart from "never existed" is not worth a second query here.
    abbruchmarken.add(laufId)
    return { ok: true, wert: true }
  })
}
