/**
 * session-create-injection-rollback-echt.test.ts — die Zusicherung, die wirklich zaehlt.
 *
 * session-create-injection-rollback.test.ts prueft, dass der Handler eine *gemockte*
 * Rueckgabe-Closure ruft; tests/agent/claude-code-adapter.test.ts prueft die echte Closure
 * *isoliert*. Zwischen beiden lag bis zur Fixrunde zu 4358cac niemand: kein Test spannte
 * echten Handler und echten Adapter zusammen und sah nach, was danach wirklich in der Datei
 * steht. Genau das macht diese Datei — Behauptung gegen Dateiinhalt, nicht gegen einen Spy:
 * **nach einem gescheiterten Sitzungsstart liegt kein Eintrag mehr in settings.local.json.**
 *
 * Seit Paket D ist der Eintrag kein Geheimnis mehr, sondern ein Startbefehl fuer die
 * stdio-Bruecke; ein Rueckstand ist damit Unordnung statt Offenlegung. Die Zusage bleibt
 * dieselbe und wird weiter geprueft — sie war nie nur eine ueber Vertraulichkeit, sondern
 * eine darueber, dass eine Sitzung, die es nie gab, auch nichts hinterlaesst.
 *
 * Zwei Scheiterstellen, nicht eine — die zweite ist der Befund, um den es geht:
 *   - tmux.createSession wirft (das schon abgedeckte Fenster)
 *   - tmux.connect wirft (kein tmux-Server, tmux nicht installiert — der wahrscheinlichste
 *     tmux-Fehler ueberhaupt). Der lag bis zu dieser Runde ausserhalb jeder Ruecknahme.
 *
 * `runCommand` bleibt gemockt, obwohl der Adapter es seit Paket D nicht mehr ruft: der Mock
 * kostet nichts und faengt eine Rueckkehr von Pfad 2 ab, bevor sie in die echte
 * Nutzerkonfiguration unter ~/.claude.json schreibt. `isCommandOnPath` ebenso, damit der
 * isAvailable()-Gate im Handler nicht davon abhaengt, ob auf dieser Maschine ein `claude`
 * liegt.
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

/** Der Socketpfad dieses App-Starts — das, was nach einem Fehlstart nicht liegenbleiben darf. */
const BOOT_SOCK = '/tmp/keel-test-sock-der-nicht-liegenbleiben-darf.sock'

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null }>

describe('session:create — echter Adapter, echter Handler: kein Rueckstand nach gescheitertem Start', () => {
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
      mcpHttpServer: {
        sockelPfad: BOOT_SOCK,
        brueckenBefehl: {
          command: '/pfad/zu/electron',
          args: ['/pfad/zu/resources/mcp-bridge.mjs', BOOT_SOCK],
          env: { ELECTRON_RUN_AS_NODE: '1' },
        },
      },
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

  it('laesst nach gescheitertem createSession keinen Eintrag in settings.local.json zurueck', async () => {
    const handler = await ladeHandler(tmuxDerVerbindetUndScheitert())

    const result = await handler({}, { entityId: 'architect', name: 'echt-rollback-1', cwd: projectDir })

    expect(result.id).toBeNull()
    expect(dateiText()).not.toContain(BOOT_SOCK)
  })

  it('laesst nach geworfenem tmux.connect keinen Eintrag in settings.local.json zurueck', async () => {
    const tmux = tmuxOhneServer()
    const handler = await ladeHandler(tmux)

    const result = await handler({}, { entityId: 'architect', name: 'echt-rollback-2', cwd: projectDir })

    expect(result.id).toBeNull()
    expect(tmux.createSession).not.toHaveBeenCalled()
    expect(dateiText()).not.toContain(BOOT_SOCK)
  })

  it('laesst auch dann keinen Eintrag liegen, wenn die Datei vorher kaputtes JSON enthielt', async () => {
    fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true })
    fs.writeFileSync(settingsPath(), '{ das ist kein JSON', 'utf-8')

    const handler = await ladeHandler(tmuxDerVerbindetUndScheitert())

    await handler({}, { entityId: 'architect', name: 'echt-rollback-3', cwd: projectDir })

    expect(dateiText()).not.toContain(BOOT_SOCK)
  })

  it('nennt die gelungene Ruecknahme und keinen Rest mehr — Pfad 2 gibt es nicht', async () => {
    // Bis Paket D stand hier ein Satz ueber den Rueckstand, den `claude mcp add-json`
    // hinterlassen konnte und den keine Ruecknahme erreichte. Der Weg ist weg, also der
    // Rueckstand auch. Der Test dreht sich mit: er haelt jetzt fest, dass die Meldung die
    // Ruecknahme benennt und NICHT mehr vor etwas warnt, das es nicht gibt.
    const handler = await ladeHandler(tmuxDerVerbindetUndScheitert())

    const result = await handler({}, { entityId: 'architect', name: 'echt-rollback-4', cwd: projectDir })

    expect(result.error).toContain('tmux: create-session failed')
    expect(result.error).toContain('zurueckgenommen')
    expect(result.error).not.toMatch(/claude-CLI/)
  })
})
