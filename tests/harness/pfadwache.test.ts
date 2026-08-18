import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruefePfad } from '../../src/main/harness/pfadwache'

let heim: string
let wurzel: string
let userDataPfad: string
let ktx: { wurzel: string; heim: string; userDataPfad: string }

beforeAll(() => {
  // realpathSync here matches what a real WacheKontext.heim already is: Electron's
  // app.getPath('home') returns a canonical path, not a raw tmpdir symlink target (macOS
  // routes os.tmpdir() through /var -> /private/var). Without this, `ktx.heim` and the
  // guard's already-resolved candidate path would disagree on a prefix that has nothing to
  // do with the rule under test.
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-heim-')))
  wurzel = join(heim, 'projekt')
  userDataPfad = join(heim, 'Library', 'Application Support', 'cipher-keel')
  mkdirSync(wurzel, { recursive: true })
  mkdirSync(join(heim, '.ssh'), { recursive: true })
  mkdirSync(join(wurzel, '.git'), { recursive: true })
  mkdirSync(userDataPfad, { recursive: true })
  writeFileSync(join(wurzel, 'quelle.ts'), 'export const a = 1')
  writeFileSync(join(wurzel, '.env'), 'TOKEN=geheim')
  writeFileSync(join(wurzel, 'zert.pem'), 'schluesselmaterial')
  writeFileSync(join(heim, '.ssh', 'id_rsa'), 'privat')
  writeFileSync(join(heim, '.zshrc'), 'export PATH=x')
  writeFileSync(join(heim, '.cipher-webhook.env'), 'TOKEN=x')
  writeFileSync(join(wurzel, '.git', 'config'), '[core]')
  // The bypass this whole guard stands or falls on.
  symlinkSync(join(heim, '.ssh'), join(wurzel, 'abkuerzung'))
  ktx = { wurzel, heim, userDataPfad }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe('pruefePfad', () => {
  it('laesst eine gewoehnliche Datei in der Wurzel durch', () => {
    expect(pruefePfad(join(wurzel, 'quelle.ts'), ktx).ok).toBe(true)
  })

  it('lehnt einen Pfad ausserhalb der Wurzel ab', () => {
    const e = pruefePfad(join(heim, 'anderswo.txt'), ktx)
    expect(e).toEqual({ ok: false, grund: 'Pfad liegt ausserhalb der Wurzel' })
  })

  it('lehnt ~/.ssh ab', () => {
    expect(pruefePfad(join(heim, '.ssh', 'id_rsa'), ktx))
      .toEqual({ ok: false, grund: 'Pfad ist geschuetzt' })
  })

  it('lehnt einen Symlink ab, der aus der Wurzel heraus nach ~/.ssh zeigt', () => {
    // Without realpath before the check this passes the root test and reads the key.
    const e = pruefePfad(join(wurzel, 'abkuerzung', 'id_rsa'), ktx)
    expect(e.ok).toBe(false)
  })

  it('lehnt eine Shell-Startdatei ab', () => {
    expect(pruefePfad(join(heim, '.zshrc'), ktx).ok).toBe(false)
  })

  it('lehnt keels eigene Konfiguration ab', () => {
    expect(pruefePfad(join(userDataPfad, 'config.json'), ktx).ok).toBe(false)
  })

  it('lehnt ~/.cipher-* ab', () => {
    expect(pruefePfad(join(heim, '.cipher-webhook.env'), ktx).ok).toBe(false)
  })

  it('lehnt ein .git-Verzeichnis innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, '.git', 'config'), ktx).ok).toBe(false)
  })

  it('lehnt .env innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, '.env'), ktx))
      .toEqual({ ok: false, grund: 'Pfad ist geschuetzt' })
  })

  it('lehnt *.pem innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, 'zert.pem'), ktx).ok).toBe(false)
  })

  it('laesst eine nicht existierende Datei in der Wurzel durch, damit der Fehler vom Werkzeug kommt', () => {
    expect(pruefePfad(join(wurzel, 'gibtsnicht.ts'), ktx).ok).toBe(true)
  })

  it('verraet in der Ablehnung weder Inhalt noch Existenz', () => {
    const e = pruefePfad(join(heim, '.ssh', 'id_rsa'), ktx)
    if (e.ok) throw new Error('haette abgelehnt werden muessen')
    expect(e.grund).not.toContain('privat')
    expect(e.grund.split(' ').length).toBeLessThan(8)
  })

  // Case-insensitive filesystems (default APFS, default Windows) hand a tool the content of
  // `.env` when it asks for `.ENV`. The guard must deny the name regardless of casing.
  it('lehnt .ENV (Grossbuchstaben) innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, '.ENV'), ktx))
      .toEqual({ ok: false, grund: 'Pfad ist geschuetzt' })
  })

  it('lehnt .Env (gemischte Gross-/Kleinschreibung) innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, '.Env'), ktx))
      .toEqual({ ok: false, grund: 'Pfad ist geschuetzt' })
  })

  it('lehnt ZERT.PEM (Grossbuchstaben-Endung) innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, 'ZERT.PEM'), ktx).ok).toBe(false)
  })

  it('lehnt eine grossgeschriebene Shell-Startdatei ab', () => {
    // Placed outside `wurzel`, the outside-root rule would deny it either way and mask a
    // case-sensitivity bug in SHELL_STARTDATEIEN. Using wurzel === heim isolates the rule.
    const ktxImHeim = { wurzel: heim, heim, userDataPfad }
    expect(pruefePfad(join(heim, '.ZSHRC'), ktxImHeim).ok).toBe(false)
  })

  it('lehnt ein grossgeschriebenes .GIT-Wegstueck ab', () => {
    expect(pruefePfad(join(wurzel, '.GIT', 'config'), ktx).ok).toBe(false)
  })

  it('lehnt ~/.CIPHER-* (Grossbuchstaben-Praefix) ab', () => {
    // Same isolation as above: without wurzel === heim, the outside-root rule would mask a
    // case-sensitivity bug in the .cipher- prefix check.
    const ktxImHeim = { wurzel: heim, heim, userDataPfad }
    expect(pruefePfad(join(heim, '.CIPHER-webhook.env'), ktxImHeim).ok).toBe(false)
  })
})
