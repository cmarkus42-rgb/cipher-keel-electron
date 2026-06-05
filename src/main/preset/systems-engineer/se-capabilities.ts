/**
 * SE Capability Packages per Niveau.
 *
 * Niveau A (8): full set — graph-navigation-advanced + steuer-ueberblick-tool included
 * Niveau B (6): without graph-navigation-advanced and steuer-ueberblick-tool
 * Niveau C (1): se-core-identity only (≤ 500 tokens inline)
 *
 * Phase 3c / Task 7
 */

/** All 8 capability package IDs available at Niveau A. */
export const SE_CAPABILITIES_A = [
  'se-core-identity',
  'gate-urteil-guide',
  'trigger-zeiger-format',
  'steuer-ueberblick-tool',
  'companion-memory-tools',
  'handoff-logik-guide',
  'rolling-summary',
  'graph-navigation-advanced',
] as const

/** 6 capability package IDs for Niveau B (no graph-navigation-advanced, no steuer-ueberblick-tool). */
export const SE_CAPABILITIES_B = [
  'se-core-identity',
  'gate-urteil-guide',
  'trigger-zeiger-format',
  'companion-memory-tools',
  'handoff-logik-guide',
  'rolling-summary',
] as const

/** 1 capability package ID for Niveau C — inline only, max 500 tokens. */
export const SE_CAPABILITIES_C = [
  'se-core-identity',
] as const

/**
 * Returns the capability package IDs for the given SE Niveau.
 *
 * @param niveau - 'A' | 'B' | 'C'
 */
export function getSECapabilities(niveau: 'A' | 'B' | 'C'): string[] {
  switch (niveau) {
    case 'A': return [...SE_CAPABILITIES_A]
    case 'B': return [...SE_CAPABILITIES_B]
    case 'C': return [...SE_CAPABILITIES_C]
  }
}
