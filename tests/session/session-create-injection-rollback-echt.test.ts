/**
 * session-create-injection-rollback-echt.test.ts — die Zusicherung, die wirklich zaehlt.
 *
 * session-create-injection-rollback.test.ts prueft, dass der Handler eine *gemockte*
 * Rueckgabe-Closure ruft; tests/agent/claude-code-adapter.test.ts prueft die echte Closure
 * *isoliert*. Zwischen beiden lag bis zur Fixrunde zu 4358cac niemand: kein Test spannte
 * echten Handler und echten Adapter zusammen und sah nach, was danach wirklich in der Datei
 * steht. Genau das macht diese Datei — Behauptung gegen Dateiinhalt, nicht gegen einen Spy:
 * **nach einem gescheiterten Sitzungsstart liegt kein Bearer mehr in settings.local.json.**
 *
 * Zwei Scheiterstellen, nicht eine — die zweite ist der Befund, um den es geht:
 *   - tmux.createSession wirft (das schon abgedeckte Fenster)
 *   - tmux.connect wirft (kein tmux-Server, tmux nicht installiert — der wahrscheinlichste
 *     tmux-Fehler ueberhaupt). Der lag bis zu dieser Runde ausserhalb jeder Ruecknahme.
 *
 * `runCommand` ist hier zwingend gemockt: `claude` ist auf Entwicklermaschinen installiert,
 * und ein Test, der Pfad 2 wirklich laufen liesse, schriebe in die echte Nutzerkonfiguration
 * unter ~/.claude.json. `isCommandOnPath` ebenso, damit der isAvailable()-Gate im Handler
 * nicht davon abhaengt, ob auf dieser Maschine ein `claude` liegt.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/main/util/exec-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/util/exec-util')>()
  return {
    ...actual,
    runCommand: vi.fn().mockResolvedValue(''),
    isCommandOnPath: vi.fn(() => true),
  }
})

const BOOT_KEY = 'test-boot-key-der-nicht-liegenbleiben-darf'

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null }>

describe('session:create — echter Adapter, echter Handler: kein Bearer nach gescheitertem Start', () => {
  let userDataDir: string
  let projectDir: string

  const settingsPath = () => path.join(projectDir, '.claude', 'settings.local.json')
  const dateiText = () => (fs.existsSync(settingsPath()) ? fs.readFileSync(settingsPath(), 'utf-8') : '')

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  /**
   * Kein Mock auf ../../src/main/agent/registry — das ist der Punkt dieser Datei: der
   * Handler baut sich die echte AdapterRegistry und damit den echten ClaudeCodeAdapter.
   */
  async function ladeHandler(tmux: Record<string, unknown>): Promise<SessionCreateHandler> {
    let registeredHandler: SessionCreateHandler | undefined

    vi.doMock('electron', () => ({
      app: { getPath: () => userDataDir },
      ipcMain: {
        handle: (channel: string, fn: SessionCreateHandler) => {
          if (channel === 'session:create') registeredHandler = fn
        },
        on: () => {},
      },
      BrowserWindow: class {},
      dialog: {},
    }))

    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')
    registerIpcHandlers({
      tmux,
      mcpHttpServer: { url: 'http://127.0.0.1:54321/mcp', apiKey: BOOT_KEY },
    } as never)

    expect(registeredHandler).toBeDefined()
    return registeredHandler!
  }

  const tmuxDerVerbindetUndScheitert = () => ({
    listSessions: vi.fn(),
    isConnected: vi.fn(() => true),
    connect: vi.fn(),
    createSession: vi.fn().mockRejectedValue(new Error('tmux: create-session failed')),
    watchSession: vi.fn(),
  })

  const tmuxOhneServer = () => ({
    listSessions: vi.fn(),
    isConnected: vi.fn(() => false),
    connect: vi.fn().mockRejectedValue(new Error('tmux: no server running')),
    createSession: vi.fn(),
    watchSession: vi.fn(),
  })

  it('laesst nach gescheitertem createSession keinen Bearer in settings.local.json zurueck', async () => {
    const handler = await ladeHandler(tmuxDerVerbindetUndScheitert())

    const result = await handler({}, { entityId: 'architect', name: 'echt-rollback-1', cwd: projectDir })

    expect(result.id).toBeNull()
    expect(dateiText()).not.toContain(BOOT_KEY)
  })

  it('laesst nach geworfenem tmux.connect keinen Bearer in settings.local.json zurueck', async () => {
    const tmux = tmuxOhneServer()
    const handler = await ladeHandler(tmux)

    const result = await handler({}, { entityId: 'architect', name: 'echt-rollback-2', cwd: projectDir })

    expect(result.id).toBeNull()
    expect(tmux.createSession).not.toHaveBeenCalled()
    expect(dateiText()).not.toContain(BOOT_KEY)
  })

  it('laesst auch dann keinen Bearer liegen, wenn die Datei vorher kaputtes JSON enthielt', async () => {
    fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true })
    fs.writeFileSync(settingsPath(), '{ das ist kein JSON', 'utf-8')

    const handler = await ladeHandler(tmuxDerVerbindetUndScheitert())

    await handler({}, { entityId: 'architect', name: 'echt-rollback-3', cwd: projectDir })

    expect(dateiText()).not.toContain(BOOT_KEY)
  })

  it('benennt den Rest, den Pfad 2 hinterlassen haben kann, in der Fehlermeldung', async () => {
    const handler = await ladeHandler(tmuxDerVerbindetUndScheitert())

    const result = await handler({}, { entityId: 'architect', name: 'echt-rollback-4', cwd: projectDir })

    expect(result.error).toContain('tmux: create-session failed')
    expect(result.error).toMatch(/claude-CLI registrierter Eintrag/)
  })
})
