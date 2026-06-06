/**
 * CF Risk Review — create gate_befund nodes with gate_typ 'risk-review'.
 * CK-P3CF-005
 */

import { estimateTokenCount } from '../capability-schema'
import type { GraphWriter } from '../../graph/writer'

export interface RiskReviewInput {
  phaseUid: string
  risiko: string
  wahrscheinlichkeit: 'hoch' | 'mittel' | 'niedrig'
  impact: 'hoch' | 'mittel' | 'niedrig'
  massnahme: string
  befundStatement: string
}

export function createRiskReview(
  writer: GraphWriter,
  input: RiskReviewInput,
): { uid: string } {
  const tokens = estimateTokenCount(input.befundStatement)
  if (tokens > 200) {
    throw new Error(`befund_statement exceeds 200 token limit (estimated: ${tokens})`)
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-')
  const result = writer.upsertNode({
    kind: 'gate_befund',
    title: `Risk Review: ${input.risiko.slice(0, 60)}`,
    path: `/risk-reviews/${timestamp}.md`,
    frontmatter: {
      phase_uid: input.phaseUid,
      strukturell: 'gruen',
      gate_typ: 'risk-review',
      risiko: input.risiko,
      wahrscheinlichkeit: input.wahrscheinlichkeit,
      impact: input.impact,
      massnahme: input.massnahme,
      befund_statement: input.befundStatement,
    },
  })

  return { uid: result.uid }
}
