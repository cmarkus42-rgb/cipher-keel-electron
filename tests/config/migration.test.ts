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
    const mod = await import('../../src/main/config/config-store')
    // Der Store laedt faul, und das bleibt so: `loadConfig` haengt ueber `getConfigPath`
    // an `app.getPath('userData')`, das beim Modulimport noch nicht verlaesslich ist.
    // Ein Test, der anschliessend nur die Datei liest, wuerde die Migration sonst nie
    // ausloesen — deshalb wird hier einmal angefasst. Der Produktivcode bleibt faul.
    mod.configStore.getAll()
    return mod
  }

  const gelesen = () => JSON.parse(fs.readFileSync(datei(), 'utf-8'))

  it('gibt einer frischen Config die Vorgabe-Startparameter, ohne skipPermissions', async () => {
    const { configStore } = await withConfig(null)
    // Eine frische Installation verhaelt sich wie die ausgelieferte Version seit
    // cipher-mux 0.9.x: die App startet ihre Sitzungen selbst, und in einem von ihr
    // gesteuerten tmux-Pane beantwortet niemand eine Berechtigungsrueckfrage.
    expect(configStore.get('agent').startArgs['claude-code'])
      .toBe('--dangerously-skip-permissions')
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
    // Auch auf der Platte: hier ist der Fall, in dem die Vorgabe die Entscheidung des
    // Nutzers ueberschreiben koennte, weil die Vorgabe das Flag traegt und er es nicht will.
    expect(gelesen().agent.startArgs['claude-code']).toBe('')
  })

  it('ist idempotent — ein zweiter Lauf aendert nichts', async () => {
    await withConfig({ agent: { skipPermissions: true } })
    const nachErstem = fs.readFileSync(datei(), 'utf-8')
    vi.resetModules()
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const zweiter = await import('../../src/main/config/config-store')
    zweiter.configStore.getAll()
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

  it('laesst lebende Bloecke unangetastet — im Speicher und auf der Platte', async () => {
    const { configStore } = await withConfig({
      agent: { skipPermissions: true },
      llm: { tagging: { host: '10.0.0.9', port: 11434, model: 'altwert' } },
      projects: { list: [{ id: 'p1', name: 'Probe', rootPath: '/tmp/p1' }], activeId: 'p1' },
    })
    expect(configStore.get('llm').tagging.model).toBe('altwert')
    expect(configStore.get('llm').tagging.host).toBe('10.0.0.9')

    // Die Platte ist der Punkt. Der zerstoererische Pfad dieser Aufgabe ist das
    // Zurueckschreiben, und ein Test, der nur configStore.get() prueft, wuerde nicht
    // bemerken, wenn statt der zusammengefuehrten Config die Vorgaben persistiert
    // wuerden — die tragen dasselbe Flag, aber weder Projekte noch Endpunkte.
    const roh = gelesen()
    expect(roh.llm.tagging.host).toBe('10.0.0.9')
    expect(roh.llm.tagging.model).toBe('altwert')
    expect(roh.projects.list).toHaveLength(1)
    expect(roh.projects.list[0].id).toBe('p1')
  })

  it('meldet fuer eine bereits migrierte Config, dass nichts zu tun war', async () => {
    // `migriere` ist ausdruecklich exportiert, um ohne Dateisystem pruefbar zu sein —
    // und die Idempotenz-Zusicherung des Docblocks lautet `veraendert: false`, nicht
    // "die Bytes sind gleich". Ein Neuschreiben identischer Bytes wuerde den
    // Byte-Vergleich bestehen und trotzdem bei jedem Start auf die Platte gehen.
    const { migriere } = await withConfig(null)
    const bereits = { agent: { startArgs: { 'claude-code': '--dangerously-skip-permissions' } } }
    expect(migriere(bereits).veraendert).toBe(false)
  })

  it('behaelt die gelesene Config, wenn das Schreiben der Migration scheitert', async () => {
    fs.writeFileSync(datei(), JSON.stringify({
      agent: { skipPermissions: true },
      llm: { tagging: { host: '10.0.0.9', port: 11434, model: 'altwert' } },
    }))
    // Nur die Datei schreibgeschuetzt, nicht das Verzeichnis: ein schreibgeschuetztes
    // Verzeichnis verhindert das Anlegen, nicht das Ueberschreiben einer vorhandenen
    // Datei. (Als root laeuft dieser Test nicht sinnvoll — dann greift der Schutz nicht.)
    fs.chmodSync(datei(), 0o400)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
      const { configStore } = await import('../../src/main/config/config-store')
      // Gelesen ist gelesen: es gilt die Datei, nicht der Vorgabenbaum.
      expect(configStore.get('llm').tagging.model).toBe('altwert')
      expect(configStore.get('agent').startArgs['claude-code'])
        .toBe('--dangerously-skip-permissions')
      expect(configStore.get('llm').tagging.host).toBe('10.0.0.9')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      fs.chmodSync(datei(), 0o600)
    }
  })
})
