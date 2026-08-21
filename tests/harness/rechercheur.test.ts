// Gegenproben, die zu dieser Datei gehoeren — jede wurde ausgefuehrt und rot gesehen, weil ein
// Test, der nie rot war, kein Test ist.
//
//   1. **Die volle Registry im Unterlauf** (`unterlaufRegistry` gibt zusaetzlich
//      `DATEI_WERKZEUGE`, `GRAPH_WERKZEUGE` und `rechercheurWerkzeug` heraus): **3 rot, 11 gruen**
//      — `expected [ 'datei_lesen', …(11) ] to not include 'datei_lesen'`, und der Unterlauf
//      startete einen zweiten Unterlauf (`expected […(2)] to have a length of 1 but got 2`).
//      Bemerkenswert und hier festgehalten: der **Kapselungstest blieb dabei gruen**. Die volle
//      Registry allein traegt den rohen Seiteninhalt noch nicht in den Hauptlauf — das tut erst
//      Gegenprobe 2. Zwei Schnitte, zwei Gegenproben; wer nur den einen prueft, prueft die
//      Haelfte.
//   2. **Die Trennung der Protokolle aufgehoben** (`unterLaufId = ktx.elternLaufId`): **7 rot,
//      7 gruen**. Der Kapselungstest kam mit genau der Meldung zurueck, um die es geht:
//      `expected '[{"rolle":"nutzer","bloecke":[{"art":…' not to contain
//      'GEHEIMER-SEITENINHALT-4711'` — `projiziere()` des Hauptlaufs zog den Seiteninhalt in
//      seinen Verlauf. Erste Fassung des Tests fiel hier zuerst ueber eine Hilfsabfrage
//      (`unterlaufIds` war leer) und damit aus dem falschen Grund; die Reihenfolge der Zusagen
//      im Test ist deshalb umgestellt, die Leck-Zusage steht jetzt vor jeder Aussage ueber
//      laufIds.
//   3. **Die Verschachtelungssperre aufgehoben** (Namensabfang in `fuehreAus` ohne
//      `u.registry.finde(...)`): **1 rot** — `expected […(2)] to have a length of 1 but got 2`.
//      Der Unterlauf fuhr einen dritten Lauf, obwohl `recherchieren` nicht in seiner Registry
//      steht.
//   4. **Die Quellenliste des Modells stehen gelassen** (`baueRueckgabe` ohne den Schnitt an
//      `## Quellen`): **1 rot** — `expected '## Befund\n\nX ist ein Y.\n\n## Quell…' not to
//      contain 'gibtsnicht.test'`. Die vom Modell erfundene Quelle stand in der Rueckgabe.
//   5. **Das Feld `gelesen` aus `seite_lesen` entfernt**: **1 rot** — `expected … to contain
//      'https://forum.beispiel.test/a'`. Die Quellenliste war leer, obwohl eine Seite geholt
//      wurde; genau das Feld traegt sie.
//
// Kein Netz: Modell, Suchanbieter, Aufloeser und Abrufer werden eingespeist.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oeffneHarnessDb, lesen } from '../../src/main/harness/protokoll'
import { starteLauf, type Auftrag, type LaufUmgebung } from '../../src/main/harness/lauf'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import { GRAPH_WERKZEUGE } from '../../src/main/harness/werkzeug-graph'
import { faehigkeitLesenWerkzeug, FAEHIGKEIT_WERKZEUG_NAME } from '../../src/main/harness/faehigkeiten'
import { projiziere } from '../../src/main/harness/projektion'
import {
  SEITE_LESEN_NAME, VORGABE_SEITE_GRENZEN, WEB_SUCHEN_NAME, type NetzKontext,
} from '../../src/main/harness/werkzeug-netz'
import {
  RECHERCHIEREN_NAME, TIEFEN, UNTERLAUF_RUNDEN, baueRueckgabe, rechercheurWerkzeug,
  unterlaufRegistry,
} from '../../src/main/harness/rechercheur'
import type { Abrufer, Aufloeser } from '../../src/main/harness/netzwache'
import type { SuchAnbieter, Treffer } from '../../src/main/harness/such-anbieter'
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

/**
 * Die Zeichenkette, an der dieser Test die Kapselung misst. Sie steht **nur** im Rumpf der
 * geholten Seite — nirgends im Auftrag, nirgends in einer Modellantwort des Hauptlaufs.
 */
const GEHEIM = 'GEHEIMER-SEITENINHALT-4711'

