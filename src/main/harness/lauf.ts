/**
 * lauf — the loop, and the only module that assembles the others.
 *
 * It holds no history and no consumption in memory. Before every turn it reads the run's events,
 * projects the conversation from them, and reconstructs how much of each budget is spent from the
 * same log (see `verbrauchAusEreignissen`). That makes "turn 1" and "turn 14 after a restart" the
 * same code path for both — and resumption, which hangs on a hard process death and is therefore
 * badly testable, has by then run a thousand times in normal operation (M8 section 3.4). A version
 * that carried consumption across turns in a local variable would reset it to zero on every
 * restart, and a run that keeps crashing would get unbounded budget instead of none.
 *
 * `sende` is injected rather than imported so the loop can be driven without a network. It is
 * not a mock seam bolted on for tests: the loop genuinely has no business knowing which
 * transport answers.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { ModellEintrag } from '../model/entry'
import { checkWorkerAnswer } from '../worker/result-contract'
import { anhaengen, lesen } from './protokoll'
import type { Ereignis } from './ereignisse'
import { codecFuer } from './codec'
import type { Block, ModelAntwort } from './form'
import { nurText, werkzeugAufrufe } from './form'
import { projiziere } from './projektion'
import { baueFortschritt, baueStabilenTeil, type PraefixTeile } from './praefix'
import {
  grundFuerStopGrund, pruefeBudgets, VON_AUSSEN, ZIEL_ERREICHT,
  type Abschlussgrund, type Budgets, type Verbrauch,
} from './budget'
import { kostenCent, VORGABE_PREISE, type Preis } from './preise'
import type { WacheKontext } from './pfadwache'
import type { WerkzeugRegistry } from './werkzeuge'

export interface Auftrag {
  auftragstext: string
  modellId: string
  wurzel: string
  anhaenge?: string[]
  pflichtfelder?: string[]
  budgets: Budgets
}

export interface LaufUmgebung {
  db: Database.Database
  eintrag: ModellEintrag
  praefixTeile: PraefixTeile
  wache: WacheKontext
  graphDb: Database.Database | null
  registry: WerkzeugRegistry
  /** Every appended event, for whoever wants to watch. */
  strom: (e: Ereignis) => void
  uhr: () => number
  abgebrochen: () => boolean
  /** Wire body in, raw answer already decoded by the codec, out. */
  sende: (koerper: unknown, praefix: string) => Promise<ModelAntwort>
}

/**
 * Reconstruct consumption from the event log rather than carrying it in a variable across turns
 * — the same rule the rest of the loop follows for the conversation itself. Pure: events in,
 * `Verbrauch` out, nothing read from anywhere else.
 *
 * - Rounds are the count of `model.answered` events — one per turn actually taken.
 * - Context fill is the *last* answer's input token count, not a sum: it is a level, not an
 *   amount, and the provider reports the whole conversation's size on every turn.
 * - Cost is a sum: every turn's tokens are billed once and stay billed.
 * - Elapsed wall time is measured from `run.started`'s own timestamp, not from when this
 *   function happens to run. That is a deliberate reading of "wall clock", not the only
 *   possible one: it counts time the run spent not running at all, between a crash and its
 *   resumption, as budget spent. A run that has been dead for an hour has used an hour of
 *   wall clock either way.
 */
export function verbrauchAusEreignissen(
  ereignisse: Ereignis[], modellId: string, jetztMs: number,
  tabelle: Record<string, Preis> = VORGABE_PREISE,
): Verbrauch {
  const gestartet = ereignisse.find(e => e.art === 'run.started')
  const begonnenMs = gestartet ? Date.parse(gestartet.ts) : jetztMs

  let runden = 0
  let kostenGesamt = 0
  let letzteEingabeToken = 0
  for (const e of ereignisse) {
    if (e.art !== 'model.answered') continue
    runden += 1
    const usage = e.nutzlast.usage as { eingabeToken: number; ausgabeToken: number } | undefined
    if (usage) {
      kostenGesamt += kostenCent(modellId, usage, tabelle)
      letzteEingabeToken = usage.eingabeToken
    }
  }

  return { runden, verstricheneMs: jetztMs - begonnenMs, kostenCent: kostenGesamt, letzteEingabeToken }
}

