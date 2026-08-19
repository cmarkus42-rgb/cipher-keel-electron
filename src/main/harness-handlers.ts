/**
 * harness-handlers — the harness's IPC surface.
 *
 * It lives *outside* src/main/harness/ on purpose. settings/handlers.ts imports electron from
 * inside its feature directory, and copying that here would mean an exception to the rule that
 * no module under src/main/harness/ imports electron. An exception list is how a guard quietly
 * stops guarding — this project had that exact failure this month. So the rule stays "no module
 * under src/main/harness/ imports electron", with no addendum, and the surface lives here.
 * The boundary is an automated guard now: `tests/harness/waechter-kern.test.ts` scans every
 * module under src/main/harness/ for an `electron` import, with no exception list, and a second
 * check that the scan actually finds files — so an empty or misspelled directory cannot make the
 * guard pass by finding nothing.
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

import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  HARNESS_LAUF_STARTEN, HARNESS_LAUF_LESEN, HARNESS_LAUF_ABBRECHEN, HARNESS_LAUF_FORTSETZEN,
  HARNESS_ANHAENGE_WAEHLEN, HARNESS_EREIGNIS,
} from '../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis, LaufAnzeige, LaufStartWunsch } from '../shared/harness-types'
import { broadcast } from './event-bus'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { eintragNachId } from './model/registry'
import { toModelEndpoint, type Faehigkeiten, type ModellEintrag } from './model/entry'
import { clientForEndpoint } from './worker/model-client'
import { assemblePraefixTeile } from './harness-praefix-quelle'
import {
  starteLauf, setzeFort, oeffneHarnessDb, lesen, laufIds, codecFuer,
  WerkzeugRegistry, DATEI_WERKZEUGE, GRAPH_WERKZEUGE,
} from './harness'
import type { ModelAntwort, Auftrag, LaufUmgebung } from './harness'
import type { AppServices } from './window-manager'

let db: ReturnType<typeof oeffneHarnessDb> | null = null
/** Run ids marked for cancellation. Read at the loop's turn boundary, never mid-request (9.1). */
const abbruchmarken = new Set<string>()

/**
 * Run ids for which a `fahre()` loop is currently executing in this process.
 *
 * `laufUebersicht` reports `endzustand: null` for a crashed run and a still-running one alike —
 * there is no run table, only the log, and a running run has written no `run.finished` yet, same
 * as a crashed one. Nothing before this distinguished "safe to resume" from "already resuming
 * itself right now": a click on "Fortsetzen" for the run that is this process's own current run
 * started a second `fahre()` loop over the same run id and the same database — every tool call
 * doubled, two interleaved conversations in one append-only protocol, and the model endpoint
 * billed twice. Set in both HARNESS_LAUF_STARTEN and HARNESS_LAUF_FORTSETZEN before the loop
 * starts, deleted in the same `finally` that already cleans up `abbruchmarken` once it ends —
 * same lifetime as the abort mark, checked in the main process, never trusted to the renderer
 * merely hiding the button (same rule as every other decision in this file).
 */
const laufendeLaeufe = new Set<string>()

/**
 * The check itself, pulled out as a pure function so it is testable without electron — same
 * pattern as `pruefeAnhaenge` above.
 */
export function pruefeLaufLaeuftNicht(
  laufId: string, laufende: ReadonlySet<string>,
): { ok: true } | { ok: false; meldung: string } {
  if (laufende.has(laufId)) {
    return { ok: false, meldung: `Der Lauf '${laufId}' laeuft bereits — Fortsetzen ist erst moeglich, wenn er sich beendet hat.` }
  }
  return { ok: true }
}

