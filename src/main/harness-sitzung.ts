/**
 * harness-sitzung — der eine Zusammenbau einer Lauf-Umgebung, und die Startsequenz darum.
 *
 * Bis zum 2026-08-23 stand das alles in harness-handlers.ts, und es gab genau einen Aufrufer:
 * das Harness-Fenster. Mit der Gitterzelle (agent/adapters/keel-harness.ts) kommt ein zweiter.
 * Es hier herauszuziehen, statt die Zelle ihre eigene Umgebung bauen zu lassen, ist dieselbe
 * Entscheidung, die `pruefeKeinUnterlauf` schon traegt: die zweite Stelle, an der eine
 * Kapselung richtig zusammengesetzt werden muss, ist die, die beim naechsten Umbau vergessen
 * wird.
 *
 * Das Modul liegt **ausserhalb** von src/main/harness/, weil es `electron` braucht
 * (app.getPath('userData')) und der Waechter tests/harness/waechter-kern.test.ts dort keinen
 * electron-Import duldet — ohne Ausnahmeliste, denn eine Ausnahmeliste ist, wie ein Waechter
 * still aufhoert zu wachen.
 *
 * Was hier NICHT hinwandert: `pruefeAnhaenge` und `dialogAusgewaehlt`. Der
 * Anhang-Herkunftsnachweis haengt am Dateidialog des Harness-Fensters, und die Gitterzelle hat
 * keine Anhaenge. Sie bleiben im Handler, bei dem Fenster, dessen Dialog sie bezeugen.
 */

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HARNESS_EREIGNIS } from '../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis, LaufAnzeige } from '../shared/harness-types'
import { broadcast } from './event-bus'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { eintragFuerRolle, eintragNachId } from './model/registry'
import { laeuferKannArt, sperrgrund } from './model/eignung'
import { slotFuerId } from './model/slots'
import { toModelEndpoint, type Faehigkeiten, type ModellEintrag } from './model/entry'
import { clientForEndpoint } from './worker/model-client'
import { assemblePraefixTeile } from './harness-praefix-quelle'
import type { PraefixText } from './harness/praefix'
import { baueNetzKontext } from './harness-netz'
import {
  starteLauf, oeffneHarnessDb, lesen, laufIds, codecFuer, weiterOderFrisch, setzeFolgeauftrag,
  WerkzeugRegistry, DATEI_WERKZEUGE, GRAPH_WERKZEUGE, NETZ_WERKZEUGE, rechercheurWerkzeug,
  leseFaehigkeiten, faehigkeitLesenWerkzeug,
} from './harness'
import type { ModelAntwort, Auftrag, LaufUmgebung } from './harness'
import type { AppServices } from './window-manager'
import type { EntitaetsTeile, SchleifenStartOpts, SchleifenStartErgebnis } from './agent/agent-adapter'

let db: ReturnType<typeof oeffneHarnessDb> | null = null
/** Run ids marked for cancellation. Read at the loop's turn boundary, never mid-request (9.1). */
export const abbruchmarken = new Set<string>()

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
export const laufendeLaeufe = new Set<string>()

/**
 * The check itself, pulled out as a pure function so it is testable without electron — same
 * pattern as `pruefeAnhaenge` in harness-handlers.ts.
 */
export function pruefeLaufLaeuftNicht(
  laufId: string, laufende: ReadonlySet<string>,
): { ok: true } | { ok: false; meldung: string } {
  if (laufende.has(laufId)) {
    return { ok: false, meldung: `Der Lauf '${laufId}' laeuft bereits — Fortsetzen ist erst moeglich, wenn er sich beendet hat.` }
  }
  return { ok: true }
}

/** Placeholder until the harness window can set its own budgets — every run gets the same one. */
export const STANDARD_BUDGETS = { runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8 }

export function harnessDb(): ReturnType<typeof oeffneHarnessDb> {
  if (!db) {
    db = oeffneHarnessDb(
      join(app.getPath('userData'), 'harness.db'),
      resolveBetterSqliteBinding(join(app.getAppPath(), 'node_modules', 'better-sqlite3')),
    )
  }
  return db
}

