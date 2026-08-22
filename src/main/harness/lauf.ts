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
import { baueFortschritt, baueStabilenTeil, type PraefixTeile, type PraefixText } from './praefix'
import { anhangBlock } from './anhang'
import {
  grundFuerStopGrund, pruefeBudgets, VON_AUSSEN, ZIEL_ERREICHT,
  type Abschlussgrund, type Budgets,
} from './budget'
import { verbrauchAusEreignissen } from './verbrauch'
import type { WacheKontext } from './pfadwache'
import { META_WERKZEUG_NAME, type WerkzeugErgebnis, type WerkzeugRegistry } from './werkzeuge'
import { FAEHIGKEIT_WERKZEUG_NAME, unbekannteFaehigkeitMeldung } from './faehigkeiten'
import type { NetzKontext } from './werkzeug-netz'
import type { AusgehenderSprung } from './netzwache'
import { RECHERCHIEREN_NAME, fuehreRecherche } from './rechercheur'

export interface Auftrag {
  auftragstext: string
  modellId: string
  wurzel: string
  anhaenge?: string[]
  pflichtfelder?: string[]
  budgets: Budgets
  /**
   * Gesetzt, wenn dieser Lauf der Unterlauf eines anderen ist (heute: der Rechercheur). Es landet
   * unveraendert in `run.started` und ist die einzige Verbindung zwischen den beiden Laeufen —
   * sie teilen die Datenbank, aber nicht die `laufId`, und genau darauf ruht die Kapselung
   * (rechercheur.ts, Modulkopf).
   */
  eltern?: { laufId: string; aufrufId: string }
}

export interface LaufUmgebung {
  db: Database.Database
  eintrag: ModellEintrag
  praefixTeile: PraefixTeile
  wache: WacheKontext
  graphDb: Database.Database | null
  /**
   * Netzzugang des Laufs, wenn einer eingerichtet ist. Ohne ihn antworten die Netz-Werkzeuge
   * benannt, dass fuer diesen Lauf kein Netzzugang besteht — sie fallen nicht aus der Liste.
   *
   * Ohne `ereignisse` und ohne `melde`: das Protokoll gehoert dem Lauf, nicht der Konfiguration,
   * und `fuehreAus` setzt beides je Aufruf frisch ein. Eine hier mitgegebene Liste waere ab dem
   * ersten Zug veraltet, und die Herkunftspruefung von `seite_lesen` liefe gegen einen Stand, in
   * dem die Suche dieses Zuges noch gar nicht steht; ein hier mitgegebener Melder schriebe die
   * ausgehenden URLs des Unterlaufs in das Protokoll des Elternlaufs.
   */
  netz?: Omit<NetzKontext, 'ereignisse' | 'melde'>
  /**
   * Modell und Transport des Rechercheur-Unterlaufs, aus dem Zuordnungsplatz `rolle:rechercheur`.
   * `null` heisst: der Unterlauf faehrt das Modell dieses Laufs (rechercheur.ts).
   *
   * **Warum ein Paar und kein blosser `ModellEintrag`.** `sende` wird ausserhalb von
   * `src/main/harness/` gebaut — hier drinnen kennt kein Modul den Transport, und der
   * Waechtertest verbietet den `electron`-Import. Nur den Eintrag mitzugeben hiesse, dass der
   * Unterlauf mit dem Modell des einen und dem Endpunkt des anderen faehrt: ein Fehler, den
   * nichts anzeigen wuerde, weil beide Felder fuer sich plausibel aussehen.
   */
  rechercheurModell?: { eintrag: ModellEintrag; sende: LaufUmgebung['sende'] } | null
  /**
   * Ueberschreibt fuer **diesen Lauf**, ob Schemata auf Abruf kommen (`werkzeug_schema`) oder
   * gleich im Praefix stehen. Weggelassen gilt die Faehigkeitszeile des Eintrags.
   *
   * Es steht hier und nicht in der Faehigkeitszeile, weil es keine Aussage ueber das Modell ist,
   * sondern ueber den Zuschnitt des Laufs: der Unterlauf des Rechercheurs hat drei Werkzeuge und
   * vier Runden, und aufgeschobenes Laden kostete dort gemessen bis zur Haelfte des
   * Rundenbudgets (M12, 2026-08-22). Derselbe Eintrag faehrt im Hauptlauf weiter aufgeschoben.
   */
  aufgeschobenesLaden?: boolean
  registry: WerkzeugRegistry
  /** Every appended event, for whoever wants to watch. */
  strom: (e: Ereignis) => void
  uhr: () => number
  abgebrochen: () => boolean
  /** Wire body in, raw answer already decoded by the codec, out. */
  sende: (koerper: unknown, praefix: PraefixText) => Promise<ModelAntwort>
}