/**
 * Paths a human has actually picked, via a dialog *this* process opened. This is the boundary
 * for attachments, and it is deliberately not pfadwache.
 *
 * pfadwache (see pfadwache.ts's own header) exists to stop the *model* from walking the
 * filesystem through a reading tool — its boundary is a directory, the project root, because a
 * tool call is the model's act. An attachment is different in kind, not degree: the spec says
 * "Anhaenge gehen nicht durch die Pfadwache — sie sind eine Handlung des Nutzers, keine des
 * Modells", and that sentence is only true if the path really did come from the user. Over IPC,
 * `HARNESS_LAUF_STARTEN` receives nothing but a string; the main process cannot tell "chosen in
 * a file dialog" apart from "typed by whoever controls the renderer" by looking at the string
 * itself — and because the renderer runs with `sandbox: true` and `nodeIntegration: false`, it
 * has no filesystem access of its own, so the main process is the one that actually opens,
 * reads and base64-encodes the file before it goes to a model endpoint. Applying pfadwache here
 * would also be the wrong fix even if the provenance problem did not exist: a real attachment
 * (a screenshot on the Desktop, a PDF in Downloads) legitimately lives outside the project root,
 * and pfadwache's whole point is to refuse exactly that location.
 *
 * So the line is not drawn by *where* the file is, but by *how the path arrived*: only a path
 * this process itself handed back from `dialog.showOpenDialog` — proof a human clicked it in a
 * native, OS-owned dialog the renderer cannot script — is accepted. `HARNESS_LAUF_STARTEN`
 * rejects anything else by name, not by pretending it belongs to a directory it does not.
 */
const dialogAusgewaehlt = new Set<string>()

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

/**
 * The one place a LaufUmgebung gets built — starting a run and resuming one use exactly this
 * construction, not two that could drift apart. `aufJedesEreignis` is called with every event
 * `strom` sees; the caller decides what "the run has visibly started" means for its own race
 * against the loop's full completion (see HARNESS_LAUF_STARTEN and HARNESS_LAUF_FORTSETZEN).
 */
function baueLaufUmgebung(
  laufId: string, eintrag: ModellEintrag, auftragstext: string, wurzel: string,
  services: AppServices, aufJedesEreignis: (ev: HarnessEreignis) => void,
): LaufUmgebung {
  return {
    db: harnessDb(),
    eintrag,
    praefixTeile: assemblePraefixTeile(auftragstext),
    wache: { wurzel, heim: homedir(), userDataPfad: app.getPath('userData') },
    graphDb: services.graphDb,
    registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE]),
    strom: (ev) => {
      broadcast(HARNESS_EREIGNIS, ev as HarnessEreignis)
      aufJedesEreignis(ev as HarnessEreignis)
    },
    uhr: () => Date.now(),
    abgebrochen: () => abbruchmarken.has(laufId),
    sende: sendeUeberTransport(eintrag),
  }
}

/**
 * Reconstructs the Auftrag a run was originally given, from its own run.started event — the
 * honest source for a resumed run: the same order it started with, not a second one reassembled
 * from whatever the renderer happens to send today (see the comment lauf.ts's starteLauf now
 * carries next to `wurzel` in that event). `anhaenge` and `pflichtfelder` are deliberately left
 * out of the rebuilt Auftrag:
 *
 * - Attachments already live in run.started's own `anhangBloecke` field and reach the projected
 *   history through `projiziere()` on every turn, including the first one after a resume.
 *   `anhangBloecke()` — the function that actually reads a file from disk and base64-encodes it
 *   — is called exactly once, from `starteLauf`, and never from `setzeFort`/`fahre`. There is no
 *   code path on which a resumed run re-reads an attachment path, whether or not one is passed
 *   back in here — so leaving `anhaenge` unset costs nothing and avoids inviting a future change
 *   to wire a second read that was never needed.
 * - `pflichtfelder` is not carried in run.started today and HARNESS_LAUF_STARTEN never sets it
 *   on the initial Auftrag either (it is exercised only by direct callers of `starteLauf`, not
 *   by this IPC surface) — so there is nothing to lose here that a fresh start would have had.
 */
export function auftragAusProtokoll(ereignisse: ReturnType<typeof lesen>): Auftrag | null {
  const gestartet = ereignisse.find((e) => e.art === 'run.started')
  if (!gestartet) return null
  const n = gestartet.nutzlast
  if (typeof n.auftragstext !== 'string' || n.auftragstext === '') return null
  if (typeof n.modellId !== 'string' || n.modellId === '') return null
  if (typeof n.wurzel !== 'string' || n.wurzel === '') return null
  const b = n.budgets as Partial<Auftrag['budgets']> | undefined
  if (
    !b || typeof b.runden !== 'number' || typeof b.wanduhrMs !== 'number' ||
    typeof b.kostenCent !== 'number' || typeof b.kontextAnteil !== 'number'
  ) {
    return null
  }
  return {
    auftragstext: n.auftragstext,
    modellId: n.modellId,
    wurzel: n.wurzel,
    budgets: {
      runden: b.runden, wanduhrMs: b.wanduhrMs, kostenCent: b.kostenCent, kontextAnteil: b.kontextAnteil,
    },
  }
}

