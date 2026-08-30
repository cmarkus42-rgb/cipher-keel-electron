import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { istSchleifenAdapter } from '../../src/main/agent/agent-adapter'
import { runCommand } from '../../src/main/util/exec-util'

// Partial mock, same pattern used elsewhere in this repo (e.g. tests/service-lifecycle.test.ts):
// only runCommand is replaced, so postLaunchInjection's real fs writes still happen for real,
// and only the `claude` CLI invocation is intercepted — there is no real `claude` binary
// guaranteed in a test environment, and even if there were, this is not the process boundary
// these tests are about.
vi.mock('../../src/main/util/exec-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/util/exec-util')>()
  return { ...actual, runCommand: vi.fn().mockResolvedValue('') }
})

describe('ClaudeCodeAdapter launch command (entity prompt)', () => {
  const opts = { projectPath: '/tmp/p', sessionName: 'keel-demo-architect-ab12' }

  it('appends the system prompt file flag when a path is given', () => {
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    const cmd = adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.args).toContain('--append-system-prompt-file')
    expect(cmd.args[cmd.args.indexOf('--append-system-prompt-file') + 1]).toBe('/tmp/x.md')
  })

  it('omits the flag entirely when no path is given', () => {
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    const cmd = adapter.buildLaunchCommand(opts)
    expect(cmd.args).not.toContain('--append-system-prompt-file')
  })

  it('rejects an empty path instead of starting without a prompt', () => {
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    expect(() => adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '' }))
      .toThrow(/append-system-prompt-file/)
  })

  it('keeps the prompt path out of the executable name', () => {
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    const cmd = adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.cmd).toBe('claude')
  })

  it('reads skip-permissions from the injected reader, not from a hardcoded value', () => {
    const off = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    expect(off.buildLaunchCommand(opts).args).not.toContain('--dangerously-skip-permissions')

    const on = new ClaudeCodeAdapter({ getStartArgs: () => ['--dangerously-skip-permissions'] })
    expect(on.buildLaunchCommand(opts).args).toContain('--dangerously-skip-permissions')
  })
})

// The config reader is now a required constructor argument (see fix round 2): the adapter
// cannot get a skip-permissions value from anywhere except what it is handed, so the two
// directions are already covered by the tests above. What isn't covered yet is the new seam
// — AdapterRegistry passing its reader through to the ClaudeCodeAdapter it constructs.
describe('AdapterRegistry config wiring', () => {
  it('hands its config reader to the claude-code adapter', () => {
    const registry = new AdapterRegistry({ getStartArgs: () => ['--dangerously-skip-permissions'] })
    const adapter = registry.getDefault()
    // getDefault() always answers with the CLI adapter today — the default is
    // 'claude-code', which is a CliSitzungsAdapter. Narrowed rather than cast so a
    // future default of the loop kind fails this test instead of failing silently.
    if (istSchleifenAdapter(adapter)) throw new Error('default adapter is not a CLI adapter')
    const cmd = adapter.buildLaunchCommand({ projectPath: '/tmp/p', sessionName: 'keel-x' })
    expect(cmd.args).toContain('--dangerously-skip-permissions')
  })

  it('does not add the flag when its reader says no', () => {
    const registry = new AdapterRegistry({ getStartArgs: () => [] })
    const adapter = registry.getDefault()
    if (istSchleifenAdapter(adapter)) throw new Error('default adapter is not a CLI adapter')
    const cmd = adapter.buildLaunchCommand({ projectPath: '/tmp/p', sessionName: 'keel-x' })
    expect(cmd.args).not.toContain('--dangerously-skip-permissions')
  })
})

