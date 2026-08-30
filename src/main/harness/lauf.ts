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
import type { SandkastenKontext } from './sandkasten'
import { entscheide, istWirkend } from './tor'
import { RECHERCHIEREN_NAME, fuehreRecherche } from './rechercheur'
import { execFileAsync } from '../util/exec-util'

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
   * Der Prozessrand fuer `shell_ausfuehren`. Fehlt er, antwortet das Werkzeug benannt statt zu
   * laufen — dieselbe Regel wie bei `netz`.
   */
  sandkasten?: SandkastenKontext
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
 * Die Startvorbedingung wirkender Werkzeuge: die Wurzel ist ein Git-Repo, und der Arbeitsbaum ist
 * sauber.
 *
 * Warum das traegt und nicht bloss beruhigt: `.git` ist in pfadwache geschuetzt und im
 * Sandkastenprofil vom Schreiben ausgenommen. Der Rueckweg `git diff` / `git checkout` gehoert
 * damit ueber den ganzen Lauf ausschliesslich dem Menschen — kein Werkzeug und kein Kindprozess
 * kann ihn wegnehmen. Diese Pruefung stellt nur sicher, dass es zu Beginn etwas gibt, worauf man
 * zurueckkann.
 *
 * Kein Git-Repo heisst: kein Start. Nicht "Start mit Warnung" — eine Warnung, die einmal
 * weggeklickt wurde, ist beim zweiten Mal keine mehr, und der Preis ist die Arbeit eines Tages.
 *
 * Was sie *nicht* ist: Schutz vor Zeitverlust. Ein Lauf kann Stunden Arbeit zerschreiben;
 * wiederherstellbar ist, was committet war.
 */