function pruefeStartbedingungen(eintrag: ModellEintrag): void {
  const f = eintrag.faehigkeiten
  if (!f) {
    throw new Error(
      `Der Eintrag '${eintrag.id}' traegt keine Faehigkeitszeile — ein cli-harness besitzt sein ` +
      `Protokoll selbst und kann nicht durch die eigene Schleife gefahren werden.`,
    )
  }
  if (f.werkzeugmodus === 'text') {
    throw new Error(
      `'${eintrag.id}' braucht das Text-Protokoll fuer Werkzeuge. Das ist in dieser Ausbaustufe ` +
      `nicht gebaut — es kommt als eigener Codec.`,
    )
  }
  // Throws by name for ollama-native and text rather than falling back to something else.
  codecFuer(f.codec)
}

/**
 * The run id may be passed in. The IPC surface needs it *before* the run starts, because the
 * abort mark is keyed by it — minting it inside and handing it back afterwards would leave a
 * window in which a run cannot be cancelled.
 */
export async function starteLauf(
  auftrag: Auftrag, u: LaufUmgebung, laufId: string = randomUUID(),
): Promise<string> {
  pruefeStartbedingungen(u.eintrag)
  const f = u.eintrag.faehigkeiten!
  const stummel = u.registry.stummel(f.aufgeschobenesLaden)

  const hinweise: string[] = []
  // The tool ceiling is an inferred signal (M8 section 4.10): it may warn, never abort.
  if (stummel.length > f.werkzeugObergrenze) {
    hinweise.push(
      `Die Werkzeugliste hat ${stummel.length} Eintraege, die Faehigkeitszeile empfiehlt ` +
      `hoechstens ${f.werkzeugObergrenze}.`,
    )
  }

  schreibe(u, laufId, 'run.started', {
    auftragstext: auftrag.auftragstext,
    modellId: auftrag.modellId,
    codec: f.codec,
    werkzeuge: stummel.map(s => s.name),
    budgets: auftrag.budgets,
    hinweise,
    anhangBloecke: await anhangBloecke(auftrag),
  })

  await fahre(laufId, auftrag, u)
  return laufId
}

/** Same entry point after a restart: read, project, carry on. No second implementation. */
export async function setzeFort(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  pruefeStartbedingungen(u.eintrag)
  await fahre(laufId, auftrag, u)
}

async function fahre(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  const f = u.eintrag.faehigkeiten!
  const codec = codecFuer(f.codec)
  const stummel = u.registry.stummel(f.aufgeschobenesLaden)
  const stabil = baueStabilenTeil(u.praefixTeile, stummel)

  for (;;) {
    if (u.abgebrochen()) {
      beende(u, laufId, VON_AUSSEN, '')
      return
    }

    const ereignisse = lesen(u.db, laufId)
    const verlauf = projiziere(ereignisse)
    // Reconstructed from the log every turn, never carried — a run resuming after a crash must
    // recognise an already exhausted budget on its very first turn back, not rediscover it a
    // full round later because a local variable forgot everything the log still remembers.
    const verbrauchVorab = verbrauchAusEreignissen(ereignisse, auftrag.modellId, u.uhr())
    const abschlussVorab = pruefeBudgets(auftrag.budgets, verbrauchVorab, f.nutzbaresKontextfenster)

    // The stable part first, byte-identical every turn; the volatile progress object last.
    const praefix = [stabil, baueFortschritt([], erledigte(ereignisse))].filter(t => t !== '').join('\n\n')
    const koerper = codec.toWire(verlauf, abschlussVorab ? [] : stummel, f)

    if (abschlussVorab) {
      // A hit budget is a closing mode, not an exception: one last turn without tools.
      ereignisse.push(schreibe(u, laufId, 'budget.warned', {
        grund: abschlussVorab.code, anweisung: abschlussVorab.anweisung,
      }))
    }
    ereignisse.push(schreibe(u, laufId, 'prompt.sent', { text: praefix, zug: verbrauchVorab.runden + 1 }))

    let antwort: ModelAntwort
    try {
      antwort = await u.sende(koerper, praefix)
    } catch (err) {
      beende(u, laufId, {
        code: 'transportfehler', endzustand: 'abgebrochen',
        anweisung: err instanceof Error ? err.message : String(err),
      }, '')
      return
    }

    ereignisse.push(schreibe(u, laufId, 'model.answered', {
      bloecke: antwort.bloecke, stopGrund: antwort.stopGrund, usage: antwort.usage,
    }))

    // Truncation is read before any repair decision — no amount of thinking fixes it.
    const transport = grundFuerStopGrund(antwort.stopGrund)
    if (transport) {
      beende(u, laufId, transport, nurText(antwort.bloecke))
      return
    }

    if (abschlussVorab) {
      beende(u, laufId, abschlussVorab, nurText(antwort.bloecke), auftrag.pflichtfelder)
      return
    }

    const aufrufe = werkzeugAufrufe(antwort.bloecke)
    if (aufrufe.length > 0) {
      // Task 12 turns this into execution. Until then a call is a named contract break rather
      // than something quietly ignored.
      beende(u, laufId, {
        code: 'transportfehler', endzustand: 'abgebrochen',
        anweisung: `Das Modell rief '${aufrufe[0].name}' auf, obwohl keine Werkzeugliste ` +
          `gesendet wurde.`,
      }, nurText(antwort.bloecke), undefined, `Das Modell rief '${aufrufe[0].name}' auf.`)
      return
    }

    // A stop reason other than 'ende' with no tool call is a contradiction, not a reached goal:
    // 'werkzeug' promises a call that never arrived, 'anderes' names a reason nobody recognises.
    // Letting either through as ziel-erreicht would be exactly the silent swallowing this loop
    // must not do.
    if (antwort.stopGrund.normalisiert !== 'ende') {
      beende(u, laufId, {
        code: 'transportfehler', endzustand: 'abgebrochen',
        anweisung: antwort.stopGrund.normalisiert === 'werkzeug'
          ? `Das Modell meldete Stop-Grund 'werkzeug' (roh: ${antwort.stopGrund.roh}), schickte ` +
            `aber keinen Werkzeug-Aufruf.`
          : `Das Modell meldete einen unbekannten Stop-Grund '${antwort.stopGrund.roh}' — das ` +
            `gilt nicht als erreichtes Ziel.`,
      }, nurText(antwort.bloecke))
      return
    }

    // The model stopped naturally and made no calls — but if this very turn's own consumption
    // just exhausted a budget, that wins: one more, tool-less turn follows before the run ends.
    // The next iteration's own reconstruction (identical to the one at the top of this one, just
    // over a longer log) decides that; nothing here needs to remember it.
    const verbrauchDanach = verbrauchAusEreignissen(ereignisse, auftrag.modellId, u.uhr())
    if (pruefeBudgets(auftrag.budgets, verbrauchDanach, f.nutzbaresKontextfenster)) {
      continue
    }

    beende(u, laufId, ZIEL_ERREICHT, nurText(antwort.bloecke), auftrag.pflichtfelder)
    return
  }
}

