import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Config-Migration', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-migration-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const datei = () => path.join(tmpDir, 'cipher-keel-config.json')

  async function withConfig(cfg: unknown) {
    if (cfg !== null) fs.writeFileSync(datei(), JSON.stringify(cfg, null, 2))
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    return import('../../src/main/config/config-store')
  }

  const gelesen = () => JSON.parse(fs.readFileSync(datei(), 'utf-8'))

  it('gibt einer frischen Config leere Startparameter, ohne skipPermissions', async () => {
    const { configStore } = await withConfig(null)
    expect(configStore.get('agent').startArgs).toEqual({})
    expect((configStore.get('agent') as Record<string, unknown>).skipPermissions).toBeUndefined()
  })

  it('uebersetzt skipPermissions true in das Flag und schreibt die Datei zurueck', async () => {
    const { configStore } = await withConfig({ agent: { skipPermissions: true } })
    expect(configStore.get('agent').startArgs['claude-code']).toBe('--dangerously-skip-permissions')
    expect(gelesen().agent.skipPermissions).toBeUndefined()
    expect(gelesen().agent.startArgs['claude-code']).toBe('--dangerously-skip-permissions')
  })

  it('uebersetzt skipPermissions false in einen leeren Startparameter', async () => {
    const { configStore } = await withConfig({ agent: { skipPermissions: false } })
    expect(configStore.get('agent').startArgs['claude-code']).toBe('')
  })

  it('ist idempotent — ein zweiter Lauf aendert nichts', async () => {
    await withConfig({ agent: { skipPermissions: true } })
    const nachErstem = fs.readFileSync(datei(), 'utf-8')
    vi.resetModules()
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    await import('../../src/main/config/config-store')
    expect(fs.readFileSync(datei(), 'utf-8')).toBe(nachErstem)
  })

  it('laesst ein von Hand gesetztes startArgs gewinnen und entfernt den Altwert kommentarlos', async () => {
    const { configStore } = await withConfig({
      agent: { skipPermissions: true, startArgs: { 'claude-code': '--resume' } },
    })
    expect(configStore.get('agent').startArgs['claude-code']).toBe('--resume')
    expect(gelesen().agent.skipPermissions).toBeUndefined()
  })

  it('entfernt die toten Bloecke aus der Datei', async () => {
    await withConfig({
      ui: { theme: 'dark' }, mcp: { port: 3100 },
      app: { maxSessions: 12 }, windows: { main: { x: 0, y: 0, width: 1, height: 1 } },
      agent: { skipPermissions: true },
    })
    const roh = gelesen()
    expect(roh.ui).toBeUndefined()
    expect(roh.mcp).toBeUndefined()
    expect(roh.app).toBeUndefined()
    expect(roh.windows).toBeUndefined()
  })

  it('laesst lebende Bloecke unangetastet', async () => {
    const { configStore } = await withConfig({
      agent: { skipPermissions: true },
      llm: { tagging: { host: '10.0.0.9', port: 11434, model: 'altwert' } },
    })
    expect(configStore.get('llm').tagging.model).toBe('altwert')
    expect(configStore.get('llm').tagging.host).toBe('10.0.0.9')
  })
})
