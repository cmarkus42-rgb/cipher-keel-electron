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
// Nacharbeit 2026-08-21, fuenf Befunde der Pruefung. Jede Gegenprobe gegen den Stand *vor* der
// Behebung ausgefuehrt:
//
//   6. **Die End-URL ungekappt in die Quellenliste** (`url` statt `quellzeile(url, …)`): **2 rot**
//      — `expected '[{"rolle":"nutzer","bloecke":[{"art":…' not to contain
//      'INJEKTION-AUS-DER-SEITE'` und `expected 4648 to be less than or equal to 300`. Der Text
//      aus dem `Location`-Kopf einer Trefferseite stand woertlich im Verlauf des Hauptlaufs:
//      4.648 Zeichen Quellzeile gegen 300 erlaubte.
//   7. **Der Melder in `fuehreAus` schreibt nichts**: **2 rot** — `expected '[[{"laufId":…' to
//      contain 'GEHEIM-HOP-EINS'` und `expected [] to have a length of 1 but got +0`. Die
//      Zwischenziele der Weiterleitungskette und die Anfrage-URL des Suchdienstes standen in
//      keinem Ereignis (§4.1 (4)).
//   8. **Die Obergrenze fuer die Zahl der Recherchen ausgeschaltet**: **1 rot** — `expected
//      […(8)] to have a length of 3 but got 8`. Acht Aufrufe eines Zuges fuhren acht
//      nebenlaeufige Unterlaeufe, jeder mit vollem eigenem Budget.
//   9. **`unterlauf.verbraucht` nicht mitgezaehlt** (verbrauch.ts): **1 rot** — `expected 0.008
//      to be close to 0.012`. Genau der Zug des Unterlaufs fehlte im Kostenbudget des Hauptlaufs.
//  10. **`pruefeKeinUnterlauf` und `istUnterlauf` ausgeschaltet**: **1 rot** — `expected true to
//      be false`. Ein abgestuerzter Unterlauf war fortsetzbar und in der Liste des Fensters von
//      einem Hauptlauf nicht zu unterscheiden.
//  11. **Der alte Systemtext** („kein Dateisystem"): **1 rot** — `expected 'Du bist der
//      abgeschottete Rechercheur…' not to contain 'kein Dateisystem'`. Der Unterlauf hat seit dem
//      Nachtrag `faehigkeit_lesen`.
//
// Nacharbeit 2026-08-22, eigener Zuordnungsplatz fuer das Modell des Unterlaufs. Beide
// Gegenproben gegen den Stand *vor* der Behebung ausgefuehrt:
//
//  12. **`modellId: ktx.elternAuftrag.modellId`** (der Stand davor, Zeile 550): **2 rot** —
//      `expected 'test-modell' to be 'rechercheur-modell'` und `expected +0 to be close to
//      0.004`. Die zweite ist die interessantere: der Unterlauf wurde zum Preis des Modells
//      verrechnet, das ihn gar nicht gefahren hat.
//  13. **Nur den Eintrag uebernommen, nicht den Transport**: **3 rot**. Der Unterlauf fuhr dann
//      gegen `sende` des Hauptlaufs, bekam dessen Antwortschlange und tat gar nichts —
//      `expected [] to deeply equal [ 'rechercheur-modell' ]`. Deshalb sind Eintrag und `sende`
//      ein Paar und kein Feld.
//
// Nacharbeit 2026-08-22, M12 — zehn echte Recherchen gegen `keel-qwen38:27b` mit Tavily. Die
// Zahlen stehen im Messbericht; hier die Gegenproben zu dem, was daraus behoben wurde:
//
//  14. **Die alte Budgetzaehlung** (jeder `tool.intent` zaehlt, auch der an der Eingabepruefung
//      gestorbene): **1 rot** — `expected [] to deeply equal [ …(2) ]`. Zwei Fehlaufrufe eines
//      Zuges verbrannten das ganze Seitenbudget, und keine Seite wurde geholt. Genau das ist in
//      vier von zehn echten Laeufen passiert.
//  15. **`aufrufId` nicht am `netz.ausgehend`**: **2 rot**, darunter `expected [ …(3) ] to deeply
//      equal [ …(2) ]` — ohne sie ist ein Aufruf, der hinausging und dann scheiterte, von einem,
//      der nie hinausging, nicht zu unterscheiden, und ein Ziel mit zuverlaessigem HTTP 500 waere
//      ein unbegrenzter Kanal nach draussen.
//  16. **Aufgeschobenes Laden im Unterlauf wieder an**: **2 rot**. `werkzeug_schema` stand wieder
//      in der Werkzeugliste des Unterlaufs. In den echten Laeufen kostete das in acht von zehn
//      Faellen zwei der vier Runden.
//  17. **Der Abfang in `fuehreAus` folgt weiter der Faehigkeitszeile statt dem Lauf**: **1 rot**.
//      `werkzeug_schema` waere dann ausfuehrbar gewesen, ohne im Praefix zu stehen — die
//      Werkzeugliste waere keine Aussage mehr darueber, was ausgefuehrt wird.
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
  SEITE_LESEN_NAME, VORGABE_SEITE_GRENZEN, WEB_SUCHEN_NAME,
} from '../../src/main/harness/werkzeug-netz'
import {
  MAX_QUELL_TITEL_ZEICHEN, MAX_QUELL_URL_ZEICHEN, MAX_RECHERCHEN_JE_LAUF, RECHERCHIEREN_NAME,
  SYSTEMTEXT, TIEFEN, UNTERLAUF_RUNDEN, baueRueckgabe, quellenAusProtokoll, rechercheurWerkzeug,
  unterlaufRegistry,
} from '../../src/main/harness/rechercheur'
import { verbrauchAusEreignissen } from '../../src/main/harness/verbrauch'
import { pruefeKeinUnterlauf, laufUebersicht } from '../../src/main/harness-handlers'
import type { Abrufer, Aufloeser } from '../../src/main/harness/netzwache'
import { SearxngAnbieter, type SuchAnbieter, type Treffer } from '../../src/main/harness/such-anbieter'
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

