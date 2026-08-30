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
 *
 * Gegenproben zum Zuordnungsplatz des Rechercheurs (2026-08-22), beide ausgefuehrt und rot
 * gesehen:
 *   - `rechercheurModell: rechercheurModell()` aus `baueLaufUmgebung` entfernt: 1 rot. Genau der
 *     Ausgang, um den es hier geht — die Aufloesung funktionierte weiter, nur benutzte sie
 *     niemand, und alle Tests des Unterlaufs blieben gruen.
 *   - Die Sperre gegen einen cli-harness-Eintrag ausgehebelt: 1 rot. Das Settings-Fenster
 *     verspricht dort „Es gilt der Rueckfall"; ohne die Sperre wuerfe stattdessen `starteLauf`
 *     mitten im Werkzeugaufruf des Hauptlaufs.
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
      'werkzeug_schema',
    ])
  })

  /**
   * Die zweite Haelfte, wie beim Netzkontext: die Registry allein genuegt nicht.
   * `shell_ausfuehren` antwortet ohne `ktx.sandkasten` auf **jeden** Aufruf „Fuer diesen Lauf ist
   * kein Sandkasten eingerichtet" — ein verdrahtetes, nutzloses Werkzeug, und jeder Test darunter
   * bliebe gruen. Gebaut wird der Kontext in `baueLaufUmgebung`, und die ist von hier aus nicht
   * aufrufbar (echte `harness.db`, echtes better-sqlite3-Binding), also wird derselbe Rumpf
   * gelesen wie beim Rechercheur-Modell darunter. Grob, und der einzige Test, der diesen Ausgang
   * faengt.
   */
  it('setzt einen Sandkastenkontext in die LaufUmgebung ein', async () => {
    const { readFileSync } = await import('node:fs')
    const quelle = readFileSync(
      new URL('../../src/main/harness-sitzung.ts', import.meta.url), 'utf8')
    const beginn = quelle.indexOf('async function baueLaufUmgebung(')
    expect(beginn, 'baueLaufUmgebung wurde umbenannt — dieser Test muss mit').toBeGreaterThan(0)
    const ende = quelle.indexOf('\n}', beginn)
    const rumpf = quelle.slice(beginn, ende)
    expect(rumpf, 'baueLaufUmgebung baut keinen Sandkastenkontext — `shell_ausfuehren` steht dann ' +
      'in der Registry und lehnt jeden Aufruf ab')
      .toContain('baueSandkastenKontext(wurzel)')

    // Und er muss auch **ankommen**: gebaut und nicht eingesetzt waere genau der Ausgang, um den
    // es in dieser Datei geht. `wache` bekommt dasselbe Objekt, weil SandkastenKontext den
    // WacheKontext erweitert — Argumentpruefung und Prozessgrenze reden so ueber ein Verzeichnis.
    expect(rumpf).toMatch(/^\s*sandkasten,$/m)
    expect(rumpf).toMatch(/^\s*wache: sandkasten,$/m)
  })

  /**
   * Der Kontext muss die Pfade tragen, ueber die das Profil seine Verbote schreibt. Ein leeres
   * `zwischenspeicher` waere kein Fehler, den irgendetwas anzeigt — `npm ci` schluege dann fehl
   * und saehe aus wie ein Netzproblem.
   */
  it('gibt dem Sandkastenkontext absolute Zwischenspeicherpfade und ein tmpdir', async () => {
    const { baueSandkastenKontext } = await import('../../src/main/harness-sitzung')
    const { STANDARD_ZWISCHENSPEICHER } = await import('../../src/main/harness/sandkasten')
    const { homedir, tmpdir } = await import('node:os')
    const k = baueSandkastenKontext('/tmp/keel-probe-wurzel')

    expect(k.wurzel).toBe('/tmp/keel-probe-wurzel')
    expect(k.heim).toBe(homedir())
    // Der electron-Ersatz oben gibt diesen Pfad aus — geprueft wird, dass `app.getPath` gefragt
    // wurde und nicht etwa `wurzel` ein zweites Mal.
    expect(k.userDataPfad).toBe('/tmp/keel-test')
    expect(k.tmpdir).toBe(tmpdir())
    expect(k.zwischenspeicher).toHaveLength(STANDARD_ZWISCHENSPEICHER.length)
    expect(k.zwischenspeicher).toContain(`${homedir()}/.npm`)
    // Absolut, nicht heimrelativ: das Profil schreibt sie woertlich in ein `(subpath "...")`,
    // und ein relativer Pfad waere dort eine Regel, die nie greift.
    for (const p of k.zwischenspeicher) expect(p.startsWith('/')).toBe(true)
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

  /**
   * Die dritte Haelfte derselben Frage, und die einzige, die sich nicht ueber einen Aufruf
   * pruefen laesst: **wird das aufgeloeste Modell des Rechercheurs auch eingesetzt?**
   *
   * `baueLaufUmgebung` ist die eine Stelle, an der eine `LaufUmgebung` entsteht, und sie ist
   * nicht aufrufbar, ohne die echte `harness.db` und das echte `better-sqlite3`-Binding zu
   * oeffnen. Also wird hier der Rumpf gelesen. Das ist grob, und es ist trotzdem der einzige
   * Test, der den Ausgang faengt, um den es in dieser Datei geht: gebaut, getestet, exportiert,
   * von niemandem eingesetzt. Der Aufruf selbst (`rechercheurModell()`) hat seine eigenen Tests
   * darunter, und `tests/harness/rechercheur.test.ts` prueft, was der Unterlauf damit tut.
   */
  it('setzt das Modell des Rechercheurs in die LaufUmgebung ein', async () => {
    const { readFileSync } = await import('node:fs')
    // baueLaufUmgebung selbst zog nach harness-sitzung.ts um (2026-08-23, harness-sitzung.ts
    // bekam die Lauf-Maschinerie) — dieser Test liest weiterhin den Rumpf der echten Funktion,
    // nur an ihrem neuen Ort.
    const quelle = readFileSync(
      new URL('../../src/main/harness-sitzung.ts', import.meta.url), 'utf8')
    const beginn = quelle.indexOf('async function baueLaufUmgebung(')
    expect(beginn, 'baueLaufUmgebung wurde umbenannt — dieser Test muss mit').toBeGreaterThan(0)
    const ende = quelle.indexOf('\n}', beginn)
    const rumpf = quelle.slice(beginn, ende)
    expect(rumpf, 'baueLaufUmgebung setzt `rechercheurModell` nicht — der Unterlauf faehrt dann ' +
      'weiter das Modell des Hauptlaufs, obwohl der Zuordnungsplatz besetzt ist')
      .toContain('rechercheurModell: rechercheurModell()')
  })

  it('loest ohne Zuordnung kein eigenes Rechercheur-Modell auf', async () => {
    const { rechercheurModell } = await import('../../src/main/harness-handlers')
    // Der Rueckfall ist die Vorgabe: ohne Zuordnung faehrt der Unterlauf das Modell des
    // Hauptlaufs, und dafuer gibt es hier nichts zu bauen.
    expect(rechercheurModell()).toBeNull()
  })

  /** Schreibt eine Konfiguration an den Ort, den der electron-Ersatz oben ausgibt. */
  async function mitZuordnung<T>(eintragId: string, f: () => Promise<T>): Promise<T> {
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const datei = join('/tmp/keel-test', 'cipher-keel-config.json')
    mkdirSync('/tmp/keel-test', { recursive: true })
    writeFileSync(datei, JSON.stringify({
      modelle: { eintraege: [], zuordnung: { rollen: { rechercheur: eintragId } } },
    }))
    try {
      return await f()
    } finally {
      rmSync(datei, { force: true })
    }
  }

  it('loest eine Zuordnung auf einen Eintrag auf, den die eigene Schleife fahren kann', async () => {
    await mitZuordnung('mac-qwen3-30b', async () => {
      const { rechercheurModell } = await import('../../src/main/harness-handlers')
      const m = rechercheurModell()
      expect(m?.eintrag.id).toBe('mac-qwen3-30b')
      // Eintrag und Transport nur gemeinsam — ein Unterlauf mit dem einen und dem Endpunkt des
      // anderen waere ein Fehler, den nichts anzeigt.
      expect(typeof m?.sende).toBe('function')
    })
  })

  it('faellt bei einer Zuordnung auf ein CLI-Harness auf das Modell des Hauptlaufs zurueck', async () => {
    // Das Settings-Fenster sperrt diese Wahl bereits und verspricht „Es gilt der Rueckfall".
    // Ohne dieselbe Sperre hier waere das gelogen: `starteLauf` wuerfe mitten im Werkzeugaufruf
    // des Hauptlaufs, und aus der Recherche wuerde ein `tool.failed`. Die Konfigurationsdatei
    // ist ausserdem von Hand editierbar — das Fenster ist nicht der einzige Weg hinein.
    await mitZuordnung('claude-opus-cli', async () => {
      const { rechercheurModell } = await import('../../src/main/harness-handlers')
      expect(rechercheurModell()).toBeNull()
    })
  })

  /**
   * Der Transport der Schleife darf **nicht** das Zeitbudget des Ein-Schuss-Workers erben.
   *
   * Gemessen am 2026-08-23 ueber 215 erfolgreiche Zuege gegen ein 27B auf gesunder GPU: Median
   * 8,4 s, p99 99,1 s, laengster durchgekommener Zug 108,5 s — bei einer geerbten Grenze von
   * 120 s. Sie lag damit *innerhalb* der Arbeitsverteilung, und zwei Zuege desselben Tages
   * endeten `transportfehler` nach exakt 120,0 s (einer mit 71.045 Zeichen Werkzeugausgabe im
   * Verlauf, einer mit 43 — grosser Kontext und langes Nachdenken laufen gegen dieselbe Wand).
   *
   * Geprueft wird am **echten** `sende` aus `rechercheurModell()`, nicht an einem nachgebauten:
   * die Zahl nuetzt nur etwas, wenn sie im Aufruf ankommt. Gegenprobe ausgefuehrt und rot
   * gesehen — `timeoutMs` aus dem `chat`-Aufruf entfernt: 1 rot.
   */
  it('gibt der eigenen Schleife ein eigenes Zeitbudget je Zug, nicht das des Workers', async () => {
    await mitZuordnung('mac-qwen3-30b', async () => {
      const gesehen: Array<Record<string, unknown>> = []
      const HALT = new Error('abgefangen')
      vi.doMock('../../src/main/worker/model-client', async (echt) => ({
        ...(await echt<typeof import('../../src/main/worker/model-client')>()),
        // Nach dem Mitschreiben wird geworfen: eine gueltige Antwort zu erfinden hiesse, den
        // Codec mitzupflegen, und geprueft wird hier der Aufruf, nicht die Rueckgabe.
        clientForEndpoint: () => ({
          chat: async (req: Record<string, unknown>) => { gesehen.push(req); throw HALT },
          generate: async () => { throw HALT },
        }),
      }))
      try {
        const { rechercheurModell, SCHLEIFE_TIMEOUT_MS } =
          await import('../../src/main/harness-handlers')
        const { WORKER_TIMEOUT_MS } = await import('../../src/main/worker/ollama-client')
        const m = rechercheurModell()
        await expect(m!.sende({}, { stabil: '', fluechtig: '' })).rejects.toThrow(HALT)

        expect(gesehen).toHaveLength(1)
        expect(gesehen[0].timeoutMs).toBe(SCHLEIFE_TIMEOUT_MS)
        // Der Kern: groesser als das geerbte Budget, und mit Luft ueber dem gemessenen p99.
        expect(SCHLEIFE_TIMEOUT_MS).toBeGreaterThan(WORKER_TIMEOUT_MS)
        expect(SCHLEIFE_TIMEOUT_MS).toBeGreaterThanOrEqual(3 * 100_000)
      } finally {
        vi.doUnmock('../../src/main/worker/model-client')
      }
    })
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
