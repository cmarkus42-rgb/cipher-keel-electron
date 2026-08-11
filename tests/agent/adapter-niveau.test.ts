import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import { NanoClawChannelAdapter } from '../../src/main/nanoclaw/adapter'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

// M2 section 11.3 assigns a niveau per adapter: Claude Code is the only harness with
// native SKILL.md lazy-loading (A); every other adapter in the garden is B. Making it a
// declared property is what lets session:create pick the niveau from the harness that
// will actually run, instead of defaulting every session to A.
describe('adapter niveau declaration (M2 section 11.3)', () => {
  it('ClaudeCodeAdapter runs at Niveau A', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => true })
    expect(adapter.niveau).toBe(CapabilityNiveau.A)
  })

  it('NanoClawChannelAdapter runs at Niveau B', () => {
    const adapter = new NanoClawChannelAdapter(new NanoClawBridge('/tmp/does-not-exist.sock'))
    expect(adapter.niveau).toBe(CapabilityNiveau.B)
  })
})