/**
 * Die Werkzeugliste des Laufs, an genau einer Stelle. Exportiert, damit ein Test gegen **diese**
 * Konstruktion pruefen kann statt gegen einen Nachbau — der Nachbau in
 * tests/harness/werkzeugliste.test.ts war gruen, waehrend die halbe Liste gar nicht verdrahtet
 * war (siehe tests/harness/verdrahtung.test.ts).
 *
 * Die Netz-Werkzeuge stehen **immer** darin, auch ohne konfigurierten Suchanbieter. Grund: die
 * Stummelliste bildet den stabilen Praefix, und der darf sich zwischen Laeufen nicht bewegen —
 * eine Liste, die je nach Konfiguration mal neun und mal zwoelf Namen hat, kostet den
 * Zwischenspeicher des Anbieters bei jedem Wechsel. Ohne Anbieter antworten die Werkzeuge
 * benannt, dass Netzzugang fuer diesen Lauf nicht eingerichtet ist.
 */
export function baueWerkzeugRegistry(): WerkzeugRegistry {
  return new WerkzeugRegistry([
    ...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE, faehigkeitLesenWerkzeug,
    ...NETZ_WERKZEUGE, rechercheurWerkzeug,
  ])
}

export function fehler(err: unknown): HarnessAntwort<never> {
  return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
}

/**
 * Folds the praefix into the wire body. Neither codec's `toWire()` writes a system field — it only
 * knows the conversation and the tool stubs — so the transport is where the pieces the loop hands
 * over separately (`koerper`, `praefix`) become the one request a provider actually expects:
 * Anthropic as its own top-level field, OpenAI-compatible dialects as the first message.
 *
 * This is also where the cache breakpoint is set, and why the loop hands the praefix over in two
 * pieces. Anthropic caches nothing without an explicit `cache_control` marker; the first real run
 * reported `cache_read_input_tokens: 0` on every turn and paid the full opening each time,
 * although the stable part was byte-identical throughout. The marker goes on the stable block and
 * on nothing else — everything up to and including a marked block is cached, so a marker behind
 * the progress object would miss on every turn in which a tool ran. Tools are sent before the
 * system field, so the tool stubs sit inside the cached range as well.
 *
 * OpenAI-compatible dialects cache their prefix by themselves and are left exactly as they were:
 * an unknown field in that body risks an HTTP 400 across the whole dialect for no gain.
 */
export function mitSystemPraefix(
  koerper: unknown, praefix: PraefixText, codec: Faehigkeiten['codec'],
): unknown {
  const k = koerper as Record<string, unknown>
  if (codec === 'anthropic') {
    const bloecke: Array<Record<string, unknown>> = []
    // Empty blocks are never written: Anthropic rejects a text block with an empty string, and a
    // marker on an empty block would cache nothing while looking like it cached something.
    if (praefix.stabil !== '') {
      bloecke.push({ type: 'text', text: praefix.stabil, cache_control: { type: 'ephemeral' } })
    }
    if (praefix.fluechtig !== '') bloecke.push({ type: 'text', text: praefix.fluechtig })
    return { ...k, system: bloecke }
  }
  const zusammen = [praefix.stabil, praefix.fluechtig].filter(t => t !== '').join('\n\n')
  const nachrichten = Array.isArray(k.messages) ? k.messages : []
  return { ...k, messages: [{ role: 'system', content: zusammen }, ...nachrichten] }
}

/**
 * The transport, wired to the codec. The loop hands over the wire body and gets blocks back —
 * it never learns which of the three clients answered.
 *
 * Built eagerly when `baueLaufUmgebung` assembles the environment but only touches
 * `eintrag.faehigkeiten` once actually called: by the time the loop invokes `sende`,
 * `starteLauf`'s own `pruefeStartbedingungen` has already run and would have thrown otherwise,
 * so the non-null assertion here is safe and never the first thing to fail.
 */
