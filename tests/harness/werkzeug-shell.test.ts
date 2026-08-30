import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { istPaketbefehl } from '../../src/main/harness/sandkasten'
import { SHELL_WERKZEUGE } from '../../src/main/harness/werkzeug-shell'
import type { WerkzeugKontext } from '../../src/main/harness/werkzeuge'

const shell = SHELL_WERKZEUGE.find(w => w.name === 'shell_ausfuehren')!

describe('istPaketbefehl', () => {
  it('erkennt die Paketbefehle', () => {
    expect(istPaketbefehl('npm ci')).toBe(true)
    expect(istPaketbefehl('npm install lodash')).toBe(true)
    expect(istPaketbefehl('flutter pub get')).toBe(true)
    expect(istPaketbefehl('  dart pub get  ')).toBe(true)
    expect(istPaketbefehl('pip install requests')).toBe(true)
  })
  it('erkennt gewoehnliche Kommandos nicht', () => {
    expect(istPaketbefehl('npm test')).toBe(false)
    expect(istPaketbefehl('flutter test')).toBe(false)
    expect(istPaketbefehl('curl https://example.com')).toBe(false)
    expect(istPaketbefehl('echo npm ci')).toBe(false)
  })
})

describe('shell_ausfuehren — ohne Sandkastenkontext', () => {
  it('antwortet benannt statt zu laufen', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo x' }, { wache: { wurzel: '/x', heim: '/h', userDataPfad: '/u' }, graphDb: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Sandkasten')
  })
})

let heim: string
let wurzel: string
let ktx: WerkzeugKontext

beforeAll(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-sh-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  const wache = { wurzel, heim, userDataPfad: join(heim, 'userData') }
  // Ein eigenes Verzeichnis, **nicht** die OS-Temp-Wurzel: `realpathSync(tmpdir())` ist der
  // Vorfahr dieses ganzen Testbaums (heim liegt selbst darunter), und
  // `(allow file-write* (subpath <tmpdir>))` machte damit die Grenze um `heim` gegenstandslos —
  // siehe denselben Kommentar in sandkasten-lauf.test.ts, wo dieser Fall schon einmal gefunden
  // wurde. In der Produktion ist TMPDIR kein Vorfahr des Heimatverzeichnisses; die Fixture muss
  // dieselbe Lage herstellen, sonst prueft sie einen Fall, den es nicht gibt.
  const eigenesTmp = join(heim, 'tmp')
  mkdirSync(eigenesTmp, { recursive: true })
  ktx = {
    wache, graphDb: null,
    sandkasten: { ...wache, zwischenspeicher: [], tmpdir: eigenesTmp },
  }
})
afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe.skipIf(process.platform !== 'darwin')('shell_ausfuehren — echter Lauf', () => {
  it('fuehrt aus und gibt die Ausgabe zurueck', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo hallo' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain('hallo')
  })

  it('nennt den Rueckgabecode bei einem Fehlschlag, statt still ok zu melden', async () => {
    const r = await shell.ausfuehren({ kommando: 'exit 3' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('3')
  })

  it('schreibt in der Wurzel', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo inhalt > erzeugt.txt' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'erzeugt.txt'), 'utf-8')).toBe('inhalt\n')
  })

  it('schreibt nicht ausserhalb der Wurzel', async () => {
    const r = await shell.ausfuehren({ kommando: `echo raus > ${heim}/verboten.txt` }, ktx)
    expect(r.ok).toBe(false)
  })

  it('bekommt ohne Paketbefehl kein Netz', async () => {
    // `|| true` ist hier nicht Bequemlichkeit, sondern die Bedingung dafuer, dass der Test
    // ueberhaupt etwas prueft: ohne Socket endet `curl` mit einem Fehlercode, `shell_ausfuehren`
    // liefert dann `ok: false` — und eine Zusicherung hinter `if (r.ok)` liefe genau im
    // geprueften Fall ins Leere. Mit `|| true` endet die Shell mit 0, das Ergebnis ist `ok`, und
    // die Ausgabe traegt die 000, auf die es ankommt.
    const r = await shell.ausfuehren(
      { kommando: 'curl -s -m 8 -o /dev/null -w "%{http_code}" https://example.com || true' }, ktx,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain('000')
  }, 20_000)

  it('nennt ein fehlendes Kommando', async () => {
    const r = await shell.ausfuehren({}, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('kommando')
  })

  it('unterscheidet Zeitueberschreitung von einer Ablehnung durch die Grenze', async () => {
    const r = await shell.ausfuehren({ kommando: 'sleep 5', zeitgrenzeMs: 300 }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Zeitgrenze')
  }, 20_000)

  it('sein Stummel ist einzeilig — sonst schmuggelt er sich in den Praefix', () => {
    expect(shell.beschreibung).not.toContain('\n')
  })
})
