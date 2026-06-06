import { describe, it, expect } from 'vitest'
import {
  ARCHITECT_SUMMARY_CONFIG,
  CF_SUMMARY_CONFIG,
} from '../src/main/preset/shared/rolling-summary'

describe('Phase 4a Rolling Summary Configs', () => {
  it('ARCHITECT_SUMMARY_CONFIG is pflicht', () => {
    expect(ARCHITECT_SUMMARY_CONFIG.pflicht).toBe(true)
  })

  it('ARCHITECT_SUMMARY_CONFIG has correct updateTriggers', () => {
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('coaching-antwort')
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('drift-befund')
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('adr-update')
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('welle-abschluss')
  })

  it('ARCHITECT_SUMMARY_CONFIG has correct summaryFields', () => {
    expect(ARCHITECT_SUMMARY_CONFIG.summaryFields).toEqual([
      'subsystem_status', 'aktive_adrs', 'offene_coaching', 'drift_findings',
    ])
  })

  it('CF_SUMMARY_CONFIG is not pflicht', () => {
    expect(CF_SUMMARY_CONFIG.pflicht).toBe(false)
  })

  it('CF_SUMMARY_CONFIG has autoActivateAfterWelle', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((CF_SUMMARY_CONFIG as any).autoActivateAfterWelle).toBe(3)
  })

  it('CF_SUMMARY_CONFIG has correct updateTriggers', () => {
    expect(CF_SUMMARY_CONFIG.updateTriggers).toContain('welle-abschluss')
    expect(CF_SUMMARY_CONFIG.updateTriggers).toContain('risk-review')
    expect(CF_SUMMARY_CONFIG.updateTriggers).toContain('worker-rotation')
  })

  it('CF_SUMMARY_CONFIG has correct summaryFields', () => {
    expect(CF_SUMMARY_CONFIG.summaryFields).toEqual([
      'wellen_abgeschlossen', 'aktive_worker', 'blockierte_subsysteme', 'offene_fragen',
    ])
  })
})
