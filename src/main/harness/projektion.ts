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
  const beantwortetAufrufe = new Set<string>()

  const ergebnisseAbschliessen = (): void => {
    // An intent without a result means a hard death between effect and write. The call is not
    // repeated — M8 section 3.4. Repeating it would be harmless for today's reading tools and
    // wrong for the first writing one, and nobody would go looking for the exception then.
    for (const aufrufId of offeneIntents) {
      ergebnisse.push({ art: 'werkzeug-ergebnis', aufrufId, inhalt: [{ art: 'text', text: UNBEKANNT }], fehler: true })
      beantwortetAufrufe.add(aufrufId)
    }
    offeneIntents = []
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
        ergebnisseAbschliessen()
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
        if (beantwortetAufrufe.has(id)) {
          finalInhalt.push({ art: 'text', text: `Aufruf ${id}: Die Angaben widersprechen sich. Zuvor als Ausfuehrung unbekannt abgeschlossen, jetzt kommt Erfolg.` })
        } else if (!hatteIntent) {
          finalInhalt.push({ art: 'text', text: `Aufruf ${id}: Ergebnis ohne vorherigen Intent im Protokoll.` })
        }
        finalInhalt.push(...inhalt)
        ergebnisse.push({
          art: 'werkzeug-ergebnis', aufrufId: id,
          inhalt: finalInhalt, fehler: false,
        })
        beantwortetAufrufe.add(id)
        break
      }
      case 'tool.failed': {
        const id = String(e.nutzlast.aufrufId)
        const hatteIntent = offeneIntents.includes(id)
        offeneIntents = offeneIntents.filter(x => x !== id)
        const inhalt: Block[] = []
        if (beantwortetAufrufe.has(id)) {
          inhalt.push({ art: 'text', text: `Aufruf ${id}: Die Angaben widersprechen sich. Zuvor als Ausfuehrung unbekannt abgeschlossen, jetzt kommt Fehler.` })
        } else if (!hatteIntent) {
          inhalt.push({ art: 'text', text: `Aufruf ${id}: Fehler ohne vorherigen Intent im Protokoll.` })
        }
        inhalt.push({ art: 'text', text: String(e.nutzlast.meldung ?? '') })
        ergebnisse.push({
          art: 'werkzeug-ergebnis', aufrufId: id,
          inhalt, fehler: true,
        })
        beantwortetAufrufe.add(id)
        break
      }
      case 'tool.schema_loaded': {
        ergebnisseAbschliessen()
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

  ergebnisseAbschliessen()
  return verlauf
}
