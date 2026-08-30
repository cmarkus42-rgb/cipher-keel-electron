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

  it('liest keinen SSH-Schluessel', async () => {
    const r = await starte(`cat ${heim}/.ssh/id_rsa`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('SCHLUESSELMATERIAL-Q7X')
  })

  it('liest keine .cipher-Datei', async () => {
    const r = await starte(`cat ${heim}/.cipher-test.env`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('GEHEIM-Q7X')
  })

  it('liest gewoehnlichen Quelltext', async () => {
    const r = await starte(`cat ${wurzel}/a.ts`, ktx, 'zu')
    expect(r.code).toBe(0)
    expect(r.ausgabe).toContain('export const a = 1')
  })
})

describe.skipIf(process.platform !== 'darwin')('starte — Netz', () => {
  it('zu: kein Socket', async () => {
    const r = await starte(
      'curl -s -m 8 -o /dev/null -w "%{http_code}" https://example.com', ktx, 'zu',
    )
    expect(r.ausgabe.trim()).toContain('000')
  }, 20_000)

  it('offen: erreicht das Netz', async () => {
    const r = await starte(
      'curl -s -m 8 -o /dev/null -w "%{http_code}" https://example.com', ktx, 'offen',
    )
    expect(r.ausgabe.trim()).toContain('200')
  }, 20_000)
})

describe.skipIf(process.platform !== 'darwin')('starte — Grenzen des Laufs', () => {
  it('bricht bei Zeitueberschreitung ab und sagt es', async () => {
    const r = await starte('sleep 5', ktx, 'zu', 300)
    expect(r.zeitueberschreitung).toBe(true)
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
