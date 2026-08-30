import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { istPaketbefehl } from '../../src/main/harness/sandkasten'
import {
  SHELL_WERKZEUGE, _testSetzeMaxZeitgrenzeMs, _testMaxZeitgrenzeMsZuruecksetzen,
} from '../../src/main/harness/werkzeug-shell'
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
  // derselbe Fall wie in sandkasten-lauf.test.ts, dort schon einmal gefunden. In der Produktion
  // ist TMPDIR kein Vorfahr des Heimatverzeichnisses; die Fixture muss dieselbe Lage herstellen,
  // sonst prueft sie einen Fall, den es nicht gibt.
  const eigenesTmp = join(heim, 'tmp')
  mkdirSync(eigenesTmp, { recursive: true })
  ktx = {
    wache, graphDb: null,
    sandkasten: { ...wache, zwischenspeicher: [], tmpdir: eigenesTmp },
  }
})
afterAll(() => rmSync(heim, { recursive: true, force: true }))

// Plattformunabhaengig, weil beide Faelle vor jedem `spawn` zurueckkehren: das Feld fehlt, oder es
// wird nur der Stummeltext gelesen. Beide sassen vorher in `describe.skipIf(darwin)` — harmlos,
// solange CI auf macOS laeuft, aber der Stummel-Test ist der sicherheitsrelevante (siehe Modulkopf
// von werkzeug-shell.ts) und wuerde auf einem Linux-Runner wortlos verschwinden.
describe('shell_ausfuehren — plattformunabhaengig', () => {
  it('nennt ein fehlendes Kommando', async () => {
    const r = await shell.ausfuehren({}, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('kommando')
  })

  it('sein Stummel ist einzeilig — sonst schmuggelt er sich in den Praefix', () => {
    expect(shell.beschreibung).not.toContain('\n')
  })
})

describe.skipIf(process.platform !== 'darwin')('shell_ausfuehren — echter Lauf', () => {
  it('fuehrt aus und gibt die Ausgabe zurueck', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo hallo' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).toContain('hallo')
  })

  it('nennt den Rueckgabecode bei einem Fehlschlag, statt still ok zu melden', async () => {
    const r = await shell.ausfuehren({ kommando: 'exit 3' }, ktx)
    expect(r.ok).toBe(false)
    // 'Rueckgabecode 3', nicht bloss '3': jede dreistellige Zahl in irgendeiner Meldung wuerde
    // sonst genuegen, und der Test sagte nichts ueber den Code aus.
    if (!r.ok) expect(r.meldung).toContain('Rueckgabecode 3')
  })

  it('schreibt in der Wurzel', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo inhalt > erzeugt.txt' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'erzeugt.txt'), 'utf-8')).toBe('inhalt\n')
  })

  it('schreibt nicht ausserhalb der Wurzel', async () => {
    const r = await shell.ausfuehren({ kommando: `echo raus > ${heim}/verboten.txt` }, ktx)
    expect(r.ok).toBe(false)
    // Die eigentliche Zusicherung: `ok: false` allein bestuende auch, wenn der Sandkasten aus
    // einem ganz anderen Grund nicht startete. Was zaehlt, ist dass die Datei nie entstand.
    expect(existsSync(join(heim, 'verboten.txt'))).toBe(false)
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

  it('unterscheidet Zeitueberschreitung von einer Ablehnung durch die Grenze', async () => {
    const r = await shell.ausfuehren({ kommando: 'sleep 5', zeitgrenzeMs: 300 }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Zeitgrenze')
  }, 20_000)

  it('deckelt eine unsinnig grosse Zeitgrenze auf das Maximum, statt sie zu uebernehmen', async () => {
    // Die echte Decke ist 15 Minuten — kein Test wartet das ab. Mit dem Test-Override auf 200 ms
    // gesetzt, beweist ein `sleep 5` mit `zeitgrenzeMs: 100_000_000` den Deckel: ohne ihn liefe
    // der Befehl unter der gewuenschten Zeitgrenze durch und wuerde nach 5 s regulaer mit ok:true
    // enden, lange bevor irgendeine Grenze greift.
    _testSetzeMaxZeitgrenzeMs(200)
    try {
      const r = await shell.ausfuehren({ kommando: 'sleep 5', zeitgrenzeMs: 100_000_000 }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung).toContain('Zeitgrenze von 200 ms')
    } finally {
      _testMaxZeitgrenzeMsZuruecksetzen()
    }
  }, 20_000)
})
