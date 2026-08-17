// tests/renderer/phase5-statusbar.test.ts
import { describe, it, expect } from 'vitest'

// Pure logic tests — no React rendering (we test the StatusBar's data contract)
describe('StatusBar Extensions (CK-UI-030)', () => {
  // Removed with the NanoClaw subsystem (2026-08-17): STATUS_COLORS and its only
  // consumer, NanoClawIndicator, are both gone from StatusBar.tsx. This coverage
  // returns only if a future subsystem indicator reintroduces a connected /
  // disconnected / connecting color contract in that file.

  it('session count is a number', () => {
    const sessionCount = 3
    expect(typeof sessionCount).toBe('number')
    expect(sessionCount).toBeGreaterThanOrEqual(0)
  })
})