/**
 * Das Zeitbudget **eines Zuges** von keels eigener Schleife.
 *
 * Ohne diese Zeile erbte die Schleife `WORKER_TIMEOUT_MS` (120 s) — eine Zahl, die fuer den
 * **Ein-Schuss-Worker** bemessen ist: eine kleine Anfrage, kurze Historie, kein Denkbudget. Der
 * gleiche Fehlerkreis wie bei `aufgeschobenesLaden` und `klemmeMaxZeichen`: eine Zahl, die fuer
 * einen Verbraucher richtig war, gilt fuer den zweiten nicht. Die Zeile daneben in
 * `notes/note-tagging.ts` macht es seit je richtig und reicht ihre eigenen 60 s durch.
 *
 * **Gemessen am 2026-08-23**, 215 erfolgreiche Zuege gegen `spark-qwen38-27b` (Denkstufe
 * `medium`) auf gesunder GPU:
 *
 *     Median  8,4 s · p90 55,4 s · p99 99,1 s · laengster durchgekommener Zug 108,5 s
 *
 * Die alte Grenze lag damit **innerhalb** der Arbeitsverteilung statt darueber — elf Sekunden
 * ueber dem laengsten Zug, der noch ankam. Zwei Zuege desselben Messtags endeten `transportfehler`
 * nach exakt 120,0 s; einer davon hatte 71.045 Zeichen Werkzeugausgabe im Verlauf, der andere
 * 43 — grosser Kontext und langes Nachdenken laufen also beide gegen dieselbe Wand.
 *
 * **Warum 300 s und nicht mehr:** ein Zug, der laenger braucht als die Wanduhr des gruendlichen
 * Rechercheur-Unterlaufs (`TIEFEN.gruendlich.wanduhrMs`, 300 s), koennte dort ohnehin nichts mehr
 * beitragen. Und die Grenze muss endlich bleiben: die Budgets werden **zwischen** den Zuegen
 * geprueft, ein haengender Socket wuerde also von keiner Wanduhr eingeholt.
 *
 * **Was hier bewusst nicht steht:** die Grenze aus der *verbleibenden* Wanduhr des Laufs
 * abzuleiten. Das waere sauberer — dann waere der Transport nie das, was einen Lauf vor seinem
 * Budget beendet —, kostet aber, dass `sende` den Laufzustand kennt. Solange 300 s dreimal ueber
 * dem p99 liegt, kauft das nichts.
 */
export const SCHLEIFE_TIMEOUT_MS = 300_000

export function sendeUeberTransport(eintrag: ModellEintrag) {
  return async (koerper: unknown, praefix: PraefixText): Promise<ModelAntwort> => {
    const f = eintrag.faehigkeiten!
    const endpunkt = toModelEndpoint(eintrag.erreichbarkeit, f.codec)
    const roh = await clientForEndpoint(endpunkt).chat({
      koerper: mitSystemPraefix(koerper, praefix, f.codec), endpoint: endpunkt,
      timeoutMs: SCHLEIFE_TIMEOUT_MS,
    })
    return codecFuer(f.codec).fromWire(roh)
  }
}

/**
 * Modell und Transport des Rechercheur-Unterlaufs, aus dem Zuordnungsplatz `rolle:rechercheur` —
 * oder `null`, und dann faehrt der Unterlauf das Modell des Hauptlaufs (harness/rechercheur.ts).
 *
 * Gelesen wird beim Bau der Umgebung, also je Lauf: die Rolle wirkt `sofort` (slots.ts), und der
 * naechste Lauf ist frueh genug — mitten in einem laufenden das Modell zu wechseln wuerde dessen
 * Praefix-Cache verwerfen.
 *
 * **Die Sperre steht hier noch einmal, obwohl das Settings-Fenster sie schon zieht.** Die Ansicht
 * verspricht bei einer nicht fahrbaren Zuordnung ausdruecklich „Es gilt der Rueckfall"; ohne diese
 * Zeile waere das gelogen — `starteLauf` wuerfe stattdessen mitten im Werkzeugaufruf des
 * Hauptlaufs, und aus einer Recherche wuerde ein `tool.failed`. Und die Konfigurationsdatei ist
 * von Hand editierbar, das Fenster also gar nicht der einzige Weg hinein.
 */
export function rechercheurModell(): LaufUmgebung['rechercheurModell'] {
  const eintrag = eintragFuerRolle('rechercheur')
  if (!eintrag) return null
  const laeufer = slotFuerId('rolle:rechercheur')!.laeufer
  if (!laeuferKannArt(laeufer, eintrag.art)) {
    console.warn(
      `[harness-sitzung] Der Zuordnungsplatz 'rolle:rechercheur' zeigt auf '${eintrag.id}'. ` +
      `${sperrgrund(laeufer, eintrag.art)} Der Unterlauf faehrt das Modell des Hauptlaufs.`,
    )
    return null
  }
  return { eintrag, sende: sendeUeberTransport(eintrag) }
}

/**
 * The one place a LaufUmgebung gets built — starting a run and resuming one use exactly this
 * construction, not two that could drift apart. `aufJedesEreignis` is called with every event
 * `strom` sees; the caller decides what "the run has visibly started" means for its own race
 * against the loop's full completion (see HARNESS_LAUF_STARTEN and HARNESS_LAUF_FORTSETZEN).
 */