/** A run with no run.finished event is still resumable; one that has it is done. */
export function laufAbgeschlossen(ereignisse: ReturnType<typeof lesen>): boolean {
  return ereignisse.some((e) => e.art === 'run.finished')
}

/**
 * The provenance check itself, pulled out as a pure function so it is testable without
 * electron: it takes the requested paths and the set of dialog-attested ones as plain
 * arguments rather than reaching into module state. Deliberately takes no `wurzel` and applies
 * no directory containment — see the comment on `dialogAusgewaehlt` above for why a path
 * legitimately outside the project root (a Desktop screenshot) must still pass here as long as
 * a human picked it in the dialog.
 */
export function pruefeAnhaenge(
  angefordert: readonly string[], dialogAusgewaehlt: ReadonlySet<string>,
): { ok: true } | { ok: false; meldung: string } {
  const nichtAusDemDialog = angefordert.filter((a) => !dialogAusgewaehlt.has(a))
  if (nichtAusDemDialog.length > 0) {
    return {
      ok: false,
      meldung: `Anhang stammt aus keinem vom Hauptprozess geoeffneten Dateidialog: ` +
        `'${nichtAusDemDialog[0]}'.`,
    }
  }
  return { ok: true }
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

      const angeforderteAnhaenge = Array.isArray(w.anhaenge)
        ? w.anhaenge.filter((a): a is string => typeof a === 'string')
        : []
      // The provenance check that makes "Anhaenge sind eine Handlung des Nutzers" true instead
      // of assumed — see the comment on `dialogAusgewaehlt` above. A path that never came back
      // from HARNESS_ANHAENGE_WAEHLEN is refused by name, not silently dropped: a silently
      // shortened attachment list would look like success while sending less than the user
      // thought they attached.
      const anhaengePruefung = pruefeAnhaenge(angeforderteAnhaenge, dialogAusgewaehlt)
      if (!anhaengePruefung.ok) return anhaengePruefung

      // Minted here, not inside starteLauf: the abort mark is keyed by it, and a run that
      // cannot be cancelled during its first turn is a run that cannot be cancelled.
      const laufId = randomUUID()

      let markiereGestartet: (() => void) | null = null
      const wennGestartet = new Promise<void>((resolve) => { markiereGestartet = resolve })

      // Marked running before the loop starts — see the comment on `laufendeLaeufe` above.
      // A freshly minted id can never already be running, but the mark still has to land before
      // starteLauf() so there is no window in which this run id looks resumable to a second call.
      laufendeLaeufe.add(laufId)

      const laufPromise = starteLauf(
        {
          auftragstext: w.auftragstext,
          modellId: w.modellId,
          wurzel: w.wurzel,
          anhaenge: angeforderteAnhaenge.length > 0 ? angeforderteAnhaenge : undefined,
          budgets: STANDARD_BUDGETS,
        },
        // The first appended event is always run.started — see lauf.ts's starteLauf, which
        // writes it before entering the loop. Once it lands, startup has succeeded.
        baueLaufUmgebung(laufId, eintrag, w.auftragstext, w.wurzel, services, () => {
          if (markiereGestartet) { markiereGestartet(); markiereGestartet = null }
        }),
        laufId,
      )

      // A bug in the loop past this point is reported through run.finished, not a rejection —
      // see lauf.ts's own try/catch around the transport call. This is only a safety net so an
      // exception nobody awaits does not become a silent unhandled rejection, plus cleanup of
      // the abort mark and the running-mark so neither outlives the run it was keyed to.
      laufPromise
        .catch((err) => {
          console.error(
            `[harness-handlers] Lauf '${laufId}' endete mit einem unbehandelten Fehler:`,
            err instanceof Error ? err.message : String(err),
          )
        })
        .finally(() => { abbruchmarken.delete(laufId); laufendeLaeufe.delete(laufId) })

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

  ipcMain.handle(HARNESS_ANHAENGE_WAEHLEN, async (event): Promise<HarnessAntwort<string[]>> => {
    // A parent window makes the dialog modal to the harness window instead of floating
    // unanchored; falling back to the parentless form if the sender's window is somehow gone
    // rather than failing the whole pick.
    const fenster = BrowserWindow.fromWebContents(event.sender)
    const ergebnis = fenster
      ? await dialog.showOpenDialog(fenster, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (ergebnis.canceled) return { ok: true, wert: [] }
    // This is the one place a path is admitted into dialogAusgewaehlt — the dialog itself is
    // the user's attested act; nothing else may add to this set.
    for (const pfad of ergebnis.filePaths) dialogAusgewaehlt.add(pfad)
    return { ok: true, wert: ergebnis.filePaths }
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

  ipcMain.handle(HARNESS_LAUF_FORTSETZEN, async (_e, roh: unknown): Promise<HarnessAntwort<string>> => {
    try {
      if (typeof roh !== 'string' || roh === '') {
        return { ok: false, meldung: 'Es ist kein Lauf genannt.' }
      }
      const laufId = roh
      const datenbank = harnessDb()
      const ereignisse = lesen(datenbank, laufId)
      if (ereignisse.length === 0) {
        return { ok: false, meldung: `Kein Lauf mit der Id '${laufId}'.` }
      }
      // Checked here, in the main process — not only by the renderer hiding the button once a
      // run's endzustand is set in its own list. The renderer is not trusted with this decision,
      // same rule as every other harness handler in this file.
      if (laufAbgeschlossen(ereignisse)) {
        return { ok: false, meldung: `Der Lauf '${laufId}' ist bereits abgeschlossen.` }
      }
      // The gap laufAbgeschlossen() alone leaves open: `endzustand: null` in the run overview
      // means "no run.finished yet", which is equally true for a crashed run and a run that is
      // this very process's own loop, still executing right now. Checked here, in the main
      // process — see the comment on `laufendeLaeufe` above.
      const laufLaeuftPruefung = pruefeLaufLaeuftNicht(laufId, laufendeLaeufe)
      if (!laufLaeuftPruefung.ok) return laufLaeuftPruefung
      const auftrag = auftragAusProtokoll(ereignisse)
      if (!auftrag) {
        return { ok: false, meldung: `Das Protokoll von '${laufId}' traegt keinen vollstaendigen Auftrag.` }
      }
      const eintrag = eintragNachId(auftrag.modellId)
      if (!eintrag) return { ok: false, meldung: `Kein Registry-Eintrag '${auftrag.modellId}'.` }

      let markiereGestartet: (() => void) | null = null
      const wennGestartet = new Promise<void>((resolve) => { markiereGestartet = resolve })

      // Marked running before the loop starts — same reasoning as HARNESS_LAUF_STARTEN above,
      // and the very check this handler exists to make possible for the *next* resume attempt.
      laufendeLaeufe.add(laufId)

      // setzeFort resolves only once the whole resumed run is done, exactly like starteLauf —
      // the same race against the loop's own first write, so the IPC round trip does not block
      // for the run's entire remaining duration.
      const laufPromise = setzeFort(
        laufId, auftrag,
        baueLaufUmgebung(laufId, eintrag, auftrag.auftragstext, auftrag.wurzel, services, () => {
          if (markiereGestartet) { markiereGestartet(); markiereGestartet = null }
        }),
      )

      laufPromise
        .catch((err) => {
          console.error(
            `[harness-handlers] Fortgesetzter Lauf '${laufId}' endete mit einem unbehandelten Fehler:`,
            err instanceof Error ? err.message : String(err),
          )
        })
        .finally(() => { abbruchmarken.delete(laufId); laufendeLaeufe.delete(laufId) })

      await Promise.race([wennGestartet, laufPromise])
      return { ok: true, wert: laufId }
    } catch (err) {
      return fehler(err)
    }
  })
}
