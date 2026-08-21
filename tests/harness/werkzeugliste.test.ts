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
import { WerkzeugRegistry, META_WERKZEUG_NAME } from '../../src/main/harness/werkzeuge'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import { GRAPH_WERKZEUGE } from '../../src/main/harness/werkzeug-graph'
import { faehigkeitLesenWerkzeug } from '../../src/main/harness/faehigkeiten'
import { normaliseEintrag } from '../../src/main/model/entry'

/** Genau die Zusammenstellung aus harness-handlers.ts. */
function ausgelieferteRegistry(): WerkzeugRegistry {
  return new WerkzeugRegistry([...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE, faehigkeitLesenWerkzeug])
}

describe('die ausgelieferte Werkzeugliste', () => {
  it('traegt genau diese Namen', () => {
    const namen = ausgelieferteRegistry().stummel(false).map(s => s.name).sort()
    // Woertlich, nicht als Anzahl: ein umbenanntes Werkzeug ist eine Aenderung am stabilen
    // Praefix und damit am Zwischenspeicher des Anbieters. Das soll auffallen.
    expect(namen).toEqual([
      'datei_lesen',
      'faehigkeit_lesen',
      'graph_abfragen',
      'graph_ausweiten',
      'graph_knoten_holen',
      'graph_suchen',
      'inhalt_suchen',
      'verzeichnis_listen',
    ])
  })

  it('kommt mit aufgeschobenem Laden auf 9 Stummel — das Meta-Werkzeug zaehlt mit', () => {
    const mitMeta = ausgelieferteRegistry().stummel(true).map(s => s.name)
    expect(mitMeta).toContain(META_WERKZEUG_NAME)
    expect(mitMeta).toHaveLength(9)
  })

  /**
   * Der eigentliche Punkt dieses Tests. Er verbindet zwei Zahlen, die in verschiedenen Dateien
   * stehen und bisher unabhaengig voneinander wandern konnten.
   */
  it('bleibt unter der Vorgabe-Obergrenze, auch mit aufgeschobenem Laden', () => {
    const eintrag = normaliseEintrag({
      id: 'probe', name: 'Probe', art: 'local-http',
      erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11434, model: 'egal' },
      oertlichkeit: 'lokal',
      // Bewusst *ohne* werkzeugObergrenze: der Rueckfall soll geprueft werden, nicht ein Wert,
      // den dieser Test selbst setzt.
      faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', aufgeschobenesLaden: true },
    })
    const anzahl = ausgelieferteRegistry().stummel(true).length
    expect(anzahl).toBeLessThanOrEqual(eintrag.faehigkeiten!.werkzeugObergrenze)
  })
})
