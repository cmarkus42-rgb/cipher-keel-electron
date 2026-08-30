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

    await expect(adapter.postLaunchInjection(ctx)).resolves.toBeUndefined()

    const written = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf-8'),
    )
    expect(written.mcpServers['cipher-keel'].url).toBe(ctx.mcpUrl)
  })
})