function netzKontext(erreicht: string[]): LaufUmgebung['netz'] {
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

/** Ein Zug mit mehreren Werkzeugaufrufen — die Form, in der ein Modell sie wirklich schickt. */
const ruftMehrfach = (
  aufrufe: [string, Record<string, unknown>, string][],
): ModelAntwort => ({
  bloecke: aufrufe.map(([name, eingabe, id]) => ({ art: 'werkzeug-aufruf', id, name, eingabe })),
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
  /** Der eigene Zuordnungsplatz des Rechercheurs (`rolle:rechercheur`), wenn einer besetzt ist. */
  rechercheurModell?: LaufUmgebung['rechercheurModell']
}

function umgebung(wurzel: string, b: Baukasten): LaufUmgebung & { gesendet: unknown[] } {
  const haupt = [...b.haupt]
  const unter = [...b.unter]
  const gesendet: unknown[] = []
  let t = 0
  return {
    gesendet,
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: {
      body: 'BODY', capabilities: '', persona: '', globaleRegeln: '',
      auftragstext: 'a', faehigkeiten: [],
    },
    wache: { wurzel, heim: wurzel, userDataPfad: join(wurzel, 'ud') },
    graphDb: null,
    rechercheurModell: b.rechercheurModell ?? null,
    netz: b.ohneNetz ? undefined : netzKontext(b.erreicht ?? []),
    registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, rechercheurWerkzeug, faehigkeitLesenWerkzeug]),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    // Die Weiche zwischen Haupt- und Unterlauf laeuft ueber den stabilen Praefix: nur der
    // Unterlauf hat `web_suchen` in seiner Werkzeugliste. Damit prueft schon der Aufbau des
    // Tests mit, dass die beiden Laeufe verschiedene Registries sehen.
    sende: async (koerper, praefix): Promise<ModelAntwort> => {
      gesendet.push(koerper)
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

describe('Der Unterlauf bekommt seine Schemata sofort, nicht auf Abruf', () => {
  it('stellt die vollen Schemata in den Praefix und laesst werkzeug_schema weg', async () => {
    // Gemessen an zehn echten Recherchen (M12, 2026-08-22): das Modell holte in acht von zehn
    // Laeufen zuerst ein oder zwei Schemata — richtig, der Praefix fordert es so — und
    // verbrauchte damit bis zur Haelfte seines Rundenbudgets von vier. In sechs Laeufen wurde
    // danach keine einzige Seite mehr gelesen.
    //
    // Aufgeschobenes Laden ist ein Hebel fuer einen Lauf mit vielen Werkzeugen und Raum. Der
    // Unterlauf hat drei Werkzeuge und vier Runden; die drei Schemata kosten im Praefix weniger
    // als eine Runde.
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [sagt('## Befund\n\nNichts.')],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ev = lesen(u.db, unterId)

      const werkzeuge = (ev.find(e => e.art === 'run.started')?.nutzlast.werkzeuge ?? []) as string[]
      expect(werkzeuge.sort()).toEqual([FAEHIGKEIT_WERKZEUG_NAME, SEITE_LESEN_NAME, WEB_SUCHEN_NAME].sort())
      expect(werkzeuge).not.toContain('werkzeug_schema')

      // Und die Schemata gehen wirklich mit — in die `tools` des Koerpers, wo sie hingehoeren,
      // nicht in den Prompt-Text. Ohne diese Zusage waere der Test auch dann gruen, wenn dem
      // Modell nur der Name ohne Schema und ohne `werkzeug_schema` vorlaege: es koennte dann
      // ueberhaupt nicht mehr richtig aufrufen.
      type Koerper = {
        tools?: { function: { name: string; parameters?: { properties?: Record<string, unknown> } } }[]
      }
      // Der Koerper des **Unterlaufs**, erkannt an seiner Werkzeugliste — der Hauptlauf antwortet
      // danach noch und schriebe sonst den letzten Eintrag.
      const werkzeugeImKoerper = (u.gesendet as Koerper[])
        .map(k => k.tools ?? [])
        .filter(t => t.some(x => x.function.name === SEITE_LESEN_NAME))
        .at(-1) ?? []
      const seite = werkzeugeImKoerper.find(t => t.function.name === SEITE_LESEN_NAME)
      expect(Object.keys(seite?.function.parameters?.properties ?? {})).toContain('max_zeichen')
      const suche = werkzeugeImKoerper.find(t => t.function.name === WEB_SUCHEN_NAME)
      expect(Object.keys(suche?.function.parameters?.properties ?? {})).toContain('anfrage')
    })
  })

  it('haelt werkzeug_schema auch in der Ausfuehrung fern, nicht nur im Praefix', async () => {
    // Sonst waere die Werkzeugliste keine Aussage mehr darueber, was ausgefuehrt wird: `fuehreAus`
    // faengt `werkzeug_schema` ueber den **Namen** ab, und ein Name ist keine Grenze. Dasselbe
    // Muster und derselbe Grund wie bei `recherchieren` und `faehigkeit_lesen`.
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [
          ruft('werkzeug_schema', { name: WEB_SUCHEN_NAME }, 'x1'),
          sagt('## Befund\n\nNichts.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ev = lesen(u.db, unterId)
      expect(ev.some(e => e.art === 'tool.schema_loaded')).toBe(false)
      const f = ev.find(e => e.art === 'tool.failed' && e.nutzlast.aufrufId === 'x1')
      expect(String(f?.nutzlast.meldung)).toContain('kein Werkzeug')
    })
  })

  it('laesst den Hauptlauf beim aufgeschobenen Laden', async () => {
    // Die Gegenprobe: die Umstellung gilt dem Unterlauf, nicht der Faehigkeitszeile des Modells.
    await mitWurzel(async (w) => {
      const u = umgebung(w, { haupt: [sagt('fertig')], unter: [] })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const werkzeuge = (lesen(u.db, hauptId).find(e => e.art === 'run.started')?.nutzlast.werkzeuge ?? []) as string[]
      expect(werkzeuge).toContain('werkzeug_schema')
    })
  })
})

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

  it('verbraucht kein Netzbudget fuer einen Aufruf, der nie hinausging', async () => {
    // Der teuerste Befund aus M12 (2026-08-22, zehn echte Recherchen): das Modell rief
    // `web_suchen` mit `{}` auf und `seite_lesen` mit `"max_zeichen": "30000"`. Beides wird an
    // der Eingabepruefung abgewiesen, bevor irgendetwas aufgeloest oder abgerufen wird — und
    // beides verbrauchte trotzdem einen Platz, weil gezaehlt wurde, was das Modell *versuchte*,
    // statt was hinausging. In vier von zehn Laeufen wurde dadurch keine einzige Seite gelesen.
    await mitWurzel(async (w) => {
      const erreicht: string[] = []
      const u = umgebung(w, {
        erreicht,
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X', anzahl: 3 }, 's1'),
          // Zwei Fehlaufrufe **in einem Zug**: einer ohne Pflichtfeld, einer mit unlesbarem Wert.
          // Beide sterben in der Eingabepruefung des Werkzeugs, keiner beruehrt das Netz — und
          // dass sie in einem Zug stehen, ist die Form, in der das Modell sie wirklich schickt.
          ruftMehrfach([
            [SEITE_LESEN_NAME, {}, 'p0'],
            [SEITE_LESEN_NAME, { url: TREFFER[0].url, max_zeichen: 'viel' }, 'p0b'],
          ]),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[1].url }, 'p2'),
          sagt('## Befund\n\nZwei Seiten gelesen.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ev = lesen(u.db, unterId)

      // Beide echten Seiten wurden geholt — gemessen am Abrufer, nicht am Protokoll.
      expect(erreicht).toEqual([TREFFER[0].url, TREFFER[1].url])
      // Und die Fehlaufrufe wurden benannt abgewiesen, nicht still verschluckt.
      for (const id of ['p0', 'p0b']) {
        const f = ev.find(e => e.art === 'tool.failed' && e.nutzlast.aufrufId === id)
        expect(String(f?.nutzlast.meldung)).not.toContain('Seitenbudget')
      }
    })
  })

  it('verbraucht sehr wohl einen Platz fuer einen Abruf, der hinausging und dann scheiterte', async () => {
    // Die Gegenrichtung, und sie ist die sicherheitsrelevante: eine Anfrage, die das Haus
    // verlassen hat, ist bezahlt — sonst waere ein Ziel, das zuverlaessig 500 antwortet, ein
    // unbegrenzter Kanal nach draussen. Gezaehlt wird deshalb `netz.ausgehend`, nicht der Erfolg.
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
          sagt('## Befund\n\nGenug.'),
        ],
      })
      // Ein Abrufer, der jede Seite mit 500 beantwortet: sie geht hinaus und liefert nichts.
      u.netz = { ...u.netz!, abrufen: async ({ url }) => { erreicht.push(url); return new Response('weg', { status: 500 }) } }
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ev = lesen(u.db, unterId)

      expect(erreicht).toEqual([TREFFER[0].url, TREFFER[1].url])
      const abgelehnt = ev.find(e => e.art === 'tool.failed' && e.nutzlast.aufrufId === 'p3')
      expect(String(abgelehnt?.nutzlast.meldung)).toContain('Seitenbudget')
    })
  })

  it('schreibt die aufrufId an jede ausgehende Anfrage', async () => {
    // Ohne sie laesst sich nicht sagen, welcher Werkzeugaufruf welche Anfrage erzeugt hat — und
    // genau darauf ruht die Budgetzaehlung oben.
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X', anzahl: 3 }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          sagt('## Befund\n\nEine Seite.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const raus = lesen(u.db, unterId).filter(e => e.art === 'netz.ausgehend')
      expect(raus.length).toBeGreaterThan(0)
      expect(raus.map(e => e.nutzlast.aufrufId)).toContain('p1')
      expect(raus.every(e => typeof e.nutzlast.aufrufId === 'string' && e.nutzlast.aufrufId !== ''))
        .toBe(true)
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
// 5. Die Quellenliste ist der zweite Weg ueber die Kapselung — und der ungekappte war offen
// ===============================================================================================

/** Ein Abrufer, der einer Tabelle von Weiterleitungen folgt und jede erreichte URL mitschreibt. */
function umleitenderAbrufer(kette: Record<string, string>, erreicht: string[]): Abrufer {
  return async ({ url }) => {
    erreicht.push(url)
    const ziel = kette[url]
    if (ziel !== undefined) {
      return new Response(null, { status: 302, headers: { location: ziel } })
    }
    return new Response(seite('Endseite', GEHEIM), {
      status: 200, headers: { 'content-type': 'text/html' },
    })
  }
}

const INJEKTION = 'INJEKTION-AUS-DER-SEITE'
/** Die Ziel-URL einer Weiterleitung waehlt der Betreiber der geholten Seite — beliebig lang. */
const LANGE_UMLEITUNG = `https://boeser-host.test/${'X'.repeat(4600)}${INJEKTION}`

describe('Die Quellenliste traegt fremdbestimmten Text (§4.1 (1))', () => {
  it('kappt die End-URL, statt 4.800 Zeichen Angreifertext in den Hauptlauf zu legen', async () => {
    await mitWurzel(async (w) => {
      const erreicht: string[] = []
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          sagt('## Befund\n\nX ist ein Y.'),
        ],
      })
      u.netz = { ...u.netz!, abrufen: umleitenderAbrufer({ [TREFFER[0].url]: LANGE_UMLEITUNG }, erreicht) }
      const hauptId = await starteLauf(AUFTRAG(w), u)

      // (a) Die Weiterleitung wurde wirklich gegangen — sonst misst der Rest nichts.
      expect(erreicht).toEqual([TREFFER[0].url, LANGE_UMLEITUNG])

      // (b) Der Angreifertext ist nirgends im Hauptlauf, weder im Verlauf noch in einem Ereignis.
      const hauptEreignisse = lesen(u.db, hauptId)
      expect(JSON.stringify(projiziere(hauptEreignisse))).not.toContain(INJEKTION)
      expect(JSON.stringify(hauptEreignisse)).not.toContain(INJEKTION)

      // (c) Die Quelle wird trotzdem genannt — gekappt, nicht weggelassen. Ein verschwiegener
      // Herkunftsort waere die andere schlechte Antwort auf denselben Befund.
      const ergebnis = hauptEreignisse
        .find(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'r1')
      const text = (ergebnis?.nutzlast.inhalt as { text: string }[])[0].text
      expect(text).toContain('https://boeser-host.test/')
      const quellzeile = text.split('## Quellen')[1].trim()
      expect(quellzeile.length).toBeLessThanOrEqual(MAX_QUELL_TITEL_ZEICHEN + MAX_QUELL_URL_ZEICHEN + 10)

      // (d) Und im Protokoll des Unterlaufs steht die volle URL weiter — §4.1 (4) bleibt heil.
      const [unterId] = unterlaufIds(u.db, hauptId)
      expect(JSON.stringify(lesen(u.db, unterId))).toContain(INJEKTION)
    })
  })

  it('kappt auch einen ueberlangen Titel an dieser Grenze', () => {
    // Ueber `baueRueckgabe` direkt, weil die Rueckgabe die Grenze ist — und nicht darauf ruhen
    // darf, dass werkzeug-netz.ts den Titel schon einmal gekappt hat.
    const quellen = quellenAusProtokoll([{
      laufId: 'u', seq: 1, ts: '2026-08-21T00:00:00.000Z', art: 'tool.completed',
      nutzlast: {
        aufrufId: 'p1', name: SEITE_LESEN_NAME,
        gelesen: { titel: `T${'i'.repeat(5000)}\nzweite Zeile`, url: LANGE_UMLEITUNG },
      },
    }])
    expect(quellen).toHaveLength(1)
    expect(quellen[0].titel.length).toBeLessThanOrEqual(MAX_QUELL_TITEL_ZEICHEN)
    expect(quellen[0].titel).not.toContain('\n')
    expect(quellen[0].url.length).toBeLessThanOrEqual(MAX_QUELL_URL_ZEICHEN)
    expect(quellen[0].url).not.toContain(INJEKTION)
  })
})

