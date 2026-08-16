import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
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

  // 'NanoClawChannelAdapter runs at Niveau B' removed with the NanoClaw subsystem
  // (2026-08-17): NanoClawChannelAdapter is gone. This coverage — a non-Claude adapter
  // declaring niveau B — returns once keel's own harness (the successor announced in
  // model-resolver.ts and c-worker.ts) ships an AgentAdapter of its own.
})