const ABSATZ =
  'Ein Absatz mit echtem Fliesstext, lang genug, dass Readability ihn als Inhalt bewertet und ' +
  'nicht als Navigation verwirft. Er wiederholt sich, weil der Testinhalt nichts bedeuten muss. '

function seite(titel: string, geheimnis: string): string {
  return `<html><head><title>${titel}</title></head><body><article><h1>${titel}</h1>` +
    `<p>${ABSATZ.repeat(2)}</p><p>${geheimnis} ${ABSATZ}</p></article></body></html>`
}

const TREFFER: Treffer[] = [
  { titel: 'Erste Fundstelle', url: 'https://forum.beispiel.test/a', auszug: 'Auszug A', engine: 'test' },
  { titel: 'Zweite Fundstelle', url: 'https://forum.beispiel.test/b', auszug: 'Auszug B', engine: 'test' },
  { titel: 'Dritte Fundstelle', url: 'https://forum.beispiel.test/c', auszug: 'Auszug C', engine: 'test' },
]

const ANBIETER: SuchAnbieter = {
  name: 'test-anbieter',
  async suche(_anfrage, anzahl) {
    return { treffer: TREFFER.slice(0, anzahl), engineLage: 'Engines: alle.' }
  },
}

const AUFLOESER: Aufloeser = async () => ['93.184.216.34']

function abrufer(erreicht: string[]): Abrufer {
  return async ({ url }) => {
    erreicht.push(url)
    const kurz = url.slice(url.lastIndexOf('/') + 1)
    return new Response(seite(`Seite ${kurz}`, GEHEIM), {
      status: 200, headers: { 'content-type': 'text/html' },
    })
  }
}

function netzKontext(erreicht: string[]): Omit<NetzKontext, 'ereignisse'> {
  return {
    anbieter: ANBIETER,
    suchAbrufer: (async () => new Response('nie benutzt')) as unknown as typeof fetch,
    aufloesen: AUFLOESER,
    abrufen: abrufer(erreicht),
    // Der Hauptlauf faehrt 'whitelist'; der Unterlauf muss selbst auf 'offen' schalten. Die
    // Positivliste enthaelt `forum.beispiel.test` bewusst **nicht**: bliebe der Modus stehen,
    // kaeme keine der Seiten herein, und der Kapselungstest waere aus dem falschen Grund gruen.
    modus: 'whitelist',
    positivliste: ['nodejs.org'],
    seiteGrenzen: VORGABE_SEITE_GRENZEN,
  }
}

// --- Modellantworten ---------------------------------------------------------------------------

