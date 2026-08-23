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
 * the loop's (see `mitSystemPraefix` in harness-sitzung.ts). And `HARNESS_LAUF_STARTEN` does not
 * `await` the run to completion: `starteLauf` only resolves once the whole multi-turn loop is
 * done, and awaiting it here would block the IPC round trip for the run's entire duration — the
 * renderer's abort button, gated on having a laufId, would only ever become clickable after
 * there was nothing left to abort. The race itself — the loop's own first write against the run
 * promise settling — now lives in `starteHarnessLauf` (harness-sitzung.ts), so a synchronous
 * startup failure (unknown codec, a cli-harness entry with no capability row) still surfaces as
 * a normal error response, while a successful start returns immediately and the rest of the run
 * continues in the background, reachable from here on only through the broadcast stream and the
 * abort mark.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  HARNESS_LAUF_STARTEN, HARNESS_LAUF_LESEN, HARNESS_LAUF_ABBRECHEN, HARNESS_LAUF_FORTSETZEN,
  HARNESS_ANHAENGE_WAEHLEN,
} from '../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis, LaufAnzeige, LaufStartWunsch } from '../shared/harness-types'
import { eintragNachId } from './model/registry'
import { setzeFort, lesen } from './harness'
import type { AppServices } from './window-manager'
import {
  abbruchmarken, laufendeLaeufe, harnessDb, fehler, baueLaufUmgebung, starteHarnessLauf,
  pruefeLaufLaeuftNicht, laufUebersicht, auftragAusProtokoll, laufAbgeschlossen,
  pruefeKeinUnterlauf,
} from './harness-sitzung'

export {
  pruefeLaufLaeuftNicht, laufUebersicht, auftragAusProtokoll, laufAbgeschlossen,
  istUnterlauf, pruefeKeinUnterlauf, baueWerkzeugRegistry, mitSystemPraefix,
  rechercheurModell, SCHLEIFE_TIMEOUT_MS,
} from './harness-sitzung'

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

      await starteHarnessLauf({
        laufId, eintrag, auftragstext: w.auftragstext, wurzel: w.wurzel, services,
        anhaenge: angeforderteAnhaenge,
      })
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
      // process — see the comment on `laufendeLaeufe` in harness-sitzung.ts.
      const laufLaeuftPruefung = pruefeLaufLaeuftNicht(laufId, laufendeLaeufe)
      if (!laufLaeuftPruefung.ok) return laufLaeuftPruefung
      // Die Kapselung des Rechercheurs, hier nachgezogen: siehe pruefeKeinUnterlauf.
      const keinUnterlauf = pruefeKeinUnterlauf(laufId, ereignisse)
      if (!keinUnterlauf.ok) return keinUnterlauf
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
        await baueLaufUmgebung(laufId, eintrag, auftrag.auftragstext, auftrag.wurzel, services, () => {
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
