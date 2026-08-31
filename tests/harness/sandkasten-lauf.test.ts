import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starte, type SandkastenKontext } from '../../src/main/harness/sandkasten'

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
  }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

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
 * einmal ausgebaut hat („Ein Test, dessen Farbe an der Maschine haengt, sagt ueber den Code
 * nichts"). Und sie unterschied „das Profil erlaubt ausgehend" nicht von „diese Maschine hat DNS".
 *
 * Zwei Gegenstellen auf dieser Maschine statt einer draussen:
 *
 * - **Ein Unix-Socket** im Projektbaum. Ein `connect(2)` darauf faellt in Seatbelt unter
 *   `network-outbound` — es ist also derselbe Schalter, den `offen` umlegt, und er braucht keine
 *   Netzwerkschnittstelle. Das ist der Nachweis, dass `offen` ausgehende Verbindungen erlaubt und
 *   `zu` sie verbietet.
 * - **Ein HTTP-Server auf 127.0.0.1.** Er belegt die Gegenrichtung: `offen` erlaubt ausgehend und
 *   sperrt trotzdem die eigene Maschine, weil dort Paket Bs MCP-Server mit einem Bearer aus dem
 *   Projektbaum lauscht.
 *
 * Am 2026-08-30 daneben gemessen, damit die Kenntnis nicht verlorengeht, ohne dass ein Test
 * daran haengt: unter `offen` mit dem localhost-Verbot antwortete `curl https://example.com`
 * weiter mit 200 — das Verbot verengt den Modus, es hebt ihn nicht auf.
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

  it('offen: erlaubt eine ausgehende Verbindung', async () => {
    const r = await starte(`nc -U ${sockPfad} < /dev/null`, ktx, 'offen')
    expect(r.ausgabe).toContain('SOCKET-ANTWORT')
    expect(r.code).toBe(0)
  }, 20_000)

  it('zu: erlaubt keine ausgehende Verbindung', async () => {
    const r = await starte(`nc -U ${sockPfad} < /dev/null`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('SOCKET-ANTWORT')
    expect(r.code).not.toBe(0)
  }, 20_000)

  it('offen: erreicht die eigene Maschine trotzdem nicht', async () => {
    const r = await starte(
      `curl -s -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/`, ktx, 'offen',
    )
    expect(r.ausgabe.trim()).toContain('000')
  }, 20_000)

  it('zu: erreicht die eigene Maschine nicht', async () => {
    const r = await starte(
      `curl -s -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/`, ktx, 'zu',
    )
    expect(r.ausgabe.trim()).toContain('000')
  }, 20_000)

  // Die Gegenprobe zum Test darueber, und ohne sie sagte er nichts: die 000 koennte auch von
  // einem Server kommen, der gar nicht laeuft. Ungesandboxed muss dieselbe Adresse antworten.
  it('der Server dieser Probe antwortet ausserhalb des Sandkastens', async () => {
    const antwort = await fetch(`http://127.0.0.1:${port}/`)
    expect(await antwort.text()).toBe('LOOPBACK-ANTWORT')
  })
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