const ruft = (name: string, eingabe: Record<string, unknown>, id = 'c1'): ModelAntwort => ({
  bloecke: [{ art: 'werkzeug-aufruf', id, name, eingabe }],
  stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const sagt = (text: string): ModelAntwort => ({
  bloecke: [{ art: 'text', text }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

interface Baukasten {
  haupt: ModelAntwort[]
  unter: ModelAntwort[]
  erreicht?: string[]
  ohneNetz?: boolean
}

function umgebung(wurzel: string, b: Baukasten): LaufUmgebung {
  const haupt = [...b.haupt]
  const unter = [...b.unter]
  let t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: {
      body: 'BODY', capabilities: '', persona: '', globaleRegeln: '',
      auftragstext: 'a', faehigkeiten: [],
    },
    wache: { wurzel, heim: wurzel, userDataPfad: join(wurzel, 'ud') },
    graphDb: null,
    netz: b.ohneNetz ? undefined : netzKontext(b.erreicht ?? []),
    registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, rechercheurWerkzeug, faehigkeitLesenWerkzeug]),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    // Die Weiche zwischen Haupt- und Unterlauf laeuft ueber den stabilen Praefix: nur der
    // Unterlauf hat `web_suchen` in seiner Werkzeugliste. Damit prueft schon der Aufbau des
    // Tests mit, dass die beiden Laeufe verschiedene Registries sehen.
    sende: async (_koerper, praefix): Promise<ModelAntwort> => {
      const istUnterlauf = praefix.stabil.includes(`\`${WEB_SUCHEN_NAME}\``)
      const schlange = istUnterlauf ? unter : haupt
      const a = schlange.shift()
      if (!a) throw new Error(`keine Antwort mehr fuer ${istUnterlauf ? 'Unterlauf' : 'Hauptlauf'}`)
      return a
    },
  }
}

const AUFTRAG = (wurzel: string): Auftrag => ({
  auftragstext: 'finde etwas heraus', modellId: 'test-modell', wurzel,
  budgets: { runden: 6, wanduhrMs: 600_000, kostenCent: 1000, kontextAnteil: 0.9 },
})

function mitWurzel<T>(f: (wurzel: string) => Promise<T> | T): Promise<T> | T {
  const w = mkdtempSync(join(tmpdir(), 'keel-rech-'))
  const fertig = () => rmSync(w, { recursive: true, force: true })
  try {
    const r = f(w)
    return r instanceof Promise ? r.finally(fertig) : (fertig(), r)
  } catch (e) {
    fertig()
    throw e
  }
}

/** Der Unterlauf ist der Lauf, der nicht der Hauptlauf ist — es gibt genau zwei. */
function unterlaufIds(db: LaufUmgebung['db'], hauptId: string): string[] {
  const alle = db.prepare('SELECT DISTINCT lauf_id FROM ereignisse').all() as { lauf_id: string }[]
  return alle.map(r => r.lauf_id).filter(id => id !== hauptId)
}

// ===============================================================================================
// 1. Die Registry des Unterlaufs
// ===============================================================================================

describe('Registry des Unterlaufs (§4.1 (1))', () => {
  it('traegt genau web_suchen, seite_lesen und faehigkeit_lesen — woertlich ueber die Stummelnamen', () => {
    const namen = unterlaufRegistry('gruendlich').stummel(true).map(s => s.name).sort()
    expect(namen).toEqual([FAEHIGKEIT_WERKZEUG_NAME, SEITE_LESEN_NAME, 'werkzeug_schema', WEB_SUCHEN_NAME].sort())
  })

  it('enthaelt kein Datei-Werkzeug, kein Graph-Werkzeug und kein recherchieren', () => {
    // Woertlich ueber die Namen der echten Werkzeuglisten, nicht ueber eine hier abgeschriebene
    // Liste: ein spaeter hinzugefuegtes Graph-Werkzeug faellt damit von selbst unter die Regel.
    const namen = unterlaufRegistry('kurz').stummel(true).map(s => s.name)
    expect(DATEI_WERKZEUGE.length).toBeGreaterThan(0)
    expect(GRAPH_WERKZEUGE.length).toBeGreaterThan(0)
    for (const w of [...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE]) {
      expect(namen).not.toContain(w.name)
    }
    expect(namen).not.toContain(RECHERCHIEREN_NAME)
    // Und dieselbe Frage an die ausfuehrende Seite, nicht nur an die Stummel: `finde` ist es, was
    // `fuehreAus` benutzt.
    for (const w of [...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE]) {
      expect(unterlaufRegistry('kurz').finde(w.name)).toBeNull()
    }
    expect(unterlaufRegistry('kurz').finde(RECHERCHIEREN_NAME)).toBeNull()
  })
})

// ===============================================================================================
// 2. Die Kapselung — der Test, der das Ganze traegt
// ===============================================================================================

describe('Kapselung: der Seiteninhalt bleibt im Unterlauf', () => {
  it('legt dem Hauptlauf nur den Ergebnistext vor, nie den Seiteninhalt', async () => {
    await mitWurzel(async (w) => {
      const erreicht: string[] = []
      const u = umgebung(w, {
        erreicht,
        haupt: [
          ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'),
          sagt('fertig'),
        ],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          sagt('## Befund\n\nX ist laut der Fundstelle ein Y.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)

      // (a) Der Abruf hat wirklich stattgefunden — gemessen am Abrufer und damit unabhaengig
      // davon, unter welcher laufId etwas im Protokoll steht. Ohne diese Zeile waere der Test
      // auch dann gruen, wenn `seite_lesen` gar nichts geholt haette: der teuerste Fehlermodus
      // dieses Repos. Und sie belegt zugleich den Modus 'offen' — `forum.beispiel.test` steht
      // nicht auf der Positivliste, mit der der Hauptlauf faehrt.
      expect(erreicht).toEqual([TREFFER[0].url])

      // (b) Die Kapselung selbst, und sie steht bewusst **vor** jeder Aussage ueber die laufIds:
      // wer die Trennung aufhebt, soll diese Zeile fallen sehen und nicht eine Hilfsabfrage des
      // Tests. Der rohe Seiteninhalt darf weder im projizierten Verlauf des Hauptlaufs stehen ...
      const hauptEreignisse = lesen(u.db, hauptId)
      const hauptVerlauf = JSON.stringify(projiziere(hauptEreignisse))
      expect(hauptVerlauf).not.toContain(GEHEIM)
      // ... noch in irgendeinem seiner Ereignisse, und damit auch in keinem `prompt.sent`.
      expect(JSON.stringify(hauptEreignisse)).not.toContain(GEHEIM)

      // (c) Was der Hauptlauf sehr wohl bekommt: den Ergebnistext.
      expect(hauptVerlauf).toContain('X ist laut der Fundstelle ein Y.')

      // (d) Und der Unterlauf hat den Inhalt gesehen — sonst misst (b) eine Recherche, die gar
      // nichts gelesen hat.
      const unterIds = unterlaufIds(u.db, hauptId)
      expect(unterIds).toHaveLength(1)
      expect(JSON.stringify(projiziere(lesen(u.db, unterIds[0])))).toContain(GEHEIM)
    })
  })

  it('faehrt den Unterlauf unter eigener laufId mit Verweis auf den Elternlauf', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [sagt('## Befund\n\nNichts gefunden.')],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const gestartet = lesen(u.db, unterId).find(e => e.art === 'run.started')
      expect(gestartet?.nutzlast.eltern).toEqual({ laufId: hauptId, aufrufId: 'r1' })
    })
  })

  it('startet keinen zweiten Unterlauf, wenn der Unterlauf selbst recherchieren ruft', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(RECHERCHIEREN_NAME, { frage: 'Und was ist Y?' }, 'r2'),
          sagt('## Befund\n\nGeht nicht.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      // Genau ein Unterlauf, kein zweiter.
      expect(unterlaufIds(u.db, hauptId)).toHaveLength(1)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const abgelehnt = lesen(u.db, unterId).find(e => e.art === 'tool.failed')
      expect(String(abgelehnt?.nutzlast.meldung)).toContain(RECHERCHIEREN_NAME)
    })
  })
})

