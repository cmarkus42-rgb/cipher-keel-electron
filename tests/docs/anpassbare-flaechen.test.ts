import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const INVENTORY = readFileSync(
  join(__dirname, '../../docs/anpassbare-flaechen.md'), 'utf8'
)

// CK-NFR-012: a new adjustable surface without an inventory entry is an audit finding.
// Binding the test to the config keys is what keeps this from being a document that
// quietly falls behind the code.
const CONFIG_PATHS = [
  'agent.startArgs',
  'agent.modelTiers',
  'voice.enabled',
  'voice.piperVoice',
  'llm.tagging',
  'llm.worker',
  'modelle.eintraege',
  'modelle.zuordnung',
]

describe('CK-NFR-012 — the adjustable-surface inventory', () => {
  for (const path of CONFIG_PATHS) {
    it(`lists ${path}`, () => {
      expect(INVENTORY).toContain(path)
    })
  }

  it('lists the prompt layers', () => {
    for (const layer of ['Body', 'Persona', 'GlobalRules', 'SKILL.md']) {
      expect(INVENTORY).toContain(layer)
    }
  })

  it('marks every entry as either editable or explicitly not yet editable', () => {
    const rows = INVENTORY.split('\n').filter(l => l.startsWith('| `'))
    expect(rows.length).toBeGreaterThan(10)
    for (const row of rows) {
      expect(row, `row without an editability verdict: ${row}`)
        .toMatch(/ja|nein/)
    }
  })

  it('documents the cost budget price table', () => {
    // The price table is adjustable because rates change faster than releases.
    // It must be documented, and the key constraint — unknown models cost zero,
    // not guessed — must be explicit.
    expect(INVENTORY).toContain('Kostenbudget')
    expect(INVENTORY).toContain('VORGABE_PREISE')
    expect(INVENTORY).toContain('src/main/harness/budget.ts')
    expect(INVENTORY).toContain('unbekanntes Modell kostet null')
  })
})
