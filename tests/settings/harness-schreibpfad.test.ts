import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { SETTINGS_HARNESS_SETZEN } from '../../src/shared/ipc-channels'

// Der Schreibkanal des Harness-Platzes, im Stil von settings:zuordnung-setzen. Die Pruefung
// selbst haelt `pruefeHarnessWahl` (tests/model/harness-platz.test.ts); hier steht die Wache
// darueber, dass der Kanal existiert, durch die Pruefung geht und den Renderer erreicht — kein
// Test in diesem Repo erreicht einen ipcMain-Handler.

const HANDLER = fs.readFileSync(
  path.join(__dirname, '../../src/main/settings/handlers.ts'), 'utf8',
)
const KANAELE = fs.readFileSync(
  path.join(__dirname, '../../src/shared/ipc-channels.ts'), 'utf8',
)

describe('der Schreibkanal des Harness-Platzes', () => {
  it('heisst wie die uebrigen Einstellungskanaele', () => {
    expect(SETTINGS_HARNESS_SETZEN).toBe('settings:harness-setzen')
  })

  it('steht in der Kanalunion, die das Vorladeskript durchlaesst', () => {
    expect(KANAELE).toContain('typeof SETTINGS_HARNESS_SETZEN')
  })

  it('ist im Hauptprozess registriert', () => {
    expect(HANDLER).toContain('SETTINGS_HARNESS_SETZEN')
  })

  it('schreibt nur, was die Pruefung durchgelassen hat', () => {
    expect(HANDLER).toContain('pruefeHarnessWahl(')
  })
})