// Der Verbrauch wird aus dem Protokoll rekonstruiert und nirgends mitgeschleppt — die Funktion
// selbst steht seit dem Rechercheur in verbrauch.ts (Zyklus, siehe dort) und wird hier
// weitergereicht, damit die bisherigen Importstellen bleiben, wo sie sind.
export { verbrauchAusEreignissen } from './verbrauch'

/**
 * Ob die Schemata dieses Laufs auf Abruf kommen. Die Faehigkeitszeile sagt, was das Modell kann;
 * `u.aufgeschobenesLaden` sagt, was dieser Lauf davon nutzt. An **einer** Stelle beantwortet,
 * weil die Antwort an drei Stellen gebraucht wird — Praefixaufbau beim Start, beim Fortsetzen und
 * der Abfang in `fuehreAus`. Liefen sie auseinander, stuende `werkzeug_schema` nicht im Praefix,
 * waere aber trotzdem ausfuehrbar: die Werkzeugliste waere dann keine Aussage mehr darueber, was
 * ausgefuehrt wird.
 */
function laedtAufgeschoben(u: LaufUmgebung): boolean {
  return u.aufgeschobenesLaden ?? u.eintrag.faehigkeiten!.aufgeschobenesLaden
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
  const stummel = u.registry.stummel(laedtAufgeschoben(u))

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
    // Carried so a resumed run can rebuild the same Auftrag from this one event instead of a
    // second, possibly different one the caller assembles fresh (see harness-handlers.ts's
    // auftragAusProtokoll). Attachments are deliberately not carried the same way — they
    // already land in `anhangBloecke` below and need no separate path reconstructed from it.
    wurzel: auftrag.wurzel,
    codec: f.codec,
    werkzeuge: stummel.map(s => s.name),
    budgets: auftrag.budgets,
    hinweise,
    anhangBloecke: await anhangBloecke(auftrag),
    // Weggelassen statt leer geschrieben: ein `eltern: null` an jedem gewoehnlichen Lauf saehe
    // im Protokoll aus wie eine Angabe, die jemand geprueft hat.
    ...(auftrag.eltern ? { eltern: auftrag.eltern } : {}),
  })

  await fahre(laufId, auftrag, u)
  return laufId
}

/** Same entry point after a restart: read, project, carry on. No second implementation. */
export async function setzeFort(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  // Unlike starteLauf() (where this same throw is fine: no run.started exists yet, so nothing is
  // left hanging, and the rejection reaches the caller, which reports it to the UI), a resumed
  // run already has an open protocol. The realistic trigger is a user editing an entry's
  // capability row -- to an unbuilt codec, or to werkzeugmodus 'text' -- while a run on that
  // entry is still open, then resuming it. Before this fix the throw fell straight out of
  // setzeFort() past this function's caller with no run.finished ever written, leaving the run
  // "laeuft" forever -- the same class of bug as CodecKannNicht escaping toWire() in fahre()
  // (see the comment on that catch below). 'auftrag-unvereinbar' fits for the same reason: the
  // entry cannot carry this order at all, decided before anything is sent, and would fail
  // identically on the next resumption attempt too.
  try {
    pruefeStartbedingungen(u.eintrag)
  } catch (err) {
    beende(u, laufId, lesen(u.db, laufId), {
      code: 'auftrag-unvereinbar', endzustand: 'abgebrochen',
      anweisung: err instanceof Error ? err.message : String(err),
    }, '')
    return
  }
  await fahre(laufId, auftrag, u)
}