// ===============================================================================================
// 6. Jede ausgehende URL im Protokoll (§4.1 (4))
// ===============================================================================================

describe('Ausgehende URLs des Unterlaufs stehen vollstaendig im Protokoll', () => {
  it('schreibt jedes Zwischenziel einer Weiterleitungskette auf', async () => {
    await mitWurzel(async (w) => {
      const erreicht: string[] = []
      const eins = 'https://zwischenstation-eins.test/GEHEIM-HOP-EINS'
      const zwei = 'https://zwischenstation-zwei.test/GEHEIM-HOP-ZWEI'
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          sagt('## Befund\n\nX ist ein Y.'),
        ],
      })
      u.netz = {
        ...u.netz!,
        abrufen: umleitenderAbrufer({ [TREFFER[0].url]: eins, [eins]: zwei }, erreicht),
      }
      const hauptId = await starteLauf(AUFTRAG(w), u)

      // Beide Zwischenstationen wurden aufgeloest und abgerufen ...
      expect(erreicht).toEqual([TREFFER[0].url, eins, zwei])

      // ... und beide stehen im Protokoll. Gemessen ueber *alle* laufIds der Datenbank: vor dieser
      // Runde stand im Protokoll genau die angefragte URL und die letzte, kein Zwischenziel.
      const alleIds = [hauptId, ...unterlaufIds(u.db, hauptId)]
      const allesJson = JSON.stringify(alleIds.map(id => lesen(u.db, id)))
      expect(allesJson).toContain('GEHEIM-HOP-EINS')
      expect(allesJson).toContain('GEHEIM-HOP-ZWEI')

      // Und zwar als eigene Ereignisse im Protokoll des **Unterlaufs**, nicht des Hauptlaufs.
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ausgehend = lesen(u.db, unterId).filter(e => e.art === 'netz.ausgehend')
      expect(ausgehend.map(e => e.nutzlast.url)).toEqual([TREFFER[0].url, eins, zwei])
      expect(ausgehend.map(e => e.nutzlast.sprung)).toEqual([0, 1, 2])
      expect(lesen(u.db, hauptId).some(e => e.art === 'netz.ausgehend')).toBe(false)
    })
  })

  it('schreibt auch die Anfrage an den Suchdienst auf, nicht nur den Suchbegriff', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'), sagt('## Befund\n\nNichts.')],
      })
      // Der echte SearXNG-Anbieter, mit eingespeistem Abrufer — nur er kennt die Anfrage-URL.
      u.netz = {
        ...u.netz!,
        anbieter: new SearxngAnbieter('http://100.67.95.13:8080/'),
        suchAbrufer: (async () => new Response(JSON.stringify({ results: [] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
      }
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)
      const ausgehend = lesen(u.db, unterId).filter(e => e.art === 'netz.ausgehend')
      expect(ausgehend).toHaveLength(1)
      expect(String(ausgehend[0].nutzlast.url)).toContain('q=X')
      expect(ausgehend[0].nutzlast.werkzeug).toBe(WEB_SUCHEN_NAME)
    })
  })
})

