import Module from 'module'
import * as path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResolveFilename = (this: unknown, request: string, ...rest: any[]) => string

describe('ClaudeCodeAdapter launch command (entity prompt)', () => {
  const opts = { projectPath: '/tmp/p', sessionName: 'keel-demo-architect-ab12' }

  it('appends the system prompt file flag when a path is given', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.args).toContain('--append-system-prompt-file')
    expect(cmd.args[cmd.args.indexOf('--append-system-prompt-file') + 1]).toBe('/tmp/x.md')
  })

  it('omits the flag entirely when no path is given', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand(opts)
    expect(cmd.args).not.toContain('--append-system-prompt-file')
  })

  it('rejects an empty path instead of starting without a prompt', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    expect(() => adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '' }))
      .toThrow(/append-system-prompt-file/)
  })

  it('keeps the prompt path out of the executable name', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.cmd).toBe('claude')
  })

  it('reads skip-permissions from the injected reader, not from a hardcoded value', () => {
    const off = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    expect(off.buildLaunchCommand(opts).args).not.toContain('--dangerously-skip-permissions')

    const on = new ClaudeCodeAdapter({ getSkipPermissions: () => true })
    expect(on.buildLaunchCommand(opts).args).toContain('--dangerously-skip-permissions')
  })
})

// Production constructs the adapter with no reader — see src/main/agent/registry.ts:18 —
// which is the only path that reaches `defaultConfigReader.getSkipPermissions()`, the one
// line that actually calls `configStore.get('agent').skipPermissions` via a lazy `require`.
// None of the tests above exercise it: they all inject an explicit reader. This block does.
//
// `vi.doMock`/`vi.resetModules()` do NOT reach this: they operate on Vite's own SSR module
// graph, and the bare `require(...)` in claude-code.ts's defaultConfigReader is a genuine,
// unpatched Node `require` (bound via `createRequire`, confirmed by its native
// "Cannot find module" error format) that bypasses that graph entirely — verified by probing
// during this fix round. Vite's `resolve.extensions` and `vi.doMock('electron', ...)` both
// have zero effect on it. Node's own module cache is the only layer left to intercept at, so
// that is what this test patches: `Module._resolveFilename` is temporarily redirected so the
// exact specifier `require`d by claude-code.ts resolves to a synthetic module, pre-seeded in
// `require.cache`, standing in for the real config-store module.
describe('ClaudeCodeAdapter default config reader', () => {
  const targetSpecifier = '../../config/config-store'
  const fakeResolvedPath = path.resolve(__dirname, '__mock-config-store__.js')
  let originalResolveFilename: ResolveFilename

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalResolveFilename = (Module as any)._resolveFilename
  })

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Module as any)._resolveFilename = originalResolveFilename
    delete require.cache[fakeResolvedPath]
  })

  function stubConfigStore(skipPermissions: boolean): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Module as any)._resolveFilename = function (
      this: unknown,
      request: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...rest: any[]
    ) {
      if (request === targetSpecifier) return fakeResolvedPath
      return originalResolveFilename.call(this, request, ...rest)
    }
    require.cache[fakeResolvedPath] = {
      id: fakeResolvedPath,
      filename: fakeResolvedPath,
      loaded: true,
      exports: { configStore: { get: () => ({ skipPermissions }) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('reads skip-permissions from the config store when the config says true', () => {
    stubConfigStore(true)
    const adapter = new ClaudeCodeAdapter()
    const cmd = adapter.buildLaunchCommand({ projectPath: '/tmp/p', sessionName: 'keel-x' })
    expect(cmd.args).toContain('--dangerously-skip-permissions')
  })

  it('reads skip-permissions from the config store when the config says false', () => {
    stubConfigStore(false)
    const adapter = new ClaudeCodeAdapter()
    const cmd = adapter.buildLaunchCommand({ projectPath: '/tmp/p', sessionName: 'keel-x' })

    // The load-bearing half: only the stubbed configStore's return value differs from the
    // test above. If defaultConfigReader ever hardened back into a constant, this assertion
    // — and only this one — would flip and fail, proving the value tracks the config store.
    expect(cmd.args).not.toContain('--dangerously-skip-permissions')
  })
})
