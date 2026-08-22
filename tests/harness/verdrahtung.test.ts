/**
 * Der Wächter gegen totes Werkzeug: was gebaut wurde, muss von der App aus erreichbar sein.
 *
 * Die Abschlusspruefung dieses Zweigs fand die gesamte Netz-Haelfte **unverdrahtet**. netzwache,
 * Suchanbieter, Seitenextraktion, `web_suchen`, `seite_lesen` und der gekapselte Rechercheur waren
 * gebaut, getestet und exportiert — und von keinem Modul unter `src/main` importiert. 2617 Tests
 * waren gruen. Dieses Repo hatte denselben Ausgang schon einmal: ein Grid-Fenster, das kein Knopf,
 * kein Menue und kein Kuerzel oeffnen konnte, waehrend jede IPC-gefuehrte Pruefung bestand.
 *
 * Ein Unit-Test ueber ein Werkzeug beweist, dass es tut was es tut. Er beweist nicht, dass es
 * jemand aufruft. Genau diese Luecke schliesst diese Datei — und zwar so, dass sie auch das
 * naechste Werkzeug faengt: geprueft wird gegen die Registry, die `harness-handlers.ts`
 * tatsaechlich baut, nicht gegen eine im Test nachgebaute Liste. Ein nachgebauter Aufruf haette
 * den Befund nicht gefunden (tests/harness/werkzeugliste.test.ts baut nach und war gruen).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// electron und better-sqlite3 werden von harness-handlers.ts geladen, aber fuer diesen Test nicht
// gebraucht. Nur so weit ersetzt, dass der Import durchgeht — nichts davon wird aufgerufen.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp/keel-test', getAppPath: () => '/tmp/keel-test' },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
}))

// Der Schluesselbund der Maschine wird **nicht** befragt. Ohne diese Ersetzung las der Test den
// echten Bund, und sobald jemand dort einen Tavily-Schluessel hinterlegte, kippte er von gruen
// nach rot — ohne dass sich eine Zeile Code geaendert haette. Ein Test, dessen Farbe an der
// Maschine haengt, sagt ueber den Code nichts.
const schluesselStand = { tavily: null as string | null, brave: null as string | null }
vi.mock('../../src/main/worker/api-keys', async (echt) => ({
  ...(await echt<typeof import('../../src/main/worker/api-keys')>()),
  resolveApiKey: async (ref: string) =>
    schluesselStand[ref as keyof typeof schluesselStand] ?? null,
}))

beforeEach(() => {
  vi.resetModules()
  schluesselStand.tavily = null
  schluesselStand.brave = null
})

describe('Verdrahtung: gebaute Werkzeuge sind vom Lauf aus erreichbar', () => {
  it('haelt jedes exportierte Werkzeug in der Registry des Laufs', async () => {
    const { baueWerkzeugRegistry } = await import('../../src/main/harness-handlers')
    const namen = baueWerkzeugRegistry().stummel(true).map(s => s.name).sort()

    // Woertlich, nicht als Anzahl. Ein Name, der hier fehlt, ist ein Werkzeug, das das Modell
    // nie sieht — und das faellt sonst niemandem auf, weil sein eigener Test gruen bleibt.
    expect(namen).toEqual([
      'datei_lesen',
      'faehigkeit_lesen',
      'graph_abfragen',
      'graph_ausweiten',
      'graph_knoten_holen',
      'graph_suchen',
      'inhalt_suchen',
      'recherchieren',
      'seite_lesen',
      'verzeichnis_listen',
      'web_suchen',
      'werkzeug_schema',
    ])
  })

  /**
   * Die Registry allein genuegt nicht: ohne Netzkontext antworten die drei Netz-Werkzeuge nur,
   * dass nichts eingerichtet ist. Dass der *Kontext* gebaut wird, ist die zweite Haelfte der
   * Verdrahtung — und die war es, die fehlte.
   */
  it('baut einen Netzkontext, sobald ein Suchanbieter konfiguriert ist', async () => {
    schluesselStand.tavily = 'tvly-probe-nicht-echt'
    try {
      const { baueNetzKontext } = await import('../../src/main/harness-netz')
      const netz = await baueNetzKontext()
      expect(netz).toBeDefined()
      expect(netz!.modus).toBe('whitelist')
      expect(netz!.positivliste.length).toBeGreaterThan(0)
      // Der Abrufer muss der aus der netzwache sein, nicht das nackte `fetch` — sonst geht die
      // Verbindung ueber den Namen statt ueber die gepruefte Adresse.
      expect(typeof netz!.abrufen).toBe('function')
      expect(typeof netz!.aufloesen).toBe('function')
    } finally {
      schluesselStand.tavily = null
    }
  })

  it('gibt ohne Suchanbieter keinen Netzkontext zurueck, statt einen halben zu bauen', async () => {
    const { baueNetzKontext } = await import('../../src/main/harness-netz')
    // Ohne Anbieter ist `undefined` die ehrliche Antwort: die Werkzeuge stehen weiter im Praefix
    // (sonst bewegte er sich zwischen Laeufen), melden aber benannt, dass nichts eingerichtet ist.
    await expect(baueNetzKontext()).resolves.toBeUndefined()
  })

  it('haelt GitHub bewusst von der Positivliste fern', async () => {
    const { VORGABE_POSITIVLISTE } = await import('../../src/main/harness/werkzeug-netz')
    // Der Nachtrag vom 2026-08-21: GitHub und Aehnliches laeuft ueber den gekapselten
    // Rechercheur, nicht ueber den direkten Weg im Hauptlauf. Steht es hier, ist die
    // Zweiteilung aufgehoben, ohne dass jemand es entschieden hat.
    expect(VORGABE_POSITIVLISTE.some(h => h.includes('github'))).toBe(false)
    expect(VORGABE_POSITIVLISTE).toContain('developer.mozilla.org')
  })
})