// ===============================================================================================
// 3. Die Obergrenzen des Unterlaufs
// ===============================================================================================

describe('Obergrenzen des Unterlaufs (§3.4)', () => {
  it('meldet das Seitenbudget benannt, statt still eine dritte Seite zu holen', async () => {
    await mitWurzel(async (w) => {
      const erreicht: string[] = []
      const u = umgebung(w, {
        erreicht,
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X', anzahl: 3 }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[1].url }, 'p2'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[2].url }, 'p3'),
          sagt('## Befund\n\nZwei Seiten reichen.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ev = lesen(u.db, unterId)

      // Zwei Seiten wurden geholt, die dritte nicht — gemessen am Abrufer, nicht am Protokoll.
      expect(erreicht).toEqual([TREFFER[0].url, TREFFER[1].url])
      const abgelehnt = ev.find(e => e.art === 'tool.failed' && e.nutzlast.aufrufId === 'p3')
      expect(String(abgelehnt?.nutzlast.meldung)).toContain('Seitenbudget')
      expect(String(abgelehnt?.nutzlast.meldung)).toContain(String(TIEFEN.kurz.seiten))
      // Die abgelehnte URL steht trotzdem vollstaendig im Protokoll (§4.1 (4)).
      const versuch = ev.find(e => e.art === 'tool.intent' && e.nutzlast.aufrufId === 'p3')
      expect((versuch?.nutzlast.eingabe as { url: string }).url).toBe(TREFFER[2].url)
    })
  })

  it('meldet das Suchbudget benannt, statt still eine vierte Suche laufen zu lassen', async () => {
    await mitWurzel(async (w) => {
      const anfragen: string[] = []
      const zaehlenderAnbieter: SuchAnbieter = {
        name: 'zaehlend',
        async suche(anfrage, anzahl) {
          anfragen.push(anfrage)
          return { treffer: TREFFER.slice(0, anzahl), engineLage: 'Engines: alle.' }
        },
      }
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'gruendlich' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'eins' }, 's1'),
          ruft(WEB_SUCHEN_NAME, { anfrage: 'zwei' }, 's2'),
          ruft(WEB_SUCHEN_NAME, { anfrage: 'drei' }, 's3'),
          ruft(WEB_SUCHEN_NAME, { anfrage: 'vier' }, 's4'),
        ],
      })
      u.netz = { ...u.netz!, anbieter: zaehlenderAnbieter }
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)

      expect(anfragen).toEqual(['eins', 'zwei', 'drei'])
      const abgelehnt = lesen(u.db, unterId).find(e => e.art === 'tool.failed' && e.nutzlast.aufrufId === 's4')
      expect(String(abgelehnt?.nutzlast.meldung)).toContain('Suchbudget')
    })
  })

  it('endet nach dem Rundenbudget des Unterlaufs und nennt es im Ergebnis', async () => {
    await mitWurzel(async (w) => {
      // Werkzeugschemata kosten Runden, aber weder Suche noch Seitenabruf — so misst dieser Test
      // das Rundenbudget und nicht versehentlich eines der beiden Netzbudgets.
      const schema = () => ruft('werkzeug_schema', { name: WEB_SUCHEN_NAME }, `x${Math.random()}`)
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [schema(), schema(), schema(), schema(), sagt('## Befund\n\nAbgebrochen.')],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ev = lesen(u.db, unterId)

      expect(ev.filter(e => e.art === 'model.answered')).toHaveLength(UNTERLAUF_RUNDEN + 1)
      expect(ev.at(-1)?.nutzlast).toMatchObject({ grund: 'runden-erschoepft' })

      // Und der Hauptlauf erfaehrt davon — benannt, nicht als vollwertiger Befund.
      const ergebnis = lesen(u.db, hauptId)
        .find(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'r1')
      const text = JSON.stringify(ergebnis?.nutzlast.inhalt)
      expect(text).toContain('runden-erschoepft')
    })
  })
})

