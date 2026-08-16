/**
 * Plausibility Inference — the content half of the process gates (CK-PROC-006): a local
 * model judges whether an Umsetzung plausibly carries its Anforderung, alongside (never
 * combined with) the structural Befund. Signal: 'traegt' | 'fraglich' | null.
 *
 * `BridgeLike` below is duck-typed to the shape of NanoClaw's message channel, the
 * carrier this module was written against before NanoClaw was superseded on 2026-08-16.
 * There are zero imports here, so nothing broke when that carrier was removed — but
 * nothing was rewired either. This module has no production caller.
 *
 * Rewiring it onto today's model layer (the one-shot worker and its return contract,
 * see c-worker.ts) is an open design question, not decided here: which runner serves the
 * call, what contract replaces `BridgeLike`, and who invokes this in the gate pipeline.
 */

export type PlausibilitySignal = 'traegt' | 'fraglich'

interface BridgeLike {
  isConnected(): boolean
  sendMessage(msg: { content: string }): Promise<{ content: string } | null>
}

export function buildInferencePrompt(anforderung: string, umsetzung: string): string {
  return [
    'Beurteile ob die folgende Umsetzung die Anforderung inhaltlich traegt.',
    'Antworte NUR mit "traegt" oder "fraglich".',
    '',
    '## Anforderung',
    anforderung,
    '',
    '## Umsetzung',
    umsetzung,
  ].join('\n')
}

export async function inferPlausibility(
  bridge: BridgeLike,
  anforderung: string,
  umsetzung: string,
): Promise<PlausibilitySignal | null> {
  if (!bridge.isConnected()) return null

  const prompt = buildInferencePrompt(anforderung, umsetzung)
  const response = await bridge.sendMessage({ content: prompt })
  if (!response) return null

  const answer = response.content.trim().toLowerCase()
  if (answer.includes('traegt')) return 'traegt'
  if (answer.includes('fraglich')) return 'fraglich'
  return 'fraglich' // default to cautious when answer unclear
}