async function fahre(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  const f = u.eintrag.faehigkeiten!
  const codec = codecFuer(f.codec)
  const stummel = u.registry.stummel(laedtAufgeschoben(u))
  const stabil = baueStabilenTeil(u.praefixTeile, stummel)

  for (;;) {
    if (u.abgebrochen()) {
      // No turn-scoped `ereignisse` exists yet on this iteration — read fresh so a fallback
      // result (see `beende`) can still draw on whatever the model said in earlier turns.
      beende(u, laufId, lesen(u.db, laufId), VON_AUSSEN, '')
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
    // Handed to the transport as two pieces, not one text: the cache breakpoint belongs between
    // them, and a transport that only sees the joined string would have to cut it back apart on
    // a heading it does not own. `prompt.sent` still records both together — that is what went
    // out (spec 6.3).
    const fluechtig = baueFortschritt([], erledigte(ereignisse))
    const praefix = [stabil, fluechtig].filter(t => t !== '').join('\n\n')

    let koerper: unknown
    try {
      koerper = codec.toWire(verlauf, abschlussVorab ? [] : stummel, f)
    } catch (err) {
      // toWire throws CodecKannNicht when the capability row cannot carry a block type the order
      // does carry (codec.ts) — the exact refusal this whole harness is built around never being
      // silent. Before this fix that exception fell straight out of fahre(), past starteLauf(),
      // with no run.finished ever written: the run stayed "laeuft" forever and the very message
      // meant to explain why never reached the event log. Catching it here and ending the run
      // named closes that gap the same way a transport failure already does below — except the
      // reason must not say 'transportfehler': a capability mismatch is not a network problem,
      // it is settled before anything is sent and would fail the same way on a tenth attempt.
      // See the 'auftrag-unvereinbar' comment in budget.ts.
      beende(u, laufId, ereignisse, {
        code: 'auftrag-unvereinbar', endzustand: 'abgebrochen',
        anweisung: err instanceof Error ? err.message : String(err),
      }, '')
      return
    }

    if (abschlussVorab) {
      // A hit budget is a closing mode, not an exception: one last turn without tools.
      ereignisse.push(schreibe(u, laufId, 'budget.warned', {
        grund: abschlussVorab.code, anweisung: abschlussVorab.anweisung,
      }))
    }
    ereignisse.push(schreibe(u, laufId, 'prompt.sent', { text: praefix, zug: verbrauchVorab.runden + 1 }))

    let antwort: ModelAntwort
    try {
      antwort = await u.sende(koerper, { stabil, fluechtig })
    } catch (err) {
      beende(u, laufId, ereignisse, {
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
      beende(u, laufId, ereignisse, transport, nurText(antwort.bloecke))
      return
    }

    const aufrufe = werkzeugAufrufe(antwort.bloecke)

    if (aufrufe.length > 0) {
      if (abschlussVorab) {
        // The closing turn is exactly one turn, not a loop of its own — the model already had
        // its turn to comply. `continue` here would send another closing prompt, and a model
        // that keeps calling tools would keep tripping this branch: an unbounded loop bounded
        // only by a round budget that is already spent. Masking exists so the refusal lands in
        // the log instead of vanishing inside nurText() — that is the whole fix, not a second
        // chance. The run ends on this turn regardless, with the reason it was closing on and
        // whatever text the model delivered alongside the refused calls.
        for (const a of aufrufe) {
          schreibe(u, laufId, 'tool.intent', { aufrufId: a.id, name: a.name, eingabe: a.eingabe })
          schreibe(u, laufId, 'tool.failed', {
            aufrufId: a.id, name: a.name,
            meldung: 'Der Lauf ist im Abschlusszug — es wird kein Werkzeug mehr ausgefuehrt.',
          })
        }
        beende(u, laufId, ereignisse, abschlussVorab, nurText(antwort.bloecke), auftrag.pflichtfelder)
        return
      }
      // All tools in this stretch read, so all calls of a turn may run concurrently. The
      // Single-Writer rule from M8 section 3.2 holds trivially: no call writes. The mechanism
      // for it arrives with the writing tools.
      await Promise.all(aufrufe.map(a => fuehreAus(u, laufId, auftrag, a)))
      // Wall-clock time moved while the tools ran even though no new model.answered event did —
      // reconstructed again, not carried, same rule as everywhere else in this loop.
      const verbrauchNachWerkzeugen = verbrauchAusEreignissen(ereignisse, auftrag.modellId, u.uhr())
      const nachWerkzeug = pruefeBudgets(auftrag.budgets, verbrauchNachWerkzeugen, f.nutzbaresKontextfenster)
      if (nachWerkzeug) {
        schreibe(u, laufId, 'budget.warned', { grund: nachWerkzeug.code, anweisung: nachWerkzeug.anweisung })
      }
      continue
    }

    if (abschlussVorab) {
      beende(u, laufId, ereignisse, abschlussVorab, nurText(antwort.bloecke), auftrag.pflichtfelder)
      return
    }

    // A stop reason other than 'ende' with no tool call is a contradiction, not a reached goal:
    // 'werkzeug' promises a call that never arrived, 'anderes' names a reason nobody recognises.
    // Letting either through as ziel-erreicht would be exactly the silent swallowing this loop
    // must not do.
    if (antwort.stopGrund.normalisiert !== 'ende') {
      beende(u, laufId, ereignisse, {
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

    beende(u, laufId, ereignisse, ZIEL_ERREICHT, nurText(antwort.bloecke), auftrag.pflichtfelder)
    return
  }
}

/**
 * One tool call, with the intent written *before* the effect.
 *
 * That order is the whole point: a hard death between effect and result leaves an intent without
 * a completion, and the projection turns that into "execution unknown" rather than repeating the
 * call. Writing the intent afterwards would make the two states indistinguishable.
 */
async function fuehreAus(
  u: LaufUmgebung, laufId: string, auftrag: Auftrag, a: Extract<Block, { art: 'werkzeug-aufruf' }>,
): Promise<void> {
  schreibe(u, laufId, 'tool.intent', { aufrufId: a.id, name: a.name, eingabe: a.eingabe })

  // `recherchieren` startet einen eigenen Lauf und braucht dafuer Protokoll, Transport, Uhr und
  // Abbruchmarke — nichts davon steht einem Werkzeug ueber seinem WerkzeugKontext zur Verfuegung.
  // Deshalb hier abgefangen, wie werkzeug_schema und faehigkeit_lesen.
  //
  // Die Registry-Bedingung ist **die Verschachtelungssperre**, nicht Kosmetik: der Abfang laeuft
  // ueber den Namen, und der Unterlauf traegt denselben Namen genauso in einem Modellblock, wie
  // der Hauptlauf es tut. Ohne die Bedingung startete der Unterlauf einen dritten Lauf, obwohl
  // `recherchieren` gar nicht in seiner Registry steht — die Registry waere dann kein Schnitt
  // mehr, sondern eine Liste, an die sich nur der Praefix haelt. Mit ihr faellt der Aufruf
  // unten in „Es gibt kein Werkzeug 'recherchieren'".
  if (a.name === RECHERCHIEREN_NAME && u.registry.finde(RECHERCHIEREN_NAME) !== null) {
    const r = await fuehreRecherche(a.eingabe, {
      eltern: u, elternLaufId: laufId, elternAufrufId: a.id, elternAuftrag: auftrag,
      starteUnterlauf: starteLauf,
    })
    schreibeWerkzeugErgebnis(u, laufId, a, r)
    return
  }

  // Dieselbe Sperre wie bei `recherchieren`, und aus demselben Grund: der Abfang laeuft ueber den
  // Namen, und ein Name ist keine Grenze. `werkzeug_schema` ist kein Eintrag der Registry, sondern
  // entsteht in `stummel(aufgeschoben)` — also ist *das* seine Bedingung. Ohne sie liefert
  // `fuehreAus` das Schema auch einem Lauf aus, in dessen Praefix das Meta-Werkzeug gar nicht
  // steht (aufgeschobenes Laden aus): das Modell muesste den Namen bloss raten, und die Liste im
  // Praefix waere keine Aussage mehr darueber, was ausgefuehrt wird.
  if (a.name === META_WERKZEUG_NAME && laedtAufgeschoben(u)) {
    const gesucht = typeof a.eingabe.name === 'string' ? a.eingabe.name : ''
    const schema = u.registry.schemaVon(gesucht)
    if (!schema) {
      schreibe(u, laufId, 'tool.failed', {
        aufrufId: a.id, name: a.name,
        meldung: `Es gibt kein Werkzeug '${gesucht}'.`,
      })
      return
    }
    // Appended to the history, never written into the stable prefix.
    schreibe(u, laufId, 'tool.schema_loaded', { name: gesucht, schema })
    schreibe(u, laufId, 'tool.completed', {
      aufrufId: a.id, name: a.name, quelle: 'lokal',
      inhalt: [{ art: 'text', text: `Schema fuer ${gesucht} steht im Verlauf.` }],
    })
    return
  }

  // Und dieselbe Registry-Bedingung wie bei den beiden darueber. Sie ist heute folgenlos, weil
  // `faehigkeit_lesen` in beiden Registries steht — aber wer es aus der Unterlauf-Registry nimmt
  // (etwa weil lokale Skill-Rumpfe neben Fremdinhalt unerwuenscht sind), entfernte es sonst nur
  // aus dem Praefix: das Modell muesste den Namen bloss raten, und `fuehreAus` liefert den vollen
  // Rumpf aus `u.praefixTeile.faehigkeiten` aus. Die Registry waere dann kein Schnitt mehr,
  // sondern eine Liste, an die sich nur der Praefix haelt.
  if (a.name === FAEHIGKEIT_WERKZEUG_NAME && u.registry.finde(FAEHIGKEIT_WERKZEUG_NAME) !== null) {
    // Dieselbe Stelle und dieselbe Reihenfolge wie beim Meta-Werkzeug darueber, und aus demselben
    // Grund: der Rumpf gehoert an die Historie, nicht in den stabilen Praefix, und nur ein eigenes
    // Ereignis macht im Protokoll sichtbar, dass eine Faehigkeit wirklich geladen wurde.
    const gesucht = typeof a.eingabe.name === 'string' ? a.eingabe.name : ''
    const alle = u.praefixTeile.faehigkeiten
    if (gesucht === '') {
      // Eigener Zweig, nicht in die Unbekannt-Meldung gefaltet: "Es gibt keine Faehigkeit ''"
      // laesst das Modell nach einem Namen suchen, den es nie geschickt hat. Wortgleich mit der
      // Ablehnung der Dateiwerkzeuge (werkzeug-datei.ts).
      schreibe(u, laufId, 'tool.failed', {
        aufrufId: a.id, name: a.name, meldung: `Das Feld 'name' fehlt in der Eingabe.`,
      })
      return
    }
    const treffer = alle.find(f => f.name === gesucht)
    if (!treffer) {
      schreibe(u, laufId, 'tool.failed', {
        aufrufId: a.id, name: a.name,
        meldung: unbekannteFaehigkeitMeldung(gesucht, alle),
      })
      return
    }
    schreibe(u, laufId, 'skill.geladen', { name: treffer.name, text: treffer.rumpf })
    schreibe(u, laufId, 'tool.completed', {
      aufrufId: a.id, name: a.name, quelle: 'lokal',
      inhalt: [{ art: 'text', text: `Faehigkeit ${treffer.name} steht im Verlauf.` }],
    })
    return
  }

  const werkzeug = u.registry.finde(a.name)
  if (!werkzeug) {
    schreibe(u, laufId, 'tool.failed', {
      aufrufId: a.id, name: a.name,
      meldung: `Es gibt kein Werkzeug '${a.name}'. Verfuegbar sind: ` +
        u.registry.alle().map(w => w.name).join(', ') + '.',
    })
    return
  }

  try {
    // Das Protokoll wird hier gelesen und nicht mitgeschleppt: `seite_lesen` prueft die Herkunft
    // einer URL gegen die Treffer *dieses* Laufs, und der Lauf haelt seinen Zustand nirgends
    // ausser im Protokoll — dieselbe Regel wie bei Verlauf und Verbrauch. Ein Aufruf im selben
    // Zug wie die Suche sieht deren Treffer je nach Reihenfolge noch nicht; das ist die
    // fail-closed-Richtung (Ablehnung, kein Abruf), und der naechste Zug hat sie.
    const netz = u.netz
      ? {
          ...u.netz,
          ereignisse: lesen(u.db, laufId),
          // Unter *dieser* laufId, und nicht unter der des Elternlaufs: die ausgehenden URLs
          // eines Unterlaufs gehoeren in sein eigenes Protokoll (§4.1 (4), rechercheur.ts).
          //
          // `aufrufId` steht dabei, seit die Netzbudgets des Rechercheurs zaehlen, was wirklich
          // hinausging (rechercheur.ts, `mitObergrenze`). Ohne sie laesst sich nicht sagen,
          // welcher Werkzeugaufruf welche Anfrage erzeugt hat — und dann ist ein Aufruf, der an
          // der Eingabepruefung starb, von einem, dessen Abruf scheiterte, nicht zu unterscheiden.
          melde: (sprung: AusgehenderSprung & { werkzeug: string }) => {
            schreibe(u, laufId, 'netz.ausgehend', { ...sprung, aufrufId: a.id })
          },
        }
      : undefined
    const r = await werkzeug.ausfuehren(a.eingabe, { wache: u.wache, graphDb: u.graphDb, netz })
    schreibeWerkzeugErgebnis(u, laufId, a, r)
  } catch (err) {
    schreibe(u, laufId, 'tool.failed', {
      aufrufId: a.id, name: a.name,
      meldung: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Ein Werkzeugergebnis ins Protokoll, an genau einer Stelle. Der Rechercheur liefert dieselbe
 * `WerkzeugErgebnis`-Form wie jedes Werkzeug, wird aber vor der Registry abgefangen — ohne diese
 * Funktion staende der Schreibweg zweimal da, und die zweite Kopie waere die, die ein neues Feld
 * (wie `gelesen`) beim naechsten Mal nicht bekommt.
 */
function schreibeWerkzeugErgebnis(
  u: LaufUmgebung, laufId: string, a: Extract<Block, { art: 'werkzeug-aufruf' }>,
  r: WerkzeugErgebnis,
): void {
  if (!r.ok) {
    schreibe(u, laufId, 'tool.failed', { aufrufId: a.id, name: a.name, meldung: r.meldung })
    return
  }
  schreibe(u, laufId, 'tool.completed', {
    aufrufId: a.id, name: a.name, inhalt: r.inhalt, quelle: r.quelle,
    // Felder weglassen statt leer schreiben: die Herkunftspruefung liest `trefferUrls` und die
    // Quellenliste des Rechercheurs `gelesen`. Ein leeres Feld an einem Werkzeug, das gar keine
    // Treffer hat, saehe im Protokoll aus wie eine Suche ohne Ergebnis.
    ...(r.trefferUrls ? { trefferUrls: r.trefferUrls } : {}),
    ...(r.gelesen ? { gelesen: r.gelesen } : {}),
  })
}

function erledigte(ereignisse: Ereignis[]): string[] {
  return ereignisse
    .filter(e => e.art === 'tool.completed')
    .map(e => `${String(e.nutzlast.name ?? 'Werkzeug')} (${String(e.nutzlast.aufrufId)})`)
}

async function anhangBloecke(auftrag: Auftrag): Promise<Block[]> {
  if (!auftrag.anhaenge || auftrag.anhaenge.length === 0) return []
  const { readFileSync } = await import('node:fs')
  return auftrag.anhaenge.map(pfad => {
    // Attachments deliberately bypass pfadwache: they are the user's act, not the model's.
    // A path that cannot be read stops the run instead of being silently skipped — and so does
    // one whose type this stretch cannot carry (anhang.ts). Both throw before `run.started` is
    // written, so nothing hangs: the start fails with a message naming the file.
    const daten = readFileSync(pfad).toString('base64')
    return anhangBlock(pfad, daten)
  })
}

function schreibe(
  u: LaufUmgebung, laufId: string, art: Ereignis['art'], nutzlast: Record<string, unknown>,
): Ereignis {
  const e = anhaengen(u.db, laufId, art, nutzlast)
  u.strom(e)
  return e
}

// Marks a fallback result so it is never mistaken for an answer to the closing instruction —
// the two are different things (one answered what was asked, the other did not answer at all),
// and a reader (human or the next resumed turn) needs to be able to tell them apart at a glance.
const RUECKFALL_HINWEIS =
  'Rueckfall auf die letzte Modellantwort mit Text aus einem frueheren Zug — der Abschlusszug ' +
  'selbst lieferte keinen Text. '

/**
 * The last non-empty text any `model.answered` event in this run carried, read straight from the
 * events — the same source the projection itself reads, not a second store. Walked from the end
 * so the closing turn's own (here: empty) answer is skipped in favour of whatever came before it.
 */
function letzterModellText(ereignisse: Ereignis[]): string {
  for (let i = ereignisse.length - 1; i >= 0; i -= 1) {
    const e = ereignisse[i]
    if (e.art !== 'model.answered') continue
    const text = nurText((e.nutzlast.bloecke as Block[] | undefined) ?? [])
    if (text !== '') return text
  }
  return ''
}

function beende(
  u: LaufUmgebung, laufId: string, ereignisse: Ereignis[], grund: Abschlussgrund, ergebnis: string,
  pflichtfelder?: string[],
): void {
  // The spec promises a usable partial result once a budget trips (M8 section 8.4) — but a
  // closing turn that answers with no text at all (an empty block list, or only a tool call that
  // gets masked) leaves `ergebnis` empty on its own. Falling back to the last text the model did
  // produce, anywhere in the run, keeps that promise for a weak model that ignores the closing
  // instruction instead of quietly breaking it. When no turn in the whole run ever produced text,
  // the fallback also finds nothing — and stays empty rather than inventing a summary nobody
  // wrote; a fabricated result would be worse than none (see module doc).
  const endgueltigesErgebnis = ergebnis !== '' ? ergebnis : (() => {
    const frueher = letzterModellText(ereignisse)
    return frueher === '' ? '' : RUECKFALL_HINWEIS + frueher
  })()
  // The contract is checked at the outer edge only, and never enforced: a visibly failed run
  // beats valid nonsense (M8 section 4.9).
  const vertrag = pflichtfelder && pflichtfelder.length > 0
    ? checkWorkerAnswer(endgueltigesErgebnis, pflichtfelder)
    : null
  schreibe(u, laufId, 'run.finished', {
    endzustand: grund.endzustand,
    grund: grund.code,
    anweisung: grund.anweisung,
    ergebnis: endgueltigesErgebnis,
    vertrag: vertrag ? (vertrag.ok ? { ok: true } : { ok: false, grund: vertrag.reason }) : null,
  })
}