export async function pruefeArbeitsbaum(
  wurzel: string,
): Promise<{ ok: true } | { ok: false; meldung: string }> {
  let ausgabe: string
  try {
    // Ist `wurzel` ein Unterverzeichnis eines groesseren Repos, antwortet git ueber das
    // **umschliessende** Repo. Eine schmutzige Datei irgendwo darin blockiert dann einen sauberen
    // Teilbaum. Das ist die sichere Richtung (zu viel verweigert, nie zu wenig), und der Rueckweg
    // gehoert ohnehin dem Repo, nicht dem Teilbaum — deshalb bleibt es so und steht hier, statt
    // dass es jemand spaeter als Fehler meldet.
    const r = await execFileAsync('git', ['-C', wurzel, 'status', '--porcelain'])
    ausgabe = String(r.stdout)
  } catch (err) {
    // Zwei Ausgaenge, nicht einer: fehlt das Binary, ist `git init` die falsche Antwort auf das
    // falsche Problem, und wer der Meldung folgt, sucht an der falschen Stelle. Verweigert wird
    // in beiden Faellen — unterschieden wird, was der Mensch dagegen tun kann.
    //
    // Zwei sind es und drei waeren richtig: der Zweig unter ENOENT faengt **jeden** anderen
    // Fehler von `git status` ein und nennt ihn "kein Git-Repository". Ein Repo mit sehr vielen
    // Aenderungen (maxBuffer der execFile-Vorgabe ueberschritten) und ein Repo, das git wegen
    // `detected dubious ownership` verweigert, sind beide Repos — und der Mensch, der der Meldung
    // folgt, tippt `git init` in ein bestehendes Repository. Fail-closed, also nicht gefaehrlich,
    // aber in die Irre fuehrend. Nicht in diesem Bogen geaendert, weil jede weitere
    // Unterscheidung auf der Fehlerzeile von git beruht und damit auf deren Wortlaut.
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {
        ok: false,
        meldung:
          `'git' ist auf diesem Rechner nicht aufrufbar. Ein Lauf mit schreibenden Werkzeugen ` +
          `startet nur dort, wo ein Rueckweg pruefbar ist — installiere git oder nimm die ` +
          `schreibenden Werkzeuge aus diesem Lauf.`,
      }
    }
    return {
      ok: false,
      meldung:
        `'${wurzel}' ist kein Git-Repository. Ein Lauf mit schreibenden Werkzeugen startet nur ` +
        `dort, wo es einen Rueckweg gibt — lege eines an ('git init') und sichere den ` +
        `Ausgangsstand mit einem Commit.`,
    }
  }
  if (ausgabe.trim() !== '') {
    return {
      ok: false,
      meldung:
        `Der Arbeitsbaum ist nicht sauber. Ein Lauf mit schreibenden Werkzeugen wuerde Aenderungen ` +
        `ueberschreiben, die nirgends gesichert sind — sichere sie erst ('git commit' oder ` +
        `'git stash'):\n${ausgabe.trim()}`,
    }
  }
  return { ok: true }
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

  // Vor `run.started`: ein Lauf, der hier scheitert, hat nie begonnen, und im Protokoll steht kein
  // angefangener Lauf ohne Ende.
  if (u.registry.alle().some(w => istWirkend(w.name))) {
    const baum = await pruefeArbeitsbaum(auftrag.wurzel)
    if (!baum.ok) throw new Error(baum.meldung)
  }

  schreibe(u, laufId, 'run.started', {
    auftragstext: auftrag.auftragstext,
    modellId: auftrag.modellId,
    // Carried so a resumed run can rebuild the same Auftrag from this one event instead of a
    // second, possibly different one the caller assembles fresh (see harness-sitzung.ts's
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

/**
 * Der gemeinsame Abfang von `setzeFort` und `setzeFolgeauftrag`: eine Faehigkeitszeile, die den
 * Auftrag nicht mehr tragen kann (unbekannter Codec, oder werkzeugmodus 'text'), waere ohne diesen
 * Abfang ein Wurf, der aus der jeweiligen Funktion und an deren Aufrufer vorbei faellt, mit keinem
 * `run.finished` je geschrieben -- der Lauf bliebe fuer immer "laeuft" (dieselbe Fehlerklasse wie
 * CodecKannNicht, das aus `toWire()` in `fahre()` entkommt -- siehe der Kommentar an dem Catch
 * dort). 'auftrag-unvereinbar' passt aus demselben Grund an beiden Aufrufstellen: der Eintrag kann
 * diesen Auftrag gar nicht tragen, das steht fest bevor etwas gesendet wird, und es schluege beim
 * naechsten Versuch identisch fehl.
 *
 * Realistischer Ausloeser: ein Nutzer aendert die Faehigkeitszeile eines Eintrags, waehrend ein
 * Lauf auf diesem Eintrag noch offen ist, und stoesst danach Fortsetzen oder einen Folgeauftrag an.
 *
 * Gibt `true` zurueck, wenn der Lauf deswegen bereits beendet wurde -- der Aufrufer bricht dann ab,
 * ohne `fahre` zu starten.
 */
function abfangUnvereinbar(u: LaufUmgebung, laufId: string): boolean {
  try {
    pruefeStartbedingungen(u.eintrag)
    return false
  } catch (err) {
    beende(u, laufId, lesen(u.db, laufId), {
      code: 'auftrag-unvereinbar', endzustand: 'abgebrochen',
      anweisung: err instanceof Error ? err.message : String(err),
    }, '')
    return true
  }
}

/** Same entry point after a restart: read, project, carry on. No second implementation. */
export async function setzeFort(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  if (abfangUnvereinbar(u, laufId)) return
  await fahre(laufId, auftrag, u)
}

/**
 * Ein zweiter Auftrag in denselben Lauf. **Neben** setzeFort und nicht darin: setzeFort heisst
 * „derselbe Auftrag nach einem Abriss", und ihm eine zweite Bedeutung zu geben, waere eine
 * Funktion, die zwei Dinge heisst.
 *
 * `auftrag` ist der **urspruengliche** aus auftragAusProtokoll — Budgets und modellId kommen
 * von dort, nicht aus einem zweiten Zusammenbau. `u.praefixTeile.auftragstext` bleibt ebenfalls
 * der erste: der stabile Teil muss zeichengleich bleiben, und der Folgeauftrag steht im Verlauf.
 *
 * **Der Verbrauch ist kumulativ, und diese Funktion prueft kein eigenes Budget.**
 * `verbrauchAusEreignissen` zaehlt ueber das gesamte Protokoll und misst die Wanduhr ab dem
 * Zeitstempel von `run.started` -- nicht ab diesem Aufruf. Ein Folgeauftrag in einen laengst
 * fertigen, stundenalten Lauf landet deshalb im ersten Zug direkt im Abschlussverhalten: ein
 * werkzeugloser Zug, dann `run.finished`. Ob ein Folgeauftrag ueberhaupt hineindarf, entscheidet
 * der Aufrufer (harness/fortsetzbarkeit.ts, Funktion `weiterOderFrisch`) -- hier steht nur das
 * Koennen, nicht das Duerfen.
 *
 * **Vorbedingung: der Lauf ruht.** Diese Funktion oeffnet eine **eigene** `fahre`-Schleife und
 * setzt damit voraus, dass gerade keine andere ueber denselben `laufId` laeuft. Traefe
 * `auftrag.folgend` mitten in einem laufenden Zug ein, schloesse `ergebnisseAusspuelen(true)` in
 * der Projektion nebenlaeufig offene Intents zwangsweise als "Ausfuehrung unbekannt" ab -- genau
 * der Fehler, den `tool.schema_loaded` in projektion.ts mit seinem `false` vermeidet (siehe dort,
 * und `pruefeLaufLaeuftNicht` -- definiert in harness-sitzung.ts, aus harness-handlers.ts nur
 * re-exportiert -- fuer denselben Schutz bei `setzeFort`). Der Waechter dafuer ist gebaut:
 * `beauftrageSchleife` ruft `pruefeLaufLaeuftNicht` selbst, bevor es `setzeFolgeauftrag` startet
 * (harness-sitzung.ts, im Folgeauftrags-Zweig).
 *
 * Ein Lauf, der schon ein run.finished traegt, bekommt am Ende ein zweites. laufUebersicht liest
 * ohnehin das letzte, also traegt die Uebersicht das ohne Aenderung.
 */
export async function setzeFolgeauftrag(
  laufId: string, auftrag: Auftrag, u: LaufUmgebung, text: string,
): Promise<void> {
  // Erst pruefen, ob der Eintrag den Lauf ueberhaupt tragen kann -- und zwar vor jedem Urteil
  // ueber den Inhalt des Auftrags. Ein inkompatibler Eintrag gehoert ins Protokoll
  // (`abfangUnvereinbar` schreibt `run.finished`), nicht in einen rohen `Error`, der an dieser
  // Funktion vorbei aus dem Aufrufer faellt. In der falschen Reihenfolge waere ein leerer
  // Folgeauftragstext auf einen inzwischen inkompatibel gewordenen Eintrag genau die Fehlerklasse,
  // die `abfangUnvereinbar` verhindern soll: kein `run.finished`, der Lauf steht fuer immer auf
  // "laeuft" (siehe fixierender Test dazu).
  if (abfangUnvereinbar(u, laufId)) return
  if (text.trim() === '') {
    // Benannt und hier, statt eines leeren `text`-Blocks, der erst beim Anbieter auffaellt:
    // Anthropic lehnt leere text-Bloecke ab, und dieser wuerde an eine sonst gueltige
    // Nutzer-Nachricht angeschweisst (projektion.ts, case 'auftrag.folgend').
    throw new Error(`setzeFolgeauftrag('${laufId}'): der Folgeauftragstext ist leer.`)
  }
  schreibe(u, laufId, 'auftrag.folgend', { auftragstext: text })
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
      // Single-Writer (M8 section 3.2). Enthaelt die Aufrufmenge eines Zuges *einen* wirkenden
      // Aufruf, laeuft der **ganze** Zug sequenziell, in Blockreihenfolge. Nicht "nur die
      // schreibenden serialisieren, die lesenden nebenher": ein Lesevorgang parallel zu einem
      // Schreibvorgang auf derselben Datei liefert je nach Zeitpunkt Altes oder Neues, und das
      // Protokoll saehe in beiden Faellen gleich aus. Die Reproduzierbarkeit eines Laufs ist genau
      // das, was die Teststrecke misst.
      if (aufrufe.some(a => istWirkend(a.name))) {
        for (const a of aufrufe) await fuehreAus(u, laufId, auftrag, a)
      } else {
        await Promise.all(aufrufe.map(a => fuehreAus(u, laufId, auftrag, a)))
      }
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

  // Ankuendigung, Entscheidung, Wirkung. Nur wirkende Werkzeuge: die Kette auch ueber die
  // lesenden zu legen hiesse, jedem Lesevorgang ein Ereignis zu spendieren, dessen Antwort immer
  // ja ist — das Protokoll wuerde laenger und nicht wahrer.
  // `istWirkend` davor ist nicht bloss eine Abkuerzung, sondern die Bedingung, unter der
  // `entscheide` ueberhaupt aussagekraeftig ist: fuer jeden Namen ausser dem Shell-Werkzeug faellt
  // es in den Pfadzweig und beurteilte ein `pfad`-Feld, das ein fremdes Werkzeug gar nicht hat.
  if (istWirkend(a.name)) {
    // `.erlaubt` wird sofort gelesen. `entscheide` gibt **immer** ein Objekt zurueck, also waere
    // ein `if (entscheide(...))` immer wahr und das Tor stillschweigend abgeschaltet — der Typ
    // kann das nicht verhindern.
    //
    // Was es faengt, ist genau ein Test: "ein Nein haelt die Wirkung an" in
    // tests/harness/lauf-wirkende-werkzeuge.test.ts. Er braucht ein Werkzeug, das den Pfad nicht
    // selbst noch einmal prueft — die echten Schreibwerkzeuge tun das (werkzeug-schreiben.ts,
    // Tiefenverteidigung) und lehnen mit **wortgleicher** Meldung ab. Ueber ihnen sieht ein hier
    // angehaltener Aufruf im Protokoll aus wie ein durchgelassener, der am Werkzeug scheitert;
    // gemessen am 2026-08-30 faerbte das Streichen dieser Abbruchzeile keinen Test ueber den
    // echten Werkzeugen rot.
    const urteil = entscheide(a.name, a.eingabe, u.wache)
    schreibe(u, laufId, 'tool.entschieden', {
      aufrufId: a.id, name: a.name, erlaubt: urteil.erlaubt, grund: urteil.grund,
    })
    if (!urteil.erlaubt) {
      // Ein Nein ist ein Werkzeugfehler, kein Laufende — dieselbe Regel wie bei den lesenden
      // Werkzeugen: wer zu weit greift, soll es erfahren, nicht daran sterben.
      schreibe(u, laufId, 'tool.failed', { aufrufId: a.id, name: a.name, meldung: urteil.grund })
      return
    }
  }

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
    const r = await werkzeug.ausfuehren(a.eingabe, {
      wache: u.wache, graphDb: u.graphDb, netz, sandkasten: u.sandkasten,
    })
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
