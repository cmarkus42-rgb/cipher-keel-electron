import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('agent config defaults', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    // Fresh, empty userData dir per test — no config file exists in it, so loadConfig()
    // falls back to defaults. A fixed shared path would let a stale file on the machine
    // decide the outcome instead of the code under test.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-config-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('defaults to launching claude-code with permissions skipped', async () => {
    // A user decision (2026-08-10): the app launches sessions itself, and the
    // launched agent runs with --dangerously-skip-permissions unless turned off.
    // If this ever flips silently, sessions change behaviour with no visible cause.
    //
    // Task 4 (2026-08-17) changed the field's shape from a boolean
    // (`agent.skipPermissions`) to a free-text launch parameter per adapter id
    // (`agent.startArgs['claude-code']`), but not the guarantee this test guards: a fresh
    // install still starts with permissions skipped, now expressed as the equivalent flag.
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { configStore } = await import('../../src/main/config/config-store')
    expect(configStore.getAll().agent.startArgs['claude-code'])
      .toBe('--dangerously-skip-permissions')
  })

  it('laesst den Harness-Platz leer — die Vorgabe ist „das Preset entscheidet"', async () => {
    // Leer heisst genau das bisherige Verhalten: SESSION_CREATE loest die Laufzeit des Presets
    // auf und uebersteuert nichts. Eine Vorgabe mit Inhalt waere eine Verhaltensaenderung fuer
    // jede bestehende Installation.
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { configStore } = await import('../../src/main/config/config-store')
    expect(configStore.getAll().agent.harness).toBe('')
  })

  it('legt den Harness-Platz in einer aelteren Datei ohne Migration nach', async () => {
    // deepMerge legt einen fehlenden Schluessel aus den Vorgaben nach, und '' ist genau der
    // Zustand „nichts gewaehlt", den eine Datei von vor dieser Aenderung meint — dieselbe
    // Begruendung wie bei zuordnung.sitzungen.
    fs.writeFileSync(
      path.join(tmpDir, 'cipher-keel-config.json'),
      JSON.stringify({ agent: { startArgs: { 'claude-code': '' } } }),
    )
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { configStore } = await import('../../src/main/config/config-store')
    expect(configStore.getAll().agent.harness).toBe('')
  })
})