export async function baueLaufUmgebung(
  laufId: string, eintrag: ModellEintrag, auftragstext: string, wurzel: string,
  services: AppServices, aufJedesEreignis: (ev: HarnessEreignis) => void,
  entitaet?: EntitaetsTeile,
): Promise<LaufUmgebung> {
  // Gelesen wird beim Bau der Umgebung, einmal je Lauf — nicht je Zug: der stabile Praefix muss
  // ueber alle Zuege zeichengleich bleiben, und ein Leser, der pro Zug wieder auf die Platte geht,
  // wuerde bei jeder Aenderung an .claude/ mitten im Lauf den Prompt-Cache des Anbieters verfehlen.
  const befund = leseFaehigkeiten(wurzel)
  // Uebersprungene Verzeichnisse werden genannt, nicht verschluckt. Sie gehen ins Hauptprozess-Log
  // und (noch) nicht ins Ereignisprotokoll: `hinweise` gehoert run.started, und das schreibt
  // starteLauf aus dem Auftrag heraus — dort ein Feld dafuer zu erfinden, waere Vorratsbau. Wer
  // eine Faehigkeit vermisst, findet hier den Grund samt Pfad.
  for (const u of befund.uebersprungen) {
    console.warn(`[harness-sitzung] Faehigkeit uebersprungen: ${u.pfad} — ${u.grund}`)
  }
  return {
    db: harnessDb(),
    eintrag,
    praefixTeile: assemblePraefixTeile(auftragstext, befund.faehigkeiten, entitaet),
    wache: { wurzel, heim: homedir(), userDataPfad: app.getPath('userData') },
    graphDb: services.graphDb,
    registry: baueWerkzeugRegistry(),
    // Der Hauptlauf faehrt gegen die Positivliste ('whitelist'). Der Unterlauf des Rechercheurs
    // setzt in rechercheur.ts auf 'offen' um und bekommt dafuer keine Datei- und Graph-Werkzeuge.
    netz: await baueNetzKontext(),
    rechercheurModell: rechercheurModell(),
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
 * Traegt das `run.started` dieses Laufs ein `eltern`, ist er der Unterlauf eines anderen — heute
 * der des Rechercheurs (harness/rechercheur.ts).
 */
export function istUnterlauf(ereignisse: ReturnType<typeof lesen>): boolean {
  const gestartet = ereignisse.find((e) => e.art === 'run.started')
  const eltern = gestartet?.nutzlast.eltern
  return typeof eltern === 'object' && eltern !== null
}

/**
 * Die dritte Absage des Fortsetzen-Pfads, und die einzige, die eine Sicherheitsgrenze haelt statt
 * doppelter Arbeit vorzubeugen.
 *
 * `baueLaufUmgebung` gibt **jedem** Lauf, den dieser Prozess faehrt, die Registry des Hauptlaufs:
 * `datei_lesen`, `inhalt_suchen`, die vier Graph-Werkzeuge, dazu `services.graphDb`. Fuer einen
 * fortgesetzten Unterlauf ist das genau der Zustand, gegen den rechercheur.ts seine eigene laufId
 * begruendet — nur von aussen wiederhergestellt. Der Weg dahin braucht keinen Angriff auf die
 * IPC-Grenze: stirbt der Prozess mitten in einem Unterlauf, nachdem `seite_lesen` eine
 * praeparierte Seite ins Protokoll geschrieben hat, dann hat dieser Lauf kein `run.finished`,
 * steht in `laufUebersicht` mit `endzustand: null` und ist von einem gewoehnlich abgebrochenen
 * Lauf nicht zu unterscheiden. Ein Klick auf Fortsetzen faehrt `setzeFort` ueber genau diese
 * Historie — der Verlauf traegt den rohen Seitenrumpf, und daneben stuenden dann die
 * Datei- und Graph-Werkzeuge.
 *
 * Deshalb wird ein Unterlauf **gar nicht** fortgesetzt, statt ihn mit einer nachgebauten
 * Unterlauf-Umgebung fortzusetzen: die zweite Bauform waere eine zweite Stelle, an der die
 * Kapselung richtig zusammengesetzt werden muss, und die zweite Stelle ist die, die beim naechsten
 * Umbau vergessen wird. Ein Unterlauf ohne Elternlauf hat ohnehin niemanden mehr, dem er sein
 * Ergebnis zurueckgeben koennte.
 */
export function pruefeKeinUnterlauf(
  laufId: string, ereignisse: ReturnType<typeof lesen>,
): { ok: true } | { ok: false; meldung: string } {
  if (istUnterlauf(ereignisse)) {
    return {
      ok: false,
      meldung:
        `Der Lauf '${laufId}' ist der Unterlauf einer Recherche und wird nicht fortgesetzt. Er ` +
        `hat fremden Netzinhalt im Verlauf und darf die Werkzeuge des Hauptlaufs nie daneben ` +
        `sehen; und ohne seinen Elternlauf gibt es niemanden, der sein Ergebnis entgegennimmt. ` +
        `Starte die Recherche im Hauptlauf neu.`,
    }
  }
  return { ok: true }
}

/** Every run's summary, oldest first — same order as `laufIds()`. There is no run table; this
 *  reads each run's own log, exactly as `laufIds()` itself derives the id list from it.
 *
 *  Exportiert, damit ein Test die Zusammenfassung gegen ein echtes Protokoll pruefen kann — der
 *  Handler selbst ist von hier aus nicht erreichbar (kein Test in diesem Repo erreicht ipcMain). */
export function laufUebersicht(datenbank: ReturnType<typeof oeffneHarnessDb>): LaufAnzeige[] {
  return laufIds(datenbank).map((id) => {
    const ereignisse = lesen(datenbank, id)
    const gestartet = ereignisse.find((e) => e.art === 'run.started')
    const beendet = [...ereignisse].reverse().find((e) => e.art === 'run.finished')
    return {
      laufId: id,
      modellId: typeof gestartet?.nutzlast.modellId === 'string' ? gestartet.nutzlast.modellId : '',
      gestartetTs: gestartet?.ts ?? '',
      endzustand: typeof beendet?.nutzlast.endzustand === 'string' ? beendet.nutzlast.endzustand : null,
      // Unterlaeufe standen in dieser Liste als gewoehnliche Laeufe: `eltern` wurde ausserhalb von
      // lauf.ts und rechercheur.ts nirgends gelesen, also war ein abgebrochener Unterlauf im
      // Fenster von einem abgebrochenen Hauptlauf nicht zu unterscheiden — samt angebotenem
      // Fortsetzen-Knopf. Die Absage trifft der Hauptprozess (pruefeKeinUnterlauf); dieses Feld
      // sorgt dafuer, dass der Mensch sie nicht erst durch Klicken erfaehrt.
      istUnterlauf: istUnterlauf(ereignisse),
    }
  })
}

/**
 * Die Startsequenz, an einer Stelle. Sie `await`et den Lauf **nicht** zu Ende: `starteLauf`
 * loest erst auf, wenn die ganze Mehrrunden-Schleife durch ist, und darauf zu warten hiesse,
 * den IPC-Hinlauf fuer die gesamte Laufdauer zu blockieren — der Abbrechen-Knopf, der an einer
 * laufId haengt, wuerde erst klickbar, wenn es nichts mehr abzubrechen gibt. Stattdessen ein
 * Rennen zwischen dem ersten Schreibvorgang der Schleife und dem Ausgang des Laufversprechens:
 * ein synchroner Startfehler (unbekannter Codec, cli-harness-Eintrag ohne Faehigkeitszeile)
 * kommt als gewoehnlicher Fehler zurueck, ein geglueckter Start kehrt sofort heim.
 */
export async function starteHarnessLauf(args: {
  laufId: string
  eintrag: ModellEintrag
  auftragstext: string
  wurzel: string
  services: AppServices
  anhaenge?: string[]
  entitaet?: EntitaetsTeile
  /** Laeuft nach dem Ende des Laufs — egal ob Erfolg, Fehler oder Abbruch. */
  beiEnde?: () => void
}): Promise<void> {
  const { laufId, eintrag, auftragstext, wurzel, services } = args

  let markiereGestartet: (() => void) | null = null
  const wennGestartet = new Promise<void>((resolve) => { markiereGestartet = resolve })

  // The first appended event is always run.started — see lauf.ts's starteLauf, which
  // writes it before entering the loop. Once it lands, startup has succeeded.
  const umgebung = await baueLaufUmgebung(laufId, eintrag, auftragstext, wurzel, services, () => {
    if (markiereGestartet) { markiereGestartet(); markiereGestartet = null }
  }, args.entitaet)

  // Marked running only once the environment is built, not before — see the comment on
  // `laufendeLaeufe` above. A freshly minted id can never already be running, but the mark
  // still has to land before starteLauf() so there is no window in which this run id looks
  // resumable to a second call. It used to land *before* `baueLaufUmgebung`: a throw from
  // there (unknown codec, an unreadable capabilities directory) then left the mark set with
  // no `.finally` yet registered to clear it — this laufId stayed "running" forever, and
  // Fortsetzen for it was refused for good. Building the environment first does not reopen the
  // resumable-looking window the mark exists to close: nothing here writes to the run's log or
  // starts the loop before the mark lands, only `baueLaufUmgebung` runs first, and it writes
  // nothing either.
  laufendeLaeufe.add(laufId)

  const laufPromise = starteLauf(
    {
      auftragstext, modellId: eintrag.id, wurzel,
      anhaenge: args.anhaenge && args.anhaenge.length > 0 ? args.anhaenge : undefined,
      budgets: STANDARD_BUDGETS,
    },
    umgebung,
    laufId,
  )

  // A bug in the loop past this point is reported through run.finished, not a rejection —
  // see lauf.ts's own try/catch around the transport call. This is only a safety net so an
  // exception nobody awaits does not become a silent unhandled rejection, plus cleanup of
  // the abort mark and the running-mark so neither outlives the run it was keyed to.
  laufPromise
    .catch((err) => {
      console.error(
        `[harness-sitzung] Lauf '${laufId}' endete mit einem unbehandelten Fehler:`,
        err instanceof Error ? err.message : String(err),
      )
    })
    .finally(() => {
      abbruchmarken.delete(laufId)
      laufendeLaeufe.delete(laufId)
      args.beiEnde?.()
    })

  await Promise.race([wennGestartet, laufPromise])
}

/**
 * Ein Auftrag an eine Zelle. Hier — und nicht beim Aufrufer — faellt die Entscheidung zwischen
 * Folgeauftrag und frischem Lauf: sie braucht das Protokoll des letzten Laufs, und das kennt nur
 * dieses Modul.
 *
 * Vorgezogen aus Task 9 (`SESSION_AUFTRAG`), weil `KeelHarnessAdapter.starteAuftrag`
 * (agent/adapters/keel-harness.ts) diese Funktion schon per `await import(...)` ruft — ein
 * `await import()` wird typgeprueft, ein noch nicht existierendes Modul waere ein sofortiger
 * `npm run typecheck`-Fehler. Der IPC-Kanal, der `beauftrageSchleife` tatsaechlich aufruft, ist
 * noch nicht verdrahtet; diese Funktion ist vollstaendig, ihr Aufrufer kommt erst mit Task 9.
 */
export async function beauftrageSchleife(
  opts: SchleifenStartOpts, services: AppServices,
): Promise<SchleifenStartErgebnis> {
  const eintrag = eintragNachId(opts.eintragId)
  if (!eintrag) throw new Error(`Kein Registry-Eintrag '${opts.eintragId}'.`)
  const fenster = eintrag.faehigkeiten?.nutzbaresKontextfenster ?? 0

  if (opts.letzteLaufId) {
    const ereignisse = lesen(harnessDb(), opts.letzteLaufId)
    const entscheidung = weiterOderFrisch(
      ereignisse, eintrag.id, STANDARD_BUDGETS, fenster, Date.now(),
    )
    if (entscheidung.weiter) {
      const alt = auftragAusProtokoll(ereignisse)
      if (alt) {
        const laufId = opts.letzteLaufId

        // `setzeFolgeauftrag` (harness/lauf.ts) oeffnet eine EIGENE `fahre()`-Schleife und setzt
        // deshalb einen RUHENDEN Lauf voraus (siehe der Kommentar dort). Traefe ein Folgeauftrag
        // mitten in einen laufenden Zug desselben Prozesses ein, schloesse die Projektion
        // nebenlaeufig offene Werkzeugaufrufe zwangsweise als "Ausfuehrung unbekannt" ab — derselbe
        // Fehler, den `pruefeLaufLaeuftNicht` schon fuer HARNESS_LAUF_FORTSETZEN verhindert
        // (harness-handlers.ts). Der Plantext sah hier nur `laufendeLaeufe.add` vor; das haette die
        // Bedingung nur gesetzt, nie geprueft.
        const laeuftPruefung = pruefeLaufLaeuftNicht(laufId, laufendeLaeufe)
        if (!laeuftPruefung.ok) throw new Error(laeuftPruefung.meldung)

        // Vor `await baueLaufUmgebung`, nicht danach: die Marke muss VOR dem Await-Fenster
        // stehen, sonst saehe ein nebenlaeufiger zweiter Aufruf denselben `laufId` waehrend des
        // Baus noch als "ruht" an und liefe an `pruefeLaufLaeuftNicht` oben vorbei. Wirft
        // `baueLaufUmgebung` (unbekannter Codec, unlesbares Faehigkeitsverzeichnis,
        // `baueNetzKontext`), muss die Marke aber wieder herunter — sonst genau der Fehler, den
        // `starteHarnessLauf` oben schon einmal gemacht und behoben hat (siehe dessen Kommentar
        // bei `laufendeLaeufe.add`, "stayed 'running' forever"): kein `.finally` ist zu diesem
        // Zeitpunkt registriert, das die Marke je wieder loeschen wuerde, und dieser Lauf waere
        // fuer Folgeauftrag *und* Fortsetzen bis zum Prozessneustart gesperrt.
        laufendeLaeufe.add(laufId)
        let u: LaufUmgebung
        try {
          u = await baueLaufUmgebung(
            laufId, eintrag, alt.auftragstext, opts.wurzel, services, () => {}, opts.praefix,
          )
        } catch (err) {
          laufendeLaeufe.delete(laufId)
          throw err
        }
        // Vor dem Start, synchron: sonst kann `beiEnde` eines kurzen Laufs vor dem Eintrag ins
        // Register liegen. Siehe SchleifenStartOpts.beiStart.
        opts.beiStart?.(laufId)
        setzeFolgeauftrag(laufId, alt, u, opts.auftragstext)
          .catch((err) => {
            console.error(
              `[harness-sitzung] Folgeauftrag in '${laufId}' endete mit einem unbehandelten ` +
              `Fehler:`, err instanceof Error ? err.message : String(err),
            )
          })
          .finally(() => {
            abbruchmarken.delete(laufId)
            laufendeLaeufe.delete(laufId)
            opts.beiEnde?.(laufId)
          })
        return { laufId, fortgesetzt: true }
      }
      // Kein rekonstruierbarer Auftrag heisst: das Protokoll traegt kein brauchbares
      // run.started. Dann ein frischer Lauf — benannt im Log, nicht still.
      console.warn(
        `[harness-sitzung] Lauf '${opts.letzteLaufId}' liefert keinen rekonstruierbaren ` +
        `Auftrag; der Folgeauftrag startet stattdessen frisch.`,
      )
    } else {
      // Derselbe Massstab wie beim Log direkt darueber: ein verworfener Grund waere hier
      // besonders teuer, weil `fenster` oben bei fehlender Faehigkeitszeile auf 0 faellt — ein
      // Eintrag ohne Messung bekaeme dann NIE einen Folgeauftrag, und ohne dieses Log erfuehre
      // niemand, warum.
      console.warn(
        `[harness-sitzung] Lauf '${opts.letzteLaufId}' bekommt keinen Folgeauftrag: ` +
        entscheidung.grund,
      )
    }
  }

  const laufId = randomUUID()
  // Synchron, vor dem eigentlichen Schleifenstart — siehe der Kommentar an SchleifenStartOpts
  // .beiStart (agent/agent-adapter.ts): `starteHarnessLauf` kehrt heim, sobald das erste
  // `run.started` steht, der Rest laeuft im Hintergrund weiter. Wer die laufId erst aus dem
  // Rueckgabewert eintruege, verloere gegen einen sehr kurzen Lauf.
  opts.beiStart?.(laufId)
  await starteHarnessLauf({
    laufId, eintrag, auftragstext: opts.auftragstext, wurzel: opts.wurzel,
    services, entitaet: opts.praefix, beiEnde: () => opts.beiEnde?.(laufId),
  })
  return { laufId, fortgesetzt: false }
}

/** Setzt die Abbruchmarke fuer einen Lauf. Siehe `abbruchmarken` oben: gelesen an der
 *  Rundengrenze der Schleife, niemals mitten in einer laufenden Anfrage. */
export function markiereAbbruch(laufId: string): void {
  abbruchmarken.add(laufId)
}
