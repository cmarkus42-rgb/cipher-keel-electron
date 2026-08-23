/**
 * setzeFolgeauftrag verdrahtet, nicht nur projiziert (Fix-Runde nach Review, I-2).
 *
 * `folgeauftrag.test.ts` faehrt ausschliesslich `projiziere` direkt und beweist damit nur, dass die
 * Projektion die richtige Form erzeugt, wenn sie ein `auftrag.folgend`-Ereignis sieht. Ungeprueft
 * blieb dabei die tragende Zusage der ganzen Aufgabe: dass `setzeFolgeauftrag` selbst den stabilen
 * Praefix nicht anfasst. Ein `sende`, das `praefix.stabil` fuer jeden Zug mitschreibt, treibt hier
 * echtes `starteLauf` gefolgt von echtem `setzeFolgeauftrag` durch dieselbe `fahre`-Schleife — im
 * Stil von `lauf-fortsetzen.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { oeffneHarnessDb, lesen } from '../../src/main/harness/protokoll'
import { starteLauf, setzeFolgeauftrag, type Auftrag, type LaufUmgebung } from '../../src/main/harness/lauf'
import { projiziere } from '../../src/main/harness/projektion'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { ModellEintrag } from '../../src/main/model/entry'

const EINTRAG: ModellEintrag = {
  id: 'test-modell', name: 'Testmodell', art: 'api',
  erreichbarkeit: { art: 'api', baseUrl: 'https://x/v1', model: 'm', keyRef: 'k' },
  oertlichkeit: 'fremdes-netz', erklaertext: '', empfehlung: '',
  faehigkeiten: {
    codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
    bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
    nutzbaresKontextfenster: 100_000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
    rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
  },
}

const BUDGETS = { runden: 6, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 }

const sagtOhneWerkzeug = (text: string): ModelAntwort => ({
  bloecke: [{ art: 'text', text }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

function baueUmgebung(db: ReturnType<typeof oeffneHarnessDb>, stabilProZug: string[]): LaufUmgebung {
  return {
    db,
    eintrag: EINTRAG,
    praefixTeile: {
      body: 'BODY', capabilities: '', persona: '', globaleRegeln: '',
      auftragstext: 'Erster Auftrag', faehigkeiten: [],
    },
    wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
    graphDb: null,
    registry: new WerkzeugRegistry([]),
    strom: () => {},
    uhr: () => 0,
    abgebrochen: () => false,
    sende: async (_koerper: unknown, praefix): Promise<ModelAntwort> => {
      stabilProZug.push(praefix.stabil)
      return sagtOhneWerkzeug('erledigt')
    },
  }
}

describe('setzeFolgeauftrag: der stabile Praefix bleibt zeichengleich', () => {
  it('sendet denselben praefix.stabil im Erstauftrag und im Folgeauftrag, und der zweite Auftragstext steht nur im Verlauf', async () => {
    const db = oeffneHarnessDb(':memory:')
    const stabilProZug: string[] = []
    const u = baueUmgebung(db, stabilProZug)
    const auftrag: Auftrag = {
      auftragstext: 'Erster Auftrag', modellId: 'test-modell', wurzel: '/tmp', budgets: BUDGETS,
    }

    const laufId = await starteLauf(auftrag, u, 'lauf-verdrahtung-folgeauftrag')
    await setzeFolgeauftrag(laufId, auftrag, u, 'Zweiter Auftrag')

    // Zwei Zuege, einer je Lauf-Runde -- sonst haette einer der beiden Aufrufe gar nicht gesendet.
    expect(stabilProZug).toHaveLength(2)

    // Die tragende Zusage: zeichengleich, nicht bloss "enthaelt dasselbe".
    expect(stabilProZug[1]).toBe(stabilProZug[0])

    // Der zweite Auftragstext darf am stabilen Teil nirgends haengen bleiben -- der `## Auftrag`
    // Abschnitt traegt ueber beide Zuege denselben ersten Auftragstext.
    expect(stabilProZug[0]).toContain('Erster Auftrag')
    expect(stabilProZug[0]).not.toContain('Zweiter Auftrag')
    expect(stabilProZug[1]).not.toContain('Zweiter Auftrag')

    // Der zweite Auftragstext steht stattdessen im Verlauf -- als `auftrag.folgend`-Ereignis, das
    // die Projektion in eine Nutzer-Nachricht uebersetzt.
    const verlaufText = JSON.stringify(projiziere(lesen(db, laufId)))
    expect(verlaufText).toContain('Zweiter Auftrag')
  })

  it('lehnt einen leeren Folgeauftragstext benannt ab, statt einen leeren Block anzuschweissen', async () => {
    const db = oeffneHarnessDb(':memory:')
    const u = baueUmgebung(db, [])
    const auftrag: Auftrag = {
      auftragstext: 'Erster Auftrag', modellId: 'test-modell', wurzel: '/tmp', budgets: BUDGETS,
    }
    const laufId = await starteLauf(auftrag, u, 'lauf-verdrahtung-leer')
    await expect(setzeFolgeauftrag(laufId, auftrag, u, '')).rejects.toThrow(/leer/)
    await expect(setzeFolgeauftrag(laufId, auftrag, u, '   ')).rejects.toThrow(/leer/)
    // Kein auftrag.folgend-Ereignis geschrieben -- die Ablehnung war vor dem Schreiben.
    expect(lesen(db, laufId).some(e => e.art === 'auftrag.folgend')).toBe(false)
  })
})