// ===============================================================================================
// 7. Die Zahl der Unterlaeufe und ihr Verbrauch
// ===============================================================================================

/** Eine Modellantwort mit mehreren Werkzeugaufrufen — so, wie ein Zug sie wirklich schickt. */
const ruftViele = (name: string, eingaben: Record<string, unknown>[]): ModelAntwort => ({
  bloecke: eingaben.map((eingabe, i) => ({
    art: 'werkzeug-aufruf' as const, id: `v${i + 1}`, name, eingabe,
  })),
  stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

describe('Obergrenze fuer die Zahl der Recherchen eines Laufs', () => {
  it('faehrt aus acht Aufrufen eines Zuges genau MAX_RECHERCHEN_JE_LAUF Unterlaeufe', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [
          ruftViele(RECHERCHIEREN_NAME, Array.from({ length: 8 }, (_, i) => ({ frage: `Frage ${i}` }))),
          sagt('fertig'),
        ],
        unter: Array.from({ length: MAX_RECHERCHEN_JE_LAUF }, () => sagt('## Befund\n\nEtwas.')),
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)

      // Gemessen an den Laeufen in der Datenbank, nicht an einer Meldung: acht Aufrufe erzeugten
      // vorher acht nebenlaeufige Unterlaeufe, jeder mit eigenem Runden-, Zeit-, Such- und
      // Seitenbudget.
      expect(unterlaufIds(u.db, hauptId)).toHaveLength(MAX_RECHERCHEN_JE_LAUF)

      const abgelehnt = lesen(u.db, hauptId).filter(e => e.art === 'tool.failed')
      expect(abgelehnt).toHaveLength(8 - MAX_RECHERCHEN_JE_LAUF)
      expect(String(abgelehnt[0].nutzlast.meldung)).toContain(String(MAX_RECHERCHEN_JE_LAUF))
      expect(String(abgelehnt[0].nutzlast.meldung)).toContain('Recherchen')
    })
  })

  it('rechnet den Verbrauch des Unterlaufs dem Kostenbudget des Elternlaufs an', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [sagt('## Befund\n\nEtwas.')],
      })
      // Ein Modell aus der echten Preistabelle — sonst kostet jeder Zug 0 und der Test misst
      // die Arithmetik nicht, sondern nur eine fehlende Tabellenzeile.
      const auftrag = { ...AUFTRAG(w), modellId: 'openrouter-qwen3-coder' }
      const hauptId = await starteLauf(auftrag, u)
      const hauptEreignisse = lesen(u.db, hauptId)

      const angeschrieben = hauptEreignisse.filter(e => e.art === 'unterlauf.verbraucht')
      expect(angeschrieben).toHaveLength(1)
      expect(angeschrieben[0].nutzlast.runden).toBe(1)
      expect(Number(angeschrieben[0].nutzlast.kostenCent)).toBeGreaterThan(0)

      // Ein Zug kostet (100 * 22 + 10 * 180) / 1e6 Cent. Der Hauptlauf hatte zwei, der Unterlauf
      // einen — und alle drei muessen im Verbrauch des Hauptlaufs stehen.
      const jeZug = (100 * 22 + 10 * 180) / 1_000_000
      const v = verbrauchAusEreignissen(hauptEreignisse, 'openrouter-qwen3-coder', 0)
      expect(v.runden).toBe(2)
      expect(v.kostenCent).toBeCloseTo(3 * jeZug, 12)
    })
  })
})

