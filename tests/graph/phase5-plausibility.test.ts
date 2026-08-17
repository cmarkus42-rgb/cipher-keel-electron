import { describe, it, expect } from 'vitest'
import { inferPlausibility, buildInferencePrompt } from '../../src/main/graph/plausibility-inference'

// Shape follows the superseded NanoClaw channel; rewiring onto today's model layer is an open question (see plausibility-inference.ts docblock).
function mockBridge(response: string) {
  return {
    isConnected: () => true,
    sendMessage: async () => ({ content: response }),
  }
}

function disconnectedBridge() {
  return { isConnected: () => false, sendMessage: async () => null }
}

describe('Plausibility Inference (CK-PROC-006)', () => {
  it('returns traegt for plausible implementation', async () => {
    const bridge = mockBridge('traegt')
    const result = await inferPlausibility(
      bridge,
      'User login must validate credentials against database',
      'Function queries users table with bcrypt compare',
    )
    expect(result).toBe('traegt')
  })

  it('returns fraglich for questionable implementation', async () => {
    const bridge = mockBridge('fraglich')
    const result = await inferPlausibility(
      bridge,
      'Must encrypt data at rest',
      'Stores passwords in plaintext',
    )
    expect(result).toBe('fraglich')
  })

  it('returns null when bridge disconnected', async () => {
    const bridge = disconnectedBridge()
    const result = await inferPlausibility(bridge, 'req', 'impl')
    expect(result).toBeNull()
  })

  it('buildInferencePrompt contains requirement and implementation', () => {
    const prompt = buildInferencePrompt('must validate', 'checks input')
    expect(prompt).toContain('must validate')
    expect(prompt).toContain('checks input')
  })
})
