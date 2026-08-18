import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruefePfad } from '../../src/main/harness/pfadwache'

let heim: string
let wurzel: string
let userDataPfad: string
let ktx: { wurzel: string; heim: string; userDataPfad: string }

beforeAll(() => {
  heim = mkdtempSync(join(tmpdir(), 'keel-heim-'))
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
})