// ===============================================================================================
// 8. Der Systemtext sagt, was wirklich gilt
// ===============================================================================================

describe('Systemtext des Unterlaufs', () => {
  it('behauptet keine Grenze, die die Registry nicht zieht', () => {
    // `faehigkeit_lesen` steht in der Registry des Unterlaufs (Nachtrag) und liefert lokale
    // Dateiinhalte — die Rumpfe aus `.claude/`. Solange das so ist, darf der Systemtext nicht
    // „kein Dateisystem" sagen: ein Modell, das dem Satz glaubt, haelt einen Skill-Rumpf fuer
    // etwas anderes als das, was er ist.
    const hatFaehigkeitLesen = unterlaufRegistry('kurz').finde(FAEHIGKEIT_WERKZEUG_NAME) !== null
    expect(hatFaehigkeitLesen).toBe(true)
    expect(SYSTEMTEXT).not.toContain('kein Dateisystem')
    expect(SYSTEMTEXT).toContain('Hausregeln')
  })
})

// ===============================================================================================
// 9. Ein Unterlauf wird nicht fortgesetzt
// ===============================================================================================

describe('Der Fortsetzen-Pfad erkennt einen Unterlauf (harness-handlers)', () => {
  it('lehnt genau das Protokoll ab, das die echte Schleife geschrieben hat', async () => {
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?', tiefe: 'kurz' }, 'r1'), sagt('fertig')],
        unter: [
          ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'),
          ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
          sagt('## Befund\n\nX ist ein Y.'),
        ],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const [unterId] = unterlaufIds(u.db, hauptId)

      // Der Unterlauf traegt den rohen Seiteninhalt im Verlauf — genau der Lauf, der die
      // Werkzeuge des Hauptlaufs nie daneben sehen darf.
      expect(JSON.stringify(projiziere(lesen(u.db, unterId)))).toContain(GEHEIM)

      const abgelehnt = pruefeKeinUnterlauf(unterId, lesen(u.db, unterId))
      expect(abgelehnt.ok).toBe(false)
      if (!abgelehnt.ok) expect(abgelehnt.meldung).toContain('Unterlauf')

      // Und der Hauptlauf bleibt fortsetzbar — sonst waere die Regel nur eine Absage an alles.
      expect(pruefeKeinUnterlauf(hauptId, lesen(u.db, hauptId))).toEqual({ ok: true })

      // In der Liste des Fensters sind die beiden jetzt zu unterscheiden.
      const uebersicht = laufUebersicht(u.db)
      expect(uebersicht.find(l => l.laufId === unterId)?.istUnterlauf).toBe(true)
      expect(uebersicht.find(l => l.laufId === hauptId)?.istUnterlauf).toBe(false)
    })
  })
})

