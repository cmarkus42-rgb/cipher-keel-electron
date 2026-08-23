/**
 * projektion — the message history, derived from the event log and held nowhere else.
 *
 * The loop keeps no history in memory. Before every turn it projects. That makes "turn 1" and
 * "turn 14 after a restart" the same code path — and resumption, which hangs on a hard process
 * death and is therefore badly testable, has by then run a thousand times in normal operation.
 */

import type { Ereignis } from './ereignisse'
import type { Block, Nachricht, WerkzeugQuelle } from './form'

/**
 * `quelle` aus der Nutzlast, oder nichts. Unbekannte Werte fallen weg statt zu 'lokal' zu werden:
 * eine Herkunft, die dieses Modul nicht kennt, als „aus dieser Maschine" auszugeben waere die
 * gefaehrlichere der beiden Deutungen.
 */
function quelleAus(wert: unknown): { quelle?: WerkzeugQuelle } {
  return wert === 'netz' || wert === 'lokal' ? { quelle: wert } : {}
}

const UNBEKANNT =
  'Ausfuehrung unbekannt, Zustand pruefen. Der Aufruf wurde begonnen, sein Ergebnis nicht ' +
  'geschrieben. Stelle den Zustand fest, bevor du weitermachst.'

export function projiziere(ereignisse: Ereignis[]): Nachricht[] {
  const verlauf: Nachricht[] = []
  let offeneIntents: string[] = []
  let ergebnisse: Block[] = []
  // Everything fetched on demand — deferred tool schemas and loaded skill bodies alike — waits
  // here until the turn's results are written, and then rides in the same user message, behind
  // them. None of it may become a message of its own: Anthropic requires a `tool_use` to be
  // followed immediately by a user message whose leading blocks are the matching `tool_result`s,
  // and it rejects two user messages in a row. A schema in its own message violated both at once
  // — the first real run against Anthropic died on
  // "messages.4: `tool_use` ids were found without `tool_result` blocks immediately after",
  // because the schema had wedged itself between the meta call and its own result.
  //
  // Skill bodies share this one buffer rather than getting a second: a second buffer would be a
  // second place where the same provider contract has to be honoured, and the second place is the
  // one that gets forgotten in the next rebuild.
  let nachgeladenes: Block[] = []
  const beantwortetAufrufe = new Map<string, 'zwangsabschluss' | 'ergebnis' | 'fehler'>()

  // `schliesseOffeneIntents` tells apart two very different callers. `model.answered` and the
  // end of the log are genuine message boundaries: a turn is over, and an intent still open at
  // that point really did die between effect and write (M8 section 3.4) — it is forced closed as
  // "execution unknown". `tool.schema_loaded` is not a message boundary in that sense: it is the
  // meta tool's own result landing mid-turn, alongside whichever real tools are running
  // concurrently in the same turn. Forcing it closed there force-closed every concurrently open
  // intent too — including real tool calls whose `tool.completed`/`tool.failed` had not been
  // written yet purely because the meta path has no `await` and runs synchronously ahead of them
  // (see fuehreAus in lauf.ts). Every schema fetch then told the model its own call — and any
  // sibling call in the same turn — had failed with "execution unknown", followed by a
  // contradiction notice once the real result did arrive. `false` here only flushes results
  // already sitting in `ergebnisse`, and leaves `offeneIntents` untouched.
  const ergebnisseAusspuelen = (schliesseOffeneIntents: boolean): void => {
    // An intent without a result means a hard death between effect and write. The call is not
    // repeated — M8 section 3.4. Repeating it would be harmless for today's reading tools and
    // wrong for the first writing one, and nobody would go looking for the exception then.
    if (schliesseOffeneIntents) {
      for (const aufrufId of offeneIntents) {
        ergebnisse.push({ art: 'werkzeug-ergebnis', aufrufId, inhalt: [{ art: 'text', text: UNBEKANNT }], fehler: true })
        beantwortetAufrufe.set(aufrufId, 'zwangsabschluss')
      }
      offeneIntents = []
    }
    // Results first, everything fetched on demand behind them — that order is the adjacency rule,
    // not a preference.
    if (ergebnisse.length > 0 || nachgeladenes.length > 0) {
      verlauf.push({ rolle: 'nutzer', bloecke: [...ergebnisse, ...nachgeladenes] })
      ergebnisse = []
      nachgeladenes = []
    }
  }

  for (const e of ereignisse) {
    switch (e.art) {
      case 'run.started': {
        const bloecke: Block[] = [{ art: 'text', text: String(e.nutzlast.auftragstext ?? '') }]
        const anhaenge = (e.nutzlast.anhangBloecke as Block[] | undefined) ?? []
        verlauf.push({ rolle: 'nutzer', bloecke: [...bloecke, ...anhaenge] })
        break
      }
      case 'model.answered': {
        ergebnisseAusspuelen(true)
        verlauf.push({ rolle: 'modell', bloecke: (e.nutzlast.bloecke as Block[]) ?? [] })
        break
      }
      case 'tool.intent':
        offeneIntents.push(String(e.nutzlast.aufrufId))
        break
      case 'tool.completed': {
        const id = String(e.nutzlast.aufrufId)
        const hatteIntent = offeneIntents.includes(id)
        offeneIntents = offeneIntents.filter(x => x !== id)
        const inhalt = (e.nutzlast.inhalt as Block[]) ?? []
        const finalInhalt: Block[] = []
        const vorherig = beantwortetAufrufe.get(id)
        if (vorherig === 'zwangsabschluss') {
          finalInhalt.push({ art: 'text', text: `Aufruf ${id}: Zuvor als Ausfuehrung unbekannt abgeschlossen, jetzt kommt Erfolg. Die Angaben widersprechen sich.` })
        } else if (vorherig === 'ergebnis' || vorherig === 'fehler') {
          finalInhalt.push({ art: 'text', text: `Aufruf ${id}: Zu diesem Aufruf liegt bereits ein Ergebnis vor. Dieses ist ein weiteres Ergebnis fuer denselben Aufruf.` })
        } else if (!hatteIntent) {
          finalInhalt.push({ art: 'text', text: `Aufruf ${id}: Ergebnis ohne vorherigen Intent im Protokoll.` })
        }
        finalInhalt.push(...inhalt)
        ergebnisse.push({
          art: 'werkzeug-ergebnis', aufrufId: id,
          inhalt: finalInhalt, fehler: false,
          // Durchgereicht, nicht geraten. Ein Protokoll aus der Zeit vor dieser Angabe hat kein
          // `quelle` — dann bleibt das Feld weg. Ein hier eingesetztes `'lokal'` waere eine
          // Auskunft ueber alte Laeufe, die niemand geprueft hat, und genau der Grund, warum die
          // Angabe mit dem ersten Netz-Werkzeug kommt und nicht danach.
          ...quelleAus(e.nutzlast.quelle),
        })
        beantwortetAufrufe.set(id, 'ergebnis')
        break
      }
      case 'tool.failed': {
        const id = String(e.nutzlast.aufrufId)
        const hatteIntent = offeneIntents.includes(id)
        offeneIntents = offeneIntents.filter(x => x !== id)
        const inhalt: Block[] = []
        const vorherig = beantwortetAufrufe.get(id)
        if (vorherig === 'zwangsabschluss') {
          inhalt.push({ art: 'text', text: `Aufruf ${id}: Zuvor als Ausfuehrung unbekannt abgeschlossen, jetzt kommt Fehler. Die Angaben widersprechen sich.` })
        } else if (vorherig === 'ergebnis' || vorherig === 'fehler') {
          inhalt.push({ art: 'text', text: `Aufruf ${id}: Zu diesem Aufruf liegt bereits ein Ergebnis vor. Dieses ist ein weiteres Ergebnis fuer denselben Aufruf.` })
        } else if (!hatteIntent) {
          inhalt.push({ art: 'text', text: `Aufruf ${id}: Fehler ohne vorherigen Intent im Protokoll.` })
        }
        inhalt.push({ art: 'text', text: String(e.nutzlast.meldung ?? '') })
        ergebnisse.push({
          art: 'werkzeug-ergebnis', aufrufId: id,
          inhalt, fehler: true,
        })
        beantwortetAufrufe.set(id, 'fehler')
        break
      }
      case 'tool.schema_loaded': {
        // Buffered, not written — a schema fetch is not a message boundary, and the schema is not
        // a message. It goes into the history (never into the stable prefix, which is the whole
        // point of deferred loading) at the next flush, behind the turn's tool results.
        nachgeladenes.push({ art: 'text', text:
          `Schema fuer ${String(e.nutzlast.name)}:\n${JSON.stringify(e.nutzlast.schema, null, 2)}` })
        break
      }
      case 'skill.geladen': {
        // Exactly like `tool.schema_loaded`, and deliberately not "similar": a loaded skill body
        // is not a message boundary and not a message. It goes into the history at the next
        // flush, behind the turn's tool results. Written as its own message it would reproduce
        // the acceptance-run failure the schema path already cost us once — see the comment on
        // `nachgeladenes` above and tests/harness/verlauf-anbietervertrag.test.ts.
        nachgeladenes.push({ art: 'text', text:
          `Faehigkeit ${String(e.nutzlast.name)}:\n${String(e.nutzlast.text)}` })
        break
      }
      default:
        break
    }
  }

  ergebnisseAusspuelen(true)
  return verlauf
}