// ===============================================================================================
// 4. Die Rueckgabeform
// ===============================================================================================

describe('Rueckgabe des Rechercheurs', () => {
  it('hat ## Befund und ## Quellen, und die Quellen kommen aus dem Protokoll', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          // Das Modell laesst die Quellen weg und behauptet stattdessen eine falsche. Beides darf
          // nichts aendern: die Liste baut keel aus dem Protokoll.
          sagt('## Befund\n\nX ist ein Y.\n\n## Quellen\n\n- Erfunden — https://gibtsnicht.test/'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const ergebnis = lesen(u.db, hauptId)
        .find(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'r1')
      const bloecke = ergebnis?.nutzlast.inhalt as { art: string; text: string }[]
      expect(bloecke).toHaveLength(1)
      const text = bloecke[0].text

      expect(text).toContain('## Befund')
      expect(text).toContain('X ist ein Y.')
      expect(text).toContain('## Quellen')
      expect(text).toContain(TREFFER[0].url)
      expect(text).not.toContain('gibtsnicht.test')
      expect(text.indexOf('## Befund')).toBeLessThan(text.indexOf('## Quellen'))
      // Fremdbestimmt, und das steht auch so im Protokoll.
      expect(ergebnis?.nutzlast.quelle).toBe('netz')
    })
  })

  it('sagt es, wenn keine Seite abgerufen wurde, statt eine leere Liste hinzuschreiben', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [sagt('## Befund\n\nAus dem Gedaechtnis.')],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const ergebnis = lesen(u.db, hauptId)
        .find(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'r1')
      const text = (ergebnis?.nutzlast.inhalt as { text: string }[])[0].text
      expect(text).toContain('## Quellen')
      expect(text).toContain('Keine Seite wurde abgerufen')
    })
  })

  it('kappt den Befund, nicht die Quellenliste', () => {
    const lang = 'A'.repeat(60_000)
    const text = baueRueckgabe(lang, [{ titel: 'T', url: 'https://a.test/x' }], '')
    expect(text.length).toBeLessThan(20_000)
    expect(text).toContain('## Quellen')
    expect(text).toContain('https://a.test/x')
  })
})

// ===============================================================================================
// 5. Absagen ohne Unterlauf
// ===============================================================================================

describe('Benannte Absagen', () => {
  it('lehnt eine fehlende Frage benannt ab und startet keinen Unterlauf', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, { haupt: [ruft(RECHERCHIEREN_NAME, {}, 'r1'), sagt('ok')], unter: [] })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      expect(unterlaufIds(u.db, hauptId)).toEqual([])
      const f = lesen(u.db, hauptId).find(e => e.art === 'tool.failed')
      expect(String(f?.nutzlast.meldung)).toContain(`'frage'`)
    })
  })

  it('lehnt eine unbekannte Tiefe benannt ab, statt still auf kurz zu fallen', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'X?', tiefe: 'sehr gruendlich' }, 'r1'), sagt('ok')],
        unter: [],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      expect(unterlaufIds(u.db, hauptId)).toEqual([])
      const f = lesen(u.db, hauptId).find(e => e.art === 'tool.failed')
      expect(String(f?.nutzlast.meldung)).toContain('sehr gruendlich')
    })
  })

  it('sagt benannt ab, wenn der Lauf gar keinen Netzzugang hat', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        ohneNetz: true,
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'X?' }, 'r1'), sagt('ok')],
        unter: [],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      expect(unterlaufIds(u.db, hauptId)).toEqual([])
      const f = lesen(u.db, hauptId).find(e => e.art === 'tool.failed')
      expect(String(f?.nutzlast.meldung)).toContain('Netzzugang')
    })
  })
})
