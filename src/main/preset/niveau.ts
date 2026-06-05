/**
 * CapabilityNiveau — three levels A, B, C.
 *
 * Each niveau determines body form and loader strategy.
 * A: Full Claude Code — CLAUDE.md auto-loaded, native lazy loading
 * B: Harness-native — manual lazy loading
 * C: Instruction file — inline capabilities, minimal token budget
 *
 * CK-ENT-003
 */

export enum CapabilityNiveau {
  /** Full Claude Code harness — CLAUDE.md + SKILL.md native lazy-loading */
  A = 'A',
  /** Harness-native files or channel payload — manual lazy-loading */
  B = 'B',
  /** Short instruction file — inline capabilities, tight token budget */
  C = 'C',
}

export type BodyForm = 'CLAUDE.md' | 'harness-native' | 'Instruktionsdatei'
export type LoaderStrategie = 'nativ' | 'manuell' | 'inline'

export interface NiveauConfig {
  bodyForm: BodyForm
  loaderStrategie: LoaderStrategie
}

const NIVEAU_CONFIGS: Record<CapabilityNiveau, NiveauConfig> = {
  [CapabilityNiveau.A]: { bodyForm: 'CLAUDE.md', loaderStrategie: 'nativ' },
  [CapabilityNiveau.B]: { bodyForm: 'harness-native', loaderStrategie: 'manuell' },
  [CapabilityNiveau.C]: { bodyForm: 'Instruktionsdatei', loaderStrategie: 'inline' },
}

export function getNiveauConfig(niveau: CapabilityNiveau): NiveauConfig {
  return NIVEAU_CONFIGS[niveau]
}
