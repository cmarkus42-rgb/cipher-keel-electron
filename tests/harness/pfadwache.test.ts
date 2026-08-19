import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
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

// Fund 1: `verzeichnis_listen` and `inhalt_suchen` hand a model back `relative(wurzel, pfad)`.
// `datei_lesen` (via `pruefePfad`) must accept exactly that string back — not reject it as
// "outside the root" because it was resolved against the wrong base.
describe('pruefePfad – relative Pfade loesen gegen die Wurzel auf, nicht gegen process.cwd()', () => {
  it('laesst einen relativen Pfad innerhalb der Wurzel durch', () => {
    const e = pruefePfad('quelle.ts', ktx)
    expect(e.ok).toBe(true)
    if (e.ok) expect(e.pfad).toBe(join(wurzel, 'quelle.ts'))
  })

  it('lehnt einen relativen Pfad ab, der ueber .. aus der Wurzel herausfuehrt', () => {
    const e = pruefePfad(join('..', 'ausserhalb.txt'), ktx)
    expect(e).toEqual({ ok: false, grund: 'Pfad liegt ausserhalb der Wurzel' })
  })

  it('loest einen absoluten Pfad unveraendert auf, wie zuvor', () => {
    const e = pruefePfad(join(wurzel, 'quelle.ts'), ktx)
    expect(e.ok).toBe(true)
    if (e.ok) expect(e.pfad).toBe(join(wurzel, 'quelle.ts'))
  })

  it('oeffnet, was verzeichnis_listen/inhalt_suchen zurueckgeben — die beiden Werkzeuge stimmen ueberein', () => {
    // This is exactly what werkzeug-datei.ts's listing tools compute for a hit:
    // relative(ktx.wache.wurzel, absoluterTreffer). A model reads that string and hands it
    // straight back to datei_lesen.
    const wieVerzeichnisListenEsZurueckgibt = relative(wurzel, join(wurzel, 'quelle.ts'))
    const e = pruefePfad(wieVerzeichnisListenEsZurueckgibt, ktx)
    expect(e.ok).toBe(true)
    if (e.ok) expect(e.pfad).toBe(join(wurzel, 'quelle.ts'))
  })
})

// Anchors (heim, userDataPfad) must be resolved the same way as the candidate and the root —
// otherwise a symlinked home directory (common on external volumes; /tmp itself is one on most
// systems) makes `istIn` compare a resolved candidate against an unresolved prefix, and the
// containment check silently stops matching. `config` is deliberately not a name any deny rule
// would catch on its own — only the directory-containment rule may produce the rejection here,
// so a control case runs alongside each symlink case to prove the rule fires at all.
describe('pruefePfad – Anker-Aufloesung ueber Symlinks (heim, userDataPfad)', () => {
  let heimEcht: string
  let heimLink: string
  let userDataEcht: string
  let userDataLink: string

  beforeAll(() => {
    heimEcht = realpathSync(mkdtempSync(join(tmpdir(), 'keel-heim-echt-')))
    heimLink = join(tmpdir(), `keel-heim-link-${process.pid}-${Date.now()}`)
    symlinkSync(heimEcht, heimLink)
    mkdirSync(join(heimEcht, '.ssh'), { recursive: true })
    writeFileSync(join(heimEcht, '.ssh', 'config'), 'Host beispiel\n  User cipher')

    userDataEcht = realpathSync(mkdtempSync(join(tmpdir(), 'keel-udata-echt-')))
    userDataLink = join(tmpdir(), `keel-udata-link-${process.pid}-${Date.now()}`)
    symlinkSync(userDataEcht, userDataLink)
    writeFileSync(join(userDataEcht, 'config.json'), '{"a":1}')
  })

  afterAll(() => {
    rmSync(heimEcht, { recursive: true, force: true })
    rmSync(heimLink, { force: true })
    rmSync(userDataEcht, { recursive: true, force: true })
    rmSync(userDataLink, { force: true })
  })

  it('Kontrolle: heim ohne Symlink lehnt ~/.ssh/config ab', () => {
    const ktxEcht = { wurzel: heimEcht, heim: heimEcht, userDataPfad: join(heimEcht, 'udata') }
    expect(pruefePfad(join(heimEcht, '.ssh', 'config'), ktxEcht).ok).toBe(false)
  })

  it('heim ueber einen Symlink: ~/.ssh/config bleibt abgelehnt', () => {
    // wurzel === heimLink so the outside-root rule cannot mask the .ssh-containment check —
    // the resolved candidate lands inside the resolved root either way.
    const ktxLink = { wurzel: heimLink, heim: heimLink, userDataPfad: join(heimLink, 'udata') }
    expect(pruefePfad(join(heimLink, '.ssh', 'config'), ktxLink).ok).toBe(false)
  })

  it('Kontrolle: userDataPfad ohne Symlink lehnt die eigene Konfiguration ab', () => {
    const ktxEcht = { wurzel: userDataEcht, heim: heimEcht, userDataPfad: userDataEcht }
    expect(pruefePfad(join(userDataEcht, 'config.json'), ktxEcht).ok).toBe(false)
  })

  it('userDataPfad ueber einen Symlink bleibt abgelehnt', () => {
    const ktxLink = { wurzel: userDataLink, heim: heimEcht, userDataPfad: userDataLink }
    expect(pruefePfad(join(userDataLink, 'config.json'), ktxLink).ok).toBe(false)
  })
})
