/**
 * projektion — the message history, derived from the event log and held nowhere else.
 *
 * The loop keeps no history in memory. Before every turn it projects. That makes "turn 1" and
 * "turn 14 after a restart" the same code path — and resumption, which hangs on a hard process
 * death and is therefore badly testable, has by then run a thousand times in normal operation.
 */

import type { Ereignis } from './ereignisse'
import type { Block, Nachricht } from './form'

const UNBEKANNT =
  'Ausfuehrung unbekannt, Zustand pruefen. Der Aufruf wurde begonnen, sein Ergebnis nicht ' +
  'geschrieben. Stelle den Zustand fest, bevor du weitermachst.'

export function projiziere(ereignisse: Ereignis[]): Nachricht[] {
  const verlauf: Nachricht[] = []
  let offeneIntents: string[] = []
  let ergebnisse: Block[] = []
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
    if (ergebnisse.length > 0) {
      verlauf.push({ rolle: 'nutzer', bloecke: ergebnisse })
      ergebnisse = []
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
        // Only flushes results already collected — never force-closes open intents. See the
        // comment on `ergebnisseAusspuelen` above for why this is not a message boundary.
        ergebnisseAusspuelen(false)
        // Appended to the history, never written into the stable prefix — otherwise every
        // deferred load would invalidate the cache the mechanism exists to protect.
        verlauf.push({
          rolle: 'nutzer',
          bloecke: [{ art: 'text', text:
            `Schema fuer ${String(e.nutzlast.name)}:\n${JSON.stringify(e.nutzlast.schema, null, 2)}` }],
        })
        break
      }
      default:
        break
    }
  }

  ergebnisseAusspuelen(true)
  return verlauf
}
