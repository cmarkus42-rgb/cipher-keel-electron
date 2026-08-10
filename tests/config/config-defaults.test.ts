import { describe, it, expect, vi } from 'vitest'

// config-store imports electron at module scope; the tests never touch a real app.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/keel-config-test' } }))

describe('agent config defaults', () => {
  it('defaults skipPermissions to true', async () => {
    // A user decision (2026-08-10): the app launches sessions itself, and the
    // launched agent runs with --dangerously-skip-permissions unless turned off.
    // If this ever flips silently, sessions change behaviour with no visible cause.
    const { configStore } = await import('../../src/main/config/config-store')
    expect(configStore.getAll().agent.skipPermissions).toBe(true)
  })
})