function erledigte(ereignisse: Ereignis[]): string[] {
  return ereignisse
    .filter(e => e.art === 'tool.completed')
    .map(e => `${String(e.nutzlast.name ?? 'Werkzeug')} (${String(e.nutzlast.aufrufId)})`)
}

async function anhangBloecke(auftrag: Auftrag): Promise<Block[]> {
  if (!auftrag.anhaenge || auftrag.anhaenge.length === 0) return []
  const { readFileSync } = await import('node:fs')
  const { basename, extname } = await import('node:path')
  const TYPEN: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf',
  }
  return auftrag.anhaenge.map(pfad => {
    // Attachments deliberately bypass pfadwache: they are the user's act, not the model's.
    // A path that cannot be read stops the run instead of being silently skipped.
    const daten = readFileSync(pfad).toString('base64')
    const medientyp = TYPEN[extname(pfad).toLowerCase()] ?? 'application/octet-stream'
    return medientyp.startsWith('image/')
      ? { art: 'bild' as const, medientyp, daten }
      : { art: 'dokument' as const, medientyp, name: basename(pfad), daten }
  })
}

function schreibe(
  u: LaufUmgebung, laufId: string, art: Ereignis['art'], nutzlast: Record<string, unknown>,
): Ereignis {
  const e = anhaengen(u.db, laufId, art, nutzlast)
  u.strom(e)
  return e
}

function beende(
  u: LaufUmgebung, laufId: string, grund: Abschlussgrund, ergebnis: string,
  pflichtfelder?: string[], hinweis?: string,
): void {
  // The contract is checked at the outer edge only, and never enforced: a visibly failed run
  // beats valid nonsense (M8 section 4.9).
  const vertrag = pflichtfelder && pflichtfelder.length > 0
    ? checkWorkerAnswer(ergebnis, pflichtfelder)
    : null
  schreibe(u, laufId, 'run.finished', {
    endzustand: grund.endzustand,
    grund: grund.code,
    anweisung: grund.anweisung,
    ergebnis,
    vertrag: vertrag ? (vertrag.ok ? { ok: true } : { ok: false, grund: vertrag.reason }) : null,
    ...(hinweis ? { hinweis } : {}),
  })
}