// ===============================================================================================
// 10. Absagen ohne Unterlauf
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

// ===============================================================================================
// Das Modell des Unterlaufs — eigener Zuordnungsplatz statt Erbschaft vom Hauptlauf
// ===============================================================================================

/**
 * Ein zweiter Eintrag, unterscheidbar vom Hauptlauf-Eintrag: eigene Id, eigener Codec-Weg,
 * eigenes Kontextfenster. Er ist local-http, weil das der Fall ist, um den es geht — der
 * Rechercheur soll auf die billige lokale Ebene koennen, waehrend der Hauptlauf woanders faehrt.
 */
const RECHERCHEUR_EINTRAG: ModellEintrag = {
  ...EINTRAG,
  id: 'rechercheur-modell',
  name: 'Rechercheur-Modell',
  art: 'local-http',
  erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11434, model: 'klein' },
  oertlichkeit: 'eigenes-netz',
}

describe('Das Modell des Rechercheur-Unterlaufs (rolle:rechercheur)', () => {
  it('faehrt den zugewiesenen Eintrag statt den des Hauptlaufs', async () => {
    await mitWurzel(async (w) => {
      const gefahren: string[] = []
      const unter = [sagt('## Befund\n\nnichts Besonderes.')]
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [],
        rechercheurModell: {
          eintrag: RECHERCHEUR_EINTRAG,
          sende: async () => {
            gefahren.push(RECHERCHEUR_EINTRAG.id)
            const a = unter.shift()
            if (!a) throw new Error('keine Antwort mehr fuer den Unterlauf')
            return a
          },
        },
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)

      // (a) Der Transport des Zuordnungsplatzes hat gefahren, nicht der des Hauptlaufs. Ohne das
      // waere der Rest Buchhaltung: die modellId im Protokoll koennte richtig stehen, waehrend
      // die Anfrage an den Endpunkt des Hauptlaufs ginge.
      expect(gefahren).toEqual([RECHERCHEUR_EINTRAG.id])

      // (b) Und sie steht auch im Protokoll — daran haengt die Verrechnung des Unterlaufs.
      const unterIds = unterlaufIds(u.db, hauptId)
      expect(unterIds).toHaveLength(1)
      const gestartet = lesen(u.db, unterIds[0]).find(e => e.art === 'run.started')
      expect(gestartet?.nutzlast.modellId).toBe(RECHERCHEUR_EINTRAG.id)
    })
  })

  it('faellt ohne Zuordnung auf das Modell des Hauptlaufs zurueck', async () => {
    // Der Rueckfall ist die Vorgabe: eine Konfiguration ohne diesen Platz verhaelt sich genau
    // wie vorher.
    await mitWurzel(async (w) => {
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [sagt('## Befund\n\nnichts Besonderes.')],
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const unterIds = unterlaufIds(u.db, hauptId)
      const gestartet = lesen(u.db, unterIds[0]).find(e => e.art === 'run.started')
      expect(gestartet?.nutzlast.modellId).toBe(EINTRAG.id)
    })
  })

  it('rechnet den Verbrauch des Unterlaufs unter dessen eigenem Modell ab', async () => {
    // `verbrauchAusEreignissen` schlaegt den Preis ueber die modellId nach. Bliebe dort die des
    // Hauptlaufs stehen, liefe ein Unterlauf zum Preis eines fremden Modells — und das
    // Kostenbudget des Hauptlaufs pruefte gegen eine Zahl, die niemandem gehoert.
    //
    // Messbar gemacht ueber die Preistabelle: `test-modell` (Hauptlauf) steht nicht darin und
    // kostet 0, `openrouter-qwen3-coder` schon. Die Zuordnung ist hier also absichtlich das
    // *teurere* Modell — sonst waere der Test auch dann gruen, wenn die modellId gar nicht
    // durchschlaegt.
    await mitWurzel(async (w) => {
      const unter = [sagt('## Befund\n\nnichts Besonderes.')]
      const u = umgebung(w, {
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [],
        rechercheurModell: {
          eintrag: { ...RECHERCHEUR_EINTRAG, id: 'openrouter-qwen3-coder' },
          sende: async () => {
            const a = unter.shift()
            if (!a) throw new Error('keine Antwort mehr fuer den Unterlauf')
            return a
          },
        },
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      const unterIds = unterlaufIds(u.db, hauptId)
      const eigener = verbrauchAusEreignissen(lesen(u.db, unterIds[0]), 'openrouter-qwen3-coder', 0)
      expect(eigener.kostenCent).toBeGreaterThan(0)
      const angeschrieben = lesen(u.db, hauptId).find(e => e.art === 'unterlauf.verbraucht')
      expect(angeschrieben?.nutzlast.kostenCent).toBeCloseTo(eigener.kostenCent, 6)
    })
  })

  it('gibt dem Unterlauf trotz eigenem Modell dieselbe Registry und denselben Modus', async () => {
    // Der Zuordnungsplatz aendert das Modell, nicht die Kapselung. Wer beides in einem Zug
    // umbaut, verliert leicht das eine ueber dem anderen.
    await mitWurzel(async (w) => {
      const erreicht: string[] = []
      const unter = [
        ruft(WEB_SUCHEN_NAME, { anfrage: 'X' }, 's1'),
        ruft(SEITE_LESEN_NAME, { url: TREFFER[0].url }, 'p1'),
        sagt('## Befund\n\nX ist ein Y.'),
      ]
      const u = umgebung(w, {
        erreicht,
        haupt: [ruft(RECHERCHIEREN_NAME, { frage: 'Was ist X?' }, 'r1'), sagt('fertig')],
        unter: [],
        rechercheurModell: {
          eintrag: RECHERCHEUR_EINTRAG,
          sende: async () => {
            const a = unter.shift()
            if (!a) throw new Error('keine Antwort mehr fuer den Unterlauf')
            return a
          },
        },
      })
      const hauptId = await starteLauf(AUFTRAG(w), u)
      // `forum.beispiel.test` steht nicht auf der Positivliste des Hauptlaufs: der Abruf belegt
      // den Modus 'offen'.
      expect(erreicht).toEqual([TREFFER[0].url])
      expect(JSON.stringify(lesen(u.db, hauptId))).not.toContain(GEHEIM)
    })
  })
})
