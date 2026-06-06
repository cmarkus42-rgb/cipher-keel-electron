/**
 * Plausibility Inference — local model assessment via NanoClaw.
 * Signal: 'traegt' | 'fraglich' | null. Never combined with structural befund.
 * CK-PROC-006
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
