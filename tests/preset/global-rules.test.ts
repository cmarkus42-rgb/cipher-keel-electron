import { describe, it, expect } from 'vitest'
import { getGlobalRules } from '../../src/main/preset/global-rules'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

/** Same heuristic assemble-entity.ts uses: whitespace-split × 1.3. */
function estimateTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length * 1.3
}

describe('global rules', () => {
  it('carries the three core rules at every niveau', () => {
    for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      const rules = getGlobalRules(niveau)
      // Tightened: negation must appear within 40 chars before schädlich
      expect(rules, niveau).toMatch(/(keine|kein|nie)[\s\S]{0,40}schädlich/i)
      // Tightened: negation must appear within 40 chars before PII or personenbezogen
      expect(rules, niveau).toMatch(/(keine|kein|nie)[\s\S]{0,40}(PII|personenbezogen)/i)
      // Tightened: either topic-then-negation or negation-then-topic within 30 chars
      expect(rules, niveau).toMatch(/((Credential|Zugangsdaten)[\s\S]{0,30}(nie|keine|kein)|(nie|keine|kein)[\s\S]{0,30}(Credential|Zugangsdaten))/i)
    }
  })

  it('never returns an empty layer', () => {
    for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      expect(getGlobalRules(niveau).trim().length, niveau).toBeGreaterThan(40)
    }
  })

  it('shrinks monotonically from A to C', () => {
    const a = estimateTokens(getGlobalRules(CapabilityNiveau.A))
    const b = estimateTokens(getGlobalRules(CapabilityNiveau.B))
    const c = estimateTokens(getGlobalRules(CapabilityNiveau.C))
    expect(b).toBeLessThan(a)
    expect(c).toBeLessThan(b)
  })

  // assemble-entity.ts truncates only the BODY at Niveau C; this layer is appended after,
  // uncapped. A verbose rules layer here would blow the very budget the cap protects.
  it('costs at most 60 tokens at Niveau C', () => {
    expect(estimateTokens(getGlobalRules(CapabilityNiveau.C))).toBeLessThanOrEqual(60)
  })

  it('stays modest even at Niveau A', () => {
    expect(estimateTokens(getGlobalRules(CapabilityNiveau.A))).toBeLessThanOrEqual(250)
  })

  it('gives Niveau C a single paragraph, not a truncated list', () => {
    expect(getGlobalRules(CapabilityNiveau.C)).not.toContain('\n-')
  })

  // The three rules are inert without the instruction for what to do when a task
  // collides with them. It went missing at Niveau C in the first draft — the niveau
  // running the weakest model, where it matters most.
  it('tells every niveau what to do when the task collides with a rule', () => {
    for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      expect(getGlobalRules(niveau), niveau).toMatch(/nachfrag|frag nach/i)
    }
  })
})
