/**
 * Die ausgelieferte Werkzeugliste, festgenagelt.
 *
 * Aus der Abschlusspruefung des Zweigs `qwen38-niveau-c`: mit `faehigkeit_lesen` ist die Liste von
 * 8 auf 9 Stummel gewachsen, und der Rueckfallwert `werkzeugObergrenze` stand weiter auf 8. Ein
 * Eintrag mit aufgeschobenem Laden haette damit bei *jedem* Lauf einen Hinweis in `run.started`
 * geschrieben. Eine Warnung, die bei der Vorgabekonfiguration immer anschlaegt, nutzt sich ab.
 *
 * Vor diesem Test gab es keinen, der die zusammengesetzte Liste festhielt — nur den Graph-Waechter
 * fuer die vier Graph-Namen. Die Zahl 9 stand nirgends, und die Obergrenzen-Entscheidung auch
 * nicht. Hier stehen beide, und sie fallen zusammen auf, wenn jemand ein Werkzeug hinzufuegt,
 * ohne die Obergrenze zu bedenken.
 */

import { describe, it, expect } from 'vitest'
import { META_WERKZEUG_NAME } from '../../src/main/harness/werkzeuge'
import { normaliseEintrag } from '../../src/main/model/entry'
import { vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp/keel-test', getAppPath: () => '/tmp/keel-test' },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
}))

/**
 * **Nicht** nachgebaut, sondern die echte Konstruktion aus harness-handlers.ts. Der Nachbau war
 * hier der Fehler: er blieb gruen, waehrend die halbe Werkzeugliste gar nicht verdrahtet war
 * (siehe tests/harness/verdrahtung.test.ts).
 */
async function ausgelieferteRegistry() {
  const { baueWerkzeugRegistry } = await import('../../src/main/harness-handlers')
  return baueWerkzeugRegistry()
}

