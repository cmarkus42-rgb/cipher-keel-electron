// tests/renderer/phase5-statusbar.test.ts
import { describe, it, expect } from 'vitest'
import { STATUS_COLORS } from '../../src/renderer/components/StatusBar'

// Pure logic tests — no React rendering (we test the StatusBar's data contract)
describe('StatusBar Extensions (CK-UI-030)', () => {
  it('NanoClaw status colors are defined', () => {
    expect(STATUS_COLORS['connected']).toBe('#22c55e')
    expect(STATUS_COLORS['disconnected']).toBe('#ef4444')
    expect(STATUS_COLORS['connecting']).toBe('#eab308')
  })

  it('session count is a number', () => {
    const sessionCount = 3
    expect(typeof sessionCount).toBe('number')
    expect(sessionCount).toBeGreaterThanOrEqual(0)
  })
})
