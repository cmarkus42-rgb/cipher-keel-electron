import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starte, profilText, type SandkastenKontext } from '../../src/main/harness/sandkasten'

let heim: string
let wurzel: string
let ktx: SandkastenKontext

beforeAll(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-sb-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(join(wurzel, '.git'), { recursive: true })
  mkdirSync(join(heim, '.ssh'), { recursive: true })
  writeFileSync(join(wurzel, '.git', 'HEAD'), 'historie')
  writeFileSync(join(wurzel, '.env'), 'GEHEIM=original')
  writeFileSync(join(wurzel, 'a.ts'), 'export const a = 1')
  // Ein Inhalt, der in keinem Pfad vorkommen kann. 'privat' waere hier falsch: die kanonisierte
  // Temp-Wurzel dieses Rechners heisst /private/var/..., und eine Zusicherung
  // `not.toContain('privat')` pruefte dann den Pfad in der Fehlermeldung statt den Schluessel.
  writeFileSync(join(heim, '.ssh', 'id_rsa'), 'SCHLUESSELMATERIAL-Q7X')
  writeFileSync(join(heim, '.cipher-test.env'), 'TOKEN=GEHEIM-Q7X')
  mkdirSync(join(heim, 'fremd'), { recursive: true })
  writeFileSync(join(heim, 'fremd', 'wichtig.txt'), 'wichtige arbeit')
  // Ein eigenes Verzeichnis, **nicht** die OS-Temp-Wurzel: `realpathSync(tmpdir())` ist der
  // Vorfahr dieses ganzen Testbaums, und `(allow file-write* (subpath <tmpdir>))` machte damit
  // jede Grenze des Profils gegenstandslos — der fremde Baum und `.git` lagen darunter. In der
  // Produktion ist TMPDIR (/var/folders/...) kein Vorfahr einer Projektwurzel; die Fixture muss
  // dieselbe Lage herstellen, sonst prueft sie einen Fall, den es nicht gibt.
  const eigenesTmp = join(heim, 'tmp')
  mkdirSync(eigenesTmp, { recursive: true })
  ktx = {
    wurzel, heim,
    userDataPfad: join(heim, 'Library', 'Application Support', 'cipher-keel'),
    zwischenspeicher: [],
    tmpdir: eigenesTmp,
    flutterWurzel: null,
  }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

/**
 * Faehrt ein BELIEBIGES Profil gegen ein Kommando — nur fuer die Mutationsprobe unten.
 *
 * `starte` nimmt einen Kontext und baut sein Profil selbst; das ist richtig so und macht es
 * fuer eine Mutationsprobe unbrauchbar, denn die muss ein absichtlich kaputtes Profil fahren.
 * Deshalb hier der direkte Weg zu `sandbox-exec`, und NUR hier.
 */
async function starteMitProfil(profil: string, kommando: string): Promise<string> {
  const { execFile } = await import('node:child_process')
  return new Promise((aufl) => {
    execFile(
      'sandbox-exec', ['-p', profil, '/bin/sh', '-c', kommando],
      { timeout: 15_000 },
      (_fehler, aus, err) => aufl(`${aus}${err}`),
    )
  })
}

// sandbox-exec gibt es nur auf macOS.
describe.skipIf(process.platform !== 'darwin')('starte — die Grenze haelt', () => {
  it('schreibt in der Wurzel', async () => {
    const r = await starte(`echo neu > ${wurzel}/b.ts`, ktx, 'zu')
    expect(r.code).toBe(0)
    expect(readFileSync(join(wurzel, 'b.ts'), 'utf-8')).toBe('neu\n')
  })

  it('schreibt nicht ausserhalb der Wurzel', async () => {
    const ziel = join(heim, 'verboten.txt')
    const r = await starte(`echo raus > ${ziel}`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(r.ausgabe).toContain('Operation not permitted')
    expect(() => readFileSync(ziel, 'utf-8')).toThrow()
  })

  it('loescht keinen fremden Baum', async () => {
    const r = await starte(`rm -rf ${heim}/fremd`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(heim, 'fremd', 'wichtig.txt'), 'utf-8')).toBe('wichtige arbeit')
  })

  it('schreibt nicht in .git', async () => {
    const r = await starte(`echo kaputt > ${wurzel}/.git/HEAD`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(wurzel, '.git', 'HEAD'), 'utf-8')).toBe('historie')
  })

  it('loescht .git nicht', async () => {
    const r = await starte(`rm -rf ${wurzel}/.git`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(wurzel, '.git', 'HEAD'), 'utf-8')).toBe('historie')
  })

  it('liest die .env der Wurzel nicht', async () => {
    const r = await starte(`cat ${wurzel}/.env`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('original')
    expect(r.ausgabe).toContain('Operation not permitted')
  })

  it('ueberschreibt die .env der Wurzel nicht', async () => {
    const r = await starte(`echo zerstoert > ${wurzel}/.env`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(wurzel, '.env'), 'utf-8')).toBe('GEHEIM=original')
  })

  // Beide Zusicherungen, nicht nur die negative: `not.toContain` allein bestuende auch, wenn
  // `cat` aus einem ganz anderen Grund nichts ausgab — ein vertippter Pfad, eine Fixture, die
  // nie entstand, ein Sandkasten, der gar nicht startete. Der .env-Test daneben zeigt die Form.
  // Diese zwei sind die wertvollsten Verbote des Profils; sie duerfen nicht die schwaechsten
  // Tests der Datei sein.
  it('liest keinen SSH-Schluessel', async () => {
    const r = await starte(`cat ${heim}/.ssh/id_rsa`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('SCHLUESSELMATERIAL-Q7X')
    expect(r.ausgabe).toContain('Operation not permitted')
  })

  it('liest keine .cipher-Datei', async () => {
    const r = await starte(`cat ${heim}/.cipher-test.env`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('GEHEIM-Q7X')
    expect(r.ausgabe).toContain('Operation not permitted')
  })

  it('liest gewoehnlichen Quelltext', async () => {
    const r = await starte(`cat ${wurzel}/a.ts`, ktx, 'zu')
    expect(r.code).toBe(0)
    expect(r.ausgabe).toContain('export const a = 1')
  })
})

/**
 * Beide Netzmodi, ohne einen einzigen Byte ins Internet.
 *
 * Die erste Fassung fuhr `curl https://example.com` und behauptete an der 200, `offen` erlaube
 * ausgehende Verbindungen. Das war eine Aussage ueber die Maschine: im Zug oder auf einem
 * abgeschotteten Runner wird der Test rot, ohne dass sich eine Zeile Code geaendert haette —
 * genau die Sorte Test, die tests/harness/verdrahtung.test.ts fuer den Schluesselbund schon
 * einmal ausgebaut hat. Zwei Gegenstellen auf dieser Maschine statt einer draussen: ein
 * HTTP-Server auf 127.0.0.1 und ein Unix-Socket im Projektbaum.
 *
 * **PAKET D HAT DIE AUSSAGE BEIDER GEGENSTELLEN GEDREHT, und das ist keine Anpassung an den
 * Code, sondern der Kern der Aenderung:**
 *
 * - **Loopback ist jetzt offen, auch unter `zu`.** Es muss das sein, damit ein Lauf seine
 *   eigenen Tests fahren kann: der Dart-Testrunner oeffnet einen Server-Socket auf 127.0.0.1,
 *   und `flutter test` ist kein Paketbefehl, laeuft also unter `zu`. Zwei Tests unten behaupten
 *   deshalb das Gegenteil dessen, was sie bis Paket C behauptet haben.
 * - **Der Unix-Socket ist jetzt gesperrt, auch unter `offen`.** Er war bis Paket C der Beleg
 *   dafuer, dass `offen` ausgehende Verbindungen erlaubt; jetzt ist er der Beleg fuer die
 *   Grenze, an der alles haengt: keels MCP-Server lauscht seit Paket D auf einem Socket unter
 *   `userData`, und ein gesandkastetes Kind, das ihn erreichte, koennte ueber
 *   `keel_zelle_beauftragen` eine Niveau-B-Zelle beauftragen — die OHNE Sandkasten laeuft.
 *   Das ist ein Ausbruch, kein Datenleck.
 *
 * Die Mutationsprobe daneben ist deshalb Pflicht und kein Beiwerk: ohne sie belegte ein
 * gescheitertes `nc -U` nur, dass der Socket nicht da war (Paket C, Task 7 — zwei
 * Schutzmechanismen mit derselben Meldung machen einander unprueftbar).
 *
 * Am 2026-08-30 daneben gemessen, damit die Kenntnis nicht verlorengeht: unter `offen` mit dem
 * inzwischen gestrichenen localhost-Verbot antwortete `curl https://example.com` weiter mit
 * 200 — das Verbot verengte den Modus, es hob ihn nicht auf.
 */
describe.skipIf(process.platform !== 'darwin')('starte — Netz', () => {
  let port = 0
  let sockPfad = ''
  let httpServer: import('node:http').Server
  let sockServer: import('node:net').Server

  beforeAll(async () => {
    const { createServer } = await import('node:http')
    const { createServer: createSockServer } = await import('node:net')
    sockPfad = join(wurzel, 'probe.sock')
    httpServer = createServer((_q, s) => s.end('LOOPBACK-ANTWORT'))
    sockServer = createSockServer(c => c.end('SOCKET-ANTWORT\n'))
    await new Promise<void>(f => httpServer.listen(0, '127.0.0.1', f))
    await new Promise<void>(f => sockServer.listen(sockPfad, f))
    port = (httpServer.address() as { port: number }).port
  })

  afterAll(async () => {
    await new Promise<void>(f => httpServer.close(() => f()))
    await new Promise<void>(f => sockServer.close(() => f()))
  })

  // --- Loopback: seit Paket D offen, und das ist der Zweck ---

  it('zu: erreicht die eigene Maschine — dafuer ist das Loch da', async () => {
    const r = await starte(
      `curl -s -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/`, ktx, 'zu',
    )
    expect(r.ausgabe.trim()).toContain('200')
  }, 20_000)

  it('offen: erreicht die eigene Maschine ebenfalls', async () => {
    const r = await starte(
      `curl -s -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/`, ktx, 'offen',
    )
    expect(r.ausgabe.trim()).toContain('200')
  }, 20_000)

  // `zu` heisst seit Paket D "nur die eigene Maschine", nicht "kein Netz" — und die zweite
  // Haelfte dieses Satzes braucht ihren eigenen Test, sonst hiesse `zu` unbemerkt "alles".
  // Eine Adresse im Dokumentationsbereich (TEST-NET-1, RFC 5737): sie ist nicht geroutet, ein
  // Verbindungsversuch scheitert also auch ohne Sandkasten — was hier zaehlt, ist, dass er
  // SOFORT scheitert und nicht erst am Zeitablauf. `-m 3` deckelt beides.
  it('zu: erreicht nichts ausserhalb von localhost', async () => {
    const r = await starte(
      `curl -s -m 3 -o /dev/null -w "%{http_code}" http://192.0.2.1/`, ktx, 'zu',
    )
    expect(r.ausgabe.trim()).toContain('000')
  }, 20_000)

  // Die Gegenprobe: die 200 oben koennte auch von einem Sandkasten kommen, der gar nichts
  // prueft. Ungesandboxed muss dieselbe Adresse dasselbe antworten.
  it('der Server dieser Probe antwortet ausserhalb des Sandkastens', async () => {
    const antwort = await fetch(`http://127.0.0.1:${port}/`)
    expect(await antwort.text()).toBe('LOOPBACK-ANTWORT')
  })

  it('darf einen eigenen Server-Socket oeffnen — listen(2) braucht network-inbound', async () => {
    // Der Fall, um den es wirklich geht: der Dart-Testrunner oeffnet einen Server-Socket auf
    // 127.0.0.1. Mit `(allow network-bind)` allein scheitert das `listen` mit
    // `Operation not permitted` — am 2026-08-31 gemessen, auch bei UNGEFILTERTEM bind.
    const r = await starte(
      `python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); s.listen(1); print('LISTEN-OK')"`,
      ktx, 'zu',
    )
    expect(r.ausgabe).toContain('LISTEN-OK')
  }, 20_000)

  // --- Unix-Sockets: seit Paket D zu, und daran haengt die ganze Grenze ---

  it('erreicht keinen Unix-Socket — hier haengt die Grenze zu keels eigenen Werkzeugen', async () => {
    // keels MCP-Server lauscht seit Paket D auf einem Socket unter userData. Ein Kind, das
    // ihn erreichte, koennte ueber `keel_zelle_beauftragen` eine Niveau-B-Zelle beauftragen —
    // und die laeuft OHNE Sandkasten. Das ist ein Ausbruch, kein Datenleck.
    for (const netz of ['zu', 'offen'] as const) {
      const r = await starte(`nc -U ${sockPfad} < /dev/null`, ktx, netz)
      expect(r.ausgabe).not.toContain('SOCKET-ANTWORT')
      expect(r.code).not.toBe(0)
    }
  }, 30_000)

  it('Mutationsprobe: mit ungefilterter Netz-Erlaubnis gelingt derselbe Aufruf', async () => {
    // Ohne diese Probe belegt der Test darueber nur, dass der Socket nicht da war oder `nc`
    // aus einem anderen Grund scheiterte. Zwei Schutzmechanismen, die dieselbe Meldung
    // ausgeben, machen einander unprueftbar — das kostete in Paket C, Task 7, eine
    // Mutationsprobe, die gruen blieb und nichts bewies.
    //
    // `(allow network-outbound)` UNGEFILTERT ist die eine Aenderung, die Unix-Sockets wieder
    // gewaehrt. Sie steht hier hinter dem echten Profil, weil SBPL nach der zuletzt passenden
    // gleichartig gefilterten Regel entscheidet — und eine ungefilterte Erlaubnis oeffnet, was
    // eine gefilterte nicht abgedeckt hat.
    const mutiert = profilText(ktx, 'offen') + '\n(allow network-outbound)\n'
    const r = await starteMitProfil(mutiert, `nc -U ${sockPfad} < /dev/null`)
    expect(r).toContain('SOCKET-ANTWORT')
  }, 20_000)
})

describe.skipIf(process.platform !== 'darwin')('starte — Grenzen des Laufs', () => {
  it('bricht bei Zeitueberschreitung ab und sagt es', async () => {
    const r = await starte('sleep 5', ktx, 'zu', 300)
    expect(r.zeitueberschreitung).toBe(true)
  }, 20_000)

  it('bindet die Wanduhr auch bei einem Kommando, das forkt', async () => {
    // Der Fall, der die Zeitgrenze wirklich braucht. `sleep 5` allein prueft die eine Form, die
    // die Shell mit `exec` an sich zieht — dort genuegt ein Kill auf die eine Pid, und der Test
    // war gruen, waehrend die Grenze fuer jede Pipeline und jeden Hintergrundjob nicht band.
    // Gemessen ohne Gruppenkill: 5024 ms bei 300 ms Grenze, mit `zeitueberschreitung: true`.
    // Die Wanduhr ist darum die Zusicherung, nicht die Flagge.
    const t0 = Date.now()
    const r = await starte('sleep 5 | cat', ktx, 'zu', 300)
    expect(r.zeitueberschreitung).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2000)
  }, 20_000)

  it('deckelt die Ausgabe und sagt es', async () => {
    const r = await starte('yes abcdefgh | head -c 200000', ktx, 'zu')
    expect(r.abgeschnitten).toBe(true)
    expect(r.ausgabe.length).toBeLessThanOrEqual(64 * 1024)
  }, 20_000)

  it('arbeitet in der Wurzel', async () => {
    const r = await starte('pwd', ktx, 'zu')
    expect(r.ausgabe.trim()).toBe(wurzel)
  })

  it('gibt dem Kind kein Umgebungsgeheimnis mit', async () => {
    process.env.KEEL_TEST_GEHEIMNIS = 'darf-nicht-durch'
    try {
      const r = await starte('echo "[$KEEL_TEST_GEHEIMNIS]"', ktx, 'zu')
      expect(r.ausgabe).not.toContain('darf-nicht-durch')
      expect(r.ausgabe).toContain('[]')
    } finally {
      delete process.env.KEEL_TEST_GEHEIMNIS
    }
  })
})