describe('die ausgelieferte Werkzeugliste', () => {
  it('traegt genau diese Namen', async () => {
    const namen = (await ausgelieferteRegistry()).stummel(false).map(s => s.name).sort()
    // Woertlich, nicht als Anzahl: ein umbenanntes Werkzeug ist eine Aenderung am stabilen
    // Praefix und damit am Zwischenspeicher des Anbieters. Das soll auffallen.
    expect(namen).toEqual([
      'datei_lesen',
      'datei_loeschen',
      'datei_schreiben',
      'faehigkeit_lesen',
      'graph_abfragen',
      'graph_ausweiten',
      'graph_knoten_holen',
      'graph_suchen',
      'inhalt_suchen',
      'recherchieren',
      'seite_lesen',
      'shell_ausfuehren',
      'verzeichnis_listen',
      'web_suchen',
    ])
  })

  it('kommt mit aufgeschobenem Laden auf 15 Stummel — das Meta-Werkzeug zaehlt mit', async () => {
    const mitMeta = (await ausgelieferteRegistry()).stummel(true).map(s => s.name)
    expect(mitMeta).toContain(META_WERKZEUG_NAME)
    expect(mitMeta).toHaveLength(15)
  })

  /**
   * Paket C: der Sandkasten, die beiden Schreibwerkzeuge und das Tor waren gebaut, getestet und
   * exportiert — und von der Registry des Laufs aus nicht erreichbar. Genau der Ausgang, den
   * tests/harness/verdrahtung.test.ts fuer die Netz-Haelfte schon einmal gefunden hat.
   *
   * Geprueft wird ueber `alle()` und nicht ueber `stummel()`: `alle()` ist die Liste, die
   * `starteLauf` nach `istWirkend` absucht, um die Git-Vorbedingung zu ziehen (lauf.ts). Fehlen
   * die drei dort, faellt nicht nur das Werkzeug aus — die Vorbedingung greift auch nicht mehr.
   */
  it('traegt die drei wirkenden Werkzeuge in der echten Registry', async () => {
    const namen = (await ausgelieferteRegistry()).alle().map(w => w.name)
    expect(namen).toContain('datei_schreiben')
    expect(namen).toContain('datei_loeschen')
    expect(namen).toContain('shell_ausfuehren')
  })

  /**
   * Kein ausgelieferter Rumpf darf behaupten, er koenne nicht schreiben, solange die Registry ein
   * wirkendes Werkzeug traegt.
   *
   * Zweimal passiert, und beim zweiten Mal war es dieselbe Behauptung an einer anderen Stelle:
   * `ka-body.md` sagte „Du kannst nichts schreiben" (ein echter Beweislauf fand es, das Modell
   * verweigerte daraufhin einen Schreibauftrag), und die Vorgabe `BODY` in
   * harness-praefix-quelle.ts sagte woertlich dasselbe weiter, weil die erste Fundstelle ohne
   * Suche nach Geschwistern behoben wurde. Ein Waechter, der nur die bekannte Kopie deckt,
   * wiederholt genau diesen Fehler — deshalb liest dieser hier **jede** `*-body.md` der
   * Preset-Ebene dazu und nicht die eine, um die es ging.
   *
   * Die Bedingung ist an die echte Registry gehaengt und nicht als absolutes Verbot geschrieben:
   * schneidet jemand die Registry eines Tages je Lauf zu (Entwurf §7), ist „Du kannst nichts
   * schreiben" fuer eine rein lesende Zusammenstellung wieder die Wahrheit, und dann soll dieser
   * Test nicht im Weg stehen, sondern seine Voraussetzung verlieren.
   */
  it('laesst keinen Rumpf behaupten, er koenne nicht schreiben', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { istWirkend } = await import('../../src/main/harness/tor')
    const { BODY } = await import('../../src/main/harness-praefix-quelle')

    const namen = (await ausgelieferteRegistry()).alle().map(w => w.name)
    expect(namen.some(istWirkend), 'ohne wirkendes Werkzeug prueft dieser Waechter nichts').toBe(true)

    const presetVerzeichnis = new URL('../../src/main/preset/', import.meta.url).pathname
    const koerper: Array<{ quelle: string; text: string }> = [
      { quelle: 'harness-praefix-quelle.ts BODY', text: BODY },
    ]
    for (const eintrag of readdirSync(presetVerzeichnis, { withFileTypes: true })) {
      if (!eintrag.isDirectory()) continue
      const ordner = join(presetVerzeichnis, eintrag.name)
      for (const datei of readdirSync(ordner)) {
        if (!datei.endsWith('-body.md')) continue
        koerper.push({ quelle: datei, text: readFileSync(join(ordner, datei), 'utf8') })
      }
    }
    // Mindestens die Vorgabe und ein Preset-Rumpf — findet der Leser oben nichts mehr, prueft der
    // Waechter still nur noch eine Zeichenkette.
    expect(koerper.length).toBeGreaterThan(1)

    // Absichtlich grob: es geht um die Aussage „ich kann das nicht", in jeder Schreibweise, mit
    // und ohne Umlaut. Ein Rumpf, der die Grenze *benennt* („nur innerhalb der Projektwurzel"),
    // faellt nicht darunter — verboten ist die Leugnung, nicht die Einschraenkung.
    // Bis zu zwei Woerter dazwischen, weil „keine Dateien schreiben" und „nichts im Projekt
    // ausfuehren" dieselbe Aussage sind wie „nichts schreiben" — eine Fassung ohne diesen Spalt
    // liess die zweite Formulierung durch, gegen eine Mutation geprueft. Der Spalt endet aber an
    // jedem Satz- und Zeilenende: „…nicht lohnt. Ausfuehren…" in workshop-body.md sind zwei
    // Saetze und war der erste Fehlalarm dieser Fassung.
    const leugnung =
      /\b(nichts|nicht|keine[nrs]?)([ \t]+[^\s.,;:!?]+){0,2}[ \t]+(zu[ \t]+)?(schreiben|ausfuehren|ausführen|loeschen|löschen)\b/i
    for (const k of koerper) {
      const treffer = leugnung.exec(k.text)
      expect(
        treffer?.[0],
        `${k.quelle} behauptet "${treffer?.[0]}", waehrend die Registry ` +
        `${namen.filter(istWirkend).join(', ')} traegt`,
      ).toBeUndefined()
    }
  })

  /**
   * Der eigentliche Punkt dieses Tests. Er verbindet zwei Zahlen, die in verschiedenen Dateien
   * stehen und bisher unabhaengig voneinander wandern konnten.
   */
  it('bleibt unter der Vorgabe-Obergrenze, auch mit aufgeschobenem Laden', async () => {
    const eintrag = normaliseEintrag({
      id: 'probe', name: 'Probe', art: 'local-http',
      erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11434, model: 'egal' },
      oertlichkeit: 'lokal',
      // Bewusst *ohne* werkzeugObergrenze: der Rueckfall soll geprueft werden, nicht ein Wert,
      // den dieser Test selbst setzt.
      faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', aufgeschobenesLaden: true },
    })
    const anzahl = (await ausgelieferteRegistry()).stummel(true).length
    expect(anzahl).toBeLessThanOrEqual(eintrag.faehigkeiten!.werkzeugObergrenze)
  })
})
