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
// counts as "has a caller" — both are checked, and both would catch a channel that is declared
// and then genuinely never referenced anywhere.
const HARNESS_KANAELE = Object.entries(kanaele)
  .filter(([, wert]) => typeof wert === 'string' && wert.startsWith('harness:'))
  .map(([name, wert]) => ({ name, wert: wert as string }))

describe('Waechter: kein Harness-Kanal ohne Aufrufer', () => {
  it('kennt ueberhaupt Harness-Kanaele', () => {
    expect(HARNESS_KANAELE.length).toBe(4)
  })

  it('jeder Kanal hat einen Aufrufer im Renderer', () => {
    const rendererQuellen = alleDateien(join(WURZEL, 'src', 'renderer'))
      .map(p => readFileSync(p, 'utf-8')).join('\n')
    const ohne = HARNESS_KANAELE
      .filter(({ name, wert }) => !rendererQuellen.includes(wert) && !rendererQuellen.includes(name))
      .map(({ wert }) => wert)
    expect(ohne).toEqual([])
  })

  it('jeder Kanal hat einen Handler oder Sender im Hauptprozess', () => {
    const hauptQuellen = alleDateien(join(WURZEL, 'src', 'main'))
      .map(p => readFileSync(p, 'utf-8')).join('\n')
    const ohne = HARNESS_KANAELE
      .filter(({ name, wert }) => !hauptQuellen.includes(wert) && !hauptQuellen.includes(name))
      .map(({ wert }) => wert)
    expect(ohne).toEqual([])
  })
})