// postLaunchInjection (Paket B / I-2, security review 2026-08-30): two write paths, not
// three — the third (~/.claude/projects/<hash>/settings.json) was removed outright because
// Claude Code never reads settings from that directory (it holds session transcripts only).
describe('ClaudeCodeAdapter.postLaunchInjection', () => {
  let projectDir: string
  let ctx: { projectPath: string; mcpUrl: string; mcpApiKey: string; sessionId: string }

  beforeEach(() => {
    vi.mocked(runCommand).mockClear().mockResolvedValue('')
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-inject-'))
    ctx = {
      projectPath: projectDir,
      mcpUrl: 'http://127.0.0.1:54321/mcp',
      mcpApiKey: 'test-key-1234',
      sessionId: 'probe-session',
    }
  })

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('writes the project-local settings.local.json with the real url and key', async () => {
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    await adapter.postLaunchInjection(ctx)

    const written = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf-8'),
    )
    expect(written.mcpServers['cipher-keel']).toEqual({
      type: 'http',
      url: ctx.mcpUrl,
      headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
    })
  })

  it('merges into an existing settings.local.json instead of clobbering it', async () => {
    const claudeDir = path.join(projectDir, '.claude')
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify({ someOtherKey: 'kept' }),
    )

    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    await adapter.postLaunchInjection(ctx)

    const written = JSON.parse(
      fs.readFileSync(path.join(claudeDir, 'settings.local.json'), 'utf-8'),
    )
    expect(written.someOtherKey).toBe('kept')
    expect(written.mcpServers['cipher-keel'].url).toBe(ctx.mcpUrl)
  })

  it('registers via the claude CLI (mcp remove then mcp add-json)', async () => {
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    await adapter.postLaunchInjection(ctx)

    const calls = vi.mocked(runCommand).mock.calls
    expect(calls.some(([cmd, args]) => cmd === 'claude' && args?.[0] === 'mcp' && args?.[1] === 'remove')).toBe(true)
    const addCall = calls.find(([cmd, args]) => cmd === 'claude' && args?.[1] === 'add-json')
    expect(addCall).toBeDefined()
    const addArgs = addCall![1]!
    const serverJson = JSON.parse(addArgs[5] as string)
    expect(serverJson.headers.Authorization).toBe(`Bearer ${ctx.mcpApiKey}`)
  })

  it('does not write anything under ~/.claude/projects (I-2 — the removed third path)', async () => {
    // The path this test guards against reappearing used ctx.projectPath to derive a
    // directory name under the real home directory — snapshot that exact directory's
    // contents before and after, so a regression that brings the third write path back
    // shows up as a new entry here rather than requiring this test to guess the hash.
    const projectsDir = path.join(os.homedir(), '.claude', 'projects')
    const before = fs.existsSync(projectsDir) ? new Set(fs.readdirSync(projectsDir)) : new Set()

    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    await adapter.postLaunchInjection(ctx)

    const after = fs.existsSync(projectsDir) ? new Set(fs.readdirSync(projectsDir)) : new Set()
    expect(after).toEqual(before)
  })

  it('tolerates a failed CLI registration without throwing (path 1 already succeeded)', async () => {
    vi.mocked(runCommand).mockRejectedValue(new Error('claude: command not found'))
    const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })

    await expect(adapter.postLaunchInjection(ctx)).resolves.toEqual(expect.any(Function))

    const written = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf-8'),
    )
    expect(written.mcpServers['cipher-keel'].url).toBe(ctx.mcpUrl)
  })

  // I-1 follow-up (security review, 2026-08-30): the undo closure this method now returns.
  // Named "the leiche" by the review — a live bearer left in settings.local.json for a
  // session whose subsequent tmux.createSession failed, because moving injection ahead of
  // createSession (the original I-1 fix) made it possible to inject successfully and still
  // never have a session. Before that move this was structurally impossible: a failure
  // always happened before injection ever ran.
  describe('the undo closure (I-1 follow-up — the orphaned-injection case)', () => {
    const settingsPathFor = (dir: string) => path.join(dir, '.claude', 'settings.local.json')

    it('removes the cipher-keel entry entirely when there was none before', async () => {
      const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
      const undo = await adapter.postLaunchInjection(ctx)

      // Confirm the entry actually exists first — otherwise "it's gone after undo" would be
      // true for a trivial, wrong reason (it was never there).
      expect(
        JSON.parse(fs.readFileSync(settingsPathFor(projectDir), 'utf-8')).mcpServers['cipher-keel'],
      ).toBeDefined()

      undo()

      const after = JSON.parse(fs.readFileSync(settingsPathFor(projectDir), 'utf-8'))
      expect(after.mcpServers['cipher-keel']).toBeUndefined()
    })

    it('restores the previous entry instead of deleting it, when one already existed', async () => {
      // Simulates a second session in the SAME project, in the same app boot: an earlier,
      // still-valid session already wrote this exact entry. This is the case the review's
      // "Falle" warns about — a blind delete here would destroy a live sibling session's
      // registration, not just this failed session's own.
      const claudeDir = path.join(projectDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      const priorEntry = {
        type: 'http',
        url: 'http://127.0.0.1:11111/mcp',
        headers: { Authorization: 'Bearer prior-sessions-still-live-key' },
      }
      fs.writeFileSync(
        settingsPathFor(projectDir),
        JSON.stringify({ mcpServers: { 'cipher-keel': priorEntry } }),
      )

      const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
      const undo = await adapter.postLaunchInjection(ctx)

      // The new (failed) session's own key really did overwrite it in the meantime.
      expect(
        JSON.parse(fs.readFileSync(settingsPathFor(projectDir), 'utf-8')).mcpServers['cipher-keel'].url,
      ).toBe(ctx.mcpUrl)

      undo()

      const after = JSON.parse(fs.readFileSync(settingsPathFor(projectDir), 'utf-8'))
      expect(after.mcpServers['cipher-keel']).toEqual(priorEntry)
    })

    it('leaves keys other than cipher-keel untouched by the undo', async () => {
      const claudeDir = path.join(projectDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(settingsPathFor(projectDir), JSON.stringify({ someOtherKey: 'kept' }))

      const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
      const undo = await adapter.postLaunchInjection(ctx)
      undo()

      const after = JSON.parse(fs.readFileSync(settingsPathFor(projectDir), 'utf-8'))
      expect(after.someOtherKey).toBe('kept')
      expect(after.mcpServers['cipher-keel']).toBeUndefined()
    })

    it('is a safe no-op if settings.local.json is gone by the time undo runs', async () => {
      const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
      const undo = await adapter.postLaunchInjection(ctx)

      fs.rmSync(path.join(projectDir, '.claude'), { recursive: true, force: true })

      expect(() => undo()).not.toThrow()
    })

    // Fixrunde zu 4358cac, Befund 2: bis dahin gab die Closure `void` zurueck, und der
    // Aufrufer behauptete die Ruecknahme deshalb unbedingt — auch dort, wo sie still
    // ausgestiegen war. Der Rueckgabewert bedeutet genau einen Satz:
    // "settings.local.json traegt keinen Eintrag aus diesem Versuch mehr."
    describe('was die Closure meldet (Befund 2 der Fixrunde zu 4358cac)', () => {
      it('meldet true, wenn der Vorzustand wiederhergestellt wurde', async () => {
        const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
        const undo = await adapter.postLaunchInjection(ctx)

        expect(undo()).toBe(true)
        expect(
          JSON.parse(fs.readFileSync(settingsPathFor(projectDir), 'utf-8')).mcpServers['cipher-keel'],
        ).toBeUndefined()
      })

      it('meldet true, wenn Pfad 1 nie geschrieben hat — dann ist die Aussage trivial wahr', async () => {
        // projectPath zeigt auf eine Datei, nicht auf ein Verzeichnis: mkdirSync wirft,
        // Pfad 1 steigt in seinen catch aus, undoSettingsWrite bleibt null.
        const dateiStattVerzeichnis = path.join(projectDir, 'kein-verzeichnis')
        fs.writeFileSync(dateiStattVerzeichnis, 'x', 'utf-8')

        const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
        const undo = await adapter.postLaunchInjection({ ...ctx, projectPath: dateiStattVerzeichnis })

        expect(undo()).toBe(true)
      })

      it('meldet true, wenn die Datei zur Ruecknahme gar nicht mehr existiert', async () => {
        // ENOENT ist der eine Lesefehler, bei dem die Aussage beweisbar stimmt: eine Datei,
        // die es nicht gibt, traegt keinen Eintrag. Alles andere ist unten false.
        const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
        const undo = await adapter.postLaunchInjection(ctx)

        fs.rmSync(path.join(projectDir, '.claude'), { recursive: true, force: true })

        expect(undo()).toBe(true)
      })

      it('meldet false und warnt, wenn die Datei nicht mehr lesbar ist', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
          const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
          const undo = await adapter.postLaunchInjection(ctx)

          fs.writeFileSync(settingsPathFor(projectDir), '{ kaputt', 'utf-8')

          expect(undo()).toBe(false)
          expect(warn).toHaveBeenCalled()
        } finally {
          warn.mockRestore()
        }
      })

      it('meldet false und warnt, wenn mcpServers verschwunden oder kein Objekt ist', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
          const adapter = new ClaudeCodeAdapter({ getStartArgs: () => [] })
          const undo = await adapter.postLaunchInjection(ctx)

          fs.writeFileSync(settingsPathFor(projectDir), JSON.stringify({ mcpServers: 'kaputt' }), 'utf-8')

          expect(undo()).toBe(false)
          expect(warn).toHaveBeenCalled()
        } finally {
          warn.mockRestore()
        }
      })
    })
  })
})

