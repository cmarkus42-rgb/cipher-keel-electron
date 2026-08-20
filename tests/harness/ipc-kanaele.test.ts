import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as kanaele from '../../src/shared/ipc-channels'

const WURZEL = join(__dirname, '..', '..')

function alleDateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis, { recursive: true, encoding: 'utf-8' })
    .map(e => join(verzeichnis, e))
    .filter(p => /\.(ts|tsx)$/.test(p))
}

// Every handler in this codebase (settings/handlers.ts, ipc-handlers.ts) wires a channel
// through its typed constant — `ipcMain.handle(SETTINGS_ANSICHT, ...)`, never the raw string.
// A source scan that only looked for the literal wire value ('harness:lauf-starten') would
// therefore never find a real, type-safe caller; it would instead reward pasting the raw string
// somewhere, which is exactly the kind of stringly-typed drift ipc-channels.ts's own header
// comment exists to prevent. So a match on either the wire value or the constant's own name
// counts — but *only* as the argument of an actual IPC call (invoke/on/once/send/handle/
// broadcast), not a bare mention. A channel that is imported and never called — the gap a
// coordinator review found in this test's first version, by swapping a real `invoke(...)` call
// for a dead channel and leaving the now-unused import in place — must still fail this test.
const AUFRUF_FUNKTIONEN = ['invoke', 'on', 'once', 'send', 'handle', 'broadcast']

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hatEchtenAufruf(quellen: string, name: string, wert: string): boolean {
  const funktionen = AUFRUF_FUNKTIONEN.join('|')
  const namePattern = new RegExp(`\\b(?:${funktionen})\\s*\\(\\s*${escapeRegExp(name)}\\b`)
  const wertPattern = new RegExp(`\\b(?:${funktionen})\\s*\\(\\s*['"\`]${escapeRegExp(wert)}['"\`]`)
  return namePattern.test(quellen) || wertPattern.test(quellen)
}

const HARNESS_KANAELE = Object.entries(kanaele)
  .filter(([, wert]) => typeof wert === 'string' && wert.startsWith('harness:'))
  .map(([name, wert]) => ({ name, wert: wert as string }))

describe('Waechter: kein Harness-Kanal ohne Aufrufer', () => {
  it('kennt ueberhaupt Harness-Kanaele', () => {
    expect(HARNESS_KANAELE.length).toBe(6)
  })

  it('jeder Kanal hat einen echten Aufrufer im Renderer (invoke/on, nicht nur eine Erwaehnung)', () => {
    const rendererQuellen = alleDateien(join(WURZEL, 'src', 'renderer'))
      .map(p => readFileSync(p, 'utf-8')).join('\n')
    const ohne = HARNESS_KANAELE
      .filter(({ name, wert }) => !hatEchtenAufruf(rendererQuellen, name, wert))
      .map(({ wert }) => wert)
    expect(ohne).toEqual([])
  })

  it('jeder Kanal hat einen echten Handler oder Sender im Hauptprozess (nicht nur eine Erwaehnung)', () => {
    const hauptQuellen = alleDateien(join(WURZEL, 'src', 'main'))
      .map(p => readFileSync(p, 'utf-8')).join('\n')
    const ohne = HARNESS_KANAELE
      .filter(({ name, wert }) => !hatEchtenAufruf(hauptQuellen, name, wert))
      .map(({ wert }) => wert)
    expect(ohne).toEqual([])
  })
})
