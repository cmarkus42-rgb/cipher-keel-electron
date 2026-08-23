import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { istSchleifenAdapter } from '../../src/main/agent/agent-adapter'

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