// Die Prompt-Datei ist seit der Fixrunde vom 2026-08-30 eine Pflichtmethode auf
// CliSitzungsAdapter: SESSION_CREATE rief bis dahin writeEntityPromptFile selbst und
// entschied damit im Handler, welches Dateiformat ein Harness bekommt — eine Entscheidung,
// die der naechste fremde Harness stillschweigend falsch geerbt haette. Fuer Claude Code
// muss dieser Umbau bis auf das Byte folgenlos sein, und genau das prueft der Test hier:
// nicht "gruen", sondern gleich.
describe('ClaudeCodeAdapter schreibt die Entitaets-Prompt-Datei', () => {
  let tmp: string
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-claude-prompt-')) })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('schreibt Byte fuer Byte dasselbe wie writeEntityPromptFile, an denselben Pfad', async () => {
    const { writeEntityPromptFile } = await import('../../src/main/session/prompt-file')
    // Das Fixture traegt absichtlich ein echtes Mehrbyte-Zeichen, obwohl Kommentare und
    // Bezeichner in diesem Quelltext sonst ae/oe/ue schreiben: der Byte-Vergleich unten
    // pruefte ohne eines von beiden nichts, was ueber ASCII hinausgeht, und eine
    // Normalisierung auf einem der beiden Schreibwege fiele genau hier auf und sonst
    // nirgends. Kein Verstoss gegen die Konvention, sondern ihr Grenzfall.
    const prompt = '# Entitaet\n\nEin Prompt mit Umlaut (ä), einem Dollar,\n' +
      'einem CRLF-Rest\r\nund einem Abschluss ohne Zeilenumbruch.'

    const vorher = path.join(tmp, 'vorher')
    const nachher = path.join(tmp, 'nachher')
    const alt = writeEntityPromptFile(vorher, 'keel-demo-architekt-ab12', prompt)
    const neu = new ClaudeCodeAdapter({ getStartArgs: () => [] })
      .schreibeEntitaetsPromptDatei(nachher, 'keel-demo-architekt-ab12', prompt)

    expect(path.relative(nachher, neu)).toBe(path.relative(vorher, alt))
    expect(Buffer.compare(fs.readFileSync(alt), fs.readFileSync(neu))).toBe(0)
    expect(fs.statSync(neu).mode & 0o777).toBe(fs.statSync(alt).mode & 0o777)
  })

  it('nennt den Ort seiner MCP-Einspritzung, statt ihn dem Aufrufer zu ueberlassen', () => {
    const a = new ClaudeCodeAdapter({ getStartArgs: () => [] })
    expect(a.mcpEinspritzung?.ort).toBe('.claude/settings.local.json')
    // Pfad 2 (claude mcp add-json) wird nicht zurueckgenommen — der Satz darueber ist
    // Claude-Wissen und stand bis zur Fixrunde im Handler.
    expect(a.mcpEinspritzung?.nichtZuruecknehmbarerRest).toMatch(/claude-CLI/)
  })
})
