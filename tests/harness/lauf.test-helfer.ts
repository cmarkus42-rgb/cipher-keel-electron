/**
 * lauf.test-helfer — der Aufbau einer LaufUmgebung fuer die Tests der Schleife.
 *
 * Ausgezogen aus lauf.test.ts, wortgleich bis auf drei Vorgabewerte, die jetzt ueberschreibbar
 * sind: Wurzel, Heim und Registry. Zwei Testdateien fahren dieselbe Schleife, und der zweite
 * Aufbau waere der, der eine neue Pflichtangabe der LaufUmgebung beim naechsten Mal nicht bekommt.
 *
 * **Die leere Registry bleibt die Vorgabe.** Ein Lauf mit wirkenden Werkzeugen bekommt eine
 * Git-Vorbedingung; lauf.test.ts faehrt ueber '/tmp' und ueberlebt das nur, weil seine Registry
 * leer ist und die Bedingung gar nicht greift. Eine nicht-leere Vorgabe hier braeche das an einer
 * Stelle, an der niemand danach suchen wuerde.
 */

import { join } from 'node:path'
import { oeffneHarnessDb } from '../../src/main/harness/protokoll'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import type { LaufUmgebung } from '../../src/main/harness/lauf'
import type { SandkastenKontext } from '../../src/main/harness/sandkasten'
import type { ModellEintrag } from '../../src/main/model/entry'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { PraefixText } from '../../src/main/harness/praefix'

export const EINTRAG: ModellEintrag = {
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

export const AUFTRAG = {
  auftragstext: 'sag hallo', modellId: 'test-modell', wurzel: '/tmp',
  budgets: { runden: 3, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.8 },
}

/** A transport stand-in: the loop must not know it is not talking to a network. */
export function baueUmgebung(opts: {
  antworten: ModelAntwort[]
  gesendet?: PraefixText[]
  /** Vorgabe '/tmp', wie bisher. */
  wurzel?: string
  /** Vorgabe: dieselbe wie wurzel, wie bisher. */
  heim?: string
  /** Vorgabe: leer, wie bisher. */
  registry?: WerkzeugRegistry
  sandkasten?: SandkastenKontext
}): LaufUmgebung {
  const antworten = opts.antworten
  const gesendet = opts.gesendet ?? []
  const wurzel = opts.wurzel ?? '/tmp'
  const heim = opts.heim ?? wurzel
  let i = 0
  let t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: AUFTRAG.auftragstext, faehigkeiten: [] },
    // Aus dem Heim abgeleitet statt fest verdrahtet — fuer die Vorgabewerte ist das wortgleich
    // das bisherige '/tmp/ud', und mit einer eigenen Wurzel bleibt der Pfad in derselben Ecke
    // wie das Heim, statt auf eine fremde zu zeigen.
    wache: { wurzel, heim, userDataPfad: join(heim, 'ud') },
    graphDb: null,
    registry: opts.registry ?? new WerkzeugRegistry([]),
    sandkasten: opts.sandkasten,
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    sende: async (_koerper: unknown, praefix: PraefixText): Promise<ModelAntwort> => {
      gesendet.push(praefix)
      return antworten[i++]
    },
  }
}

export function antwort(text: string, stop: 'ende' | 'laenge' = 'ende'): ModelAntwort {
  return {
    bloecke: [{ art: 'text', text }],
    stopGrund: { normalisiert: stop, roh: stop === 'ende' ? 'stop' : 'length' },
    usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
  }
}

/** A turn the model answered without any text block — the case Fund 2 is about. */
export function antwortLeer(): ModelAntwort {
  return {
    bloecke: [],
    stopGrund: { normalisiert: 'ende', roh: 'stop' },
    usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
  }
}
