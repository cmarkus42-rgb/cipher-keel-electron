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

  it('documents the sampler block on the capability row', () => {
    // Ollamas /v1 forces temperature and top_p to 1.0 when the client omits them, so this is
    // an adjustable surface with teeth: leaving it out does not mean "server default", it
    // means 1.0. CK-NFR-012 wants it named.
    expect(INVENTORY).toContain('faehigkeiten.sampler')
    expect(INVENTORY).toContain('presencePenalty')
    expect(INVENTORY).toContain('reasoningEffort')
  })

  it('names top_k, min_p and repeat_penalty as a surface outside the app', () => {
    // The honest half of the same entry: these three exist, they matter, and no field in
    // this app can reach them -- Ollamas /v1 discards them. They live in the Modelfile on
    // the server. A slider for them would be a prop, which is the pattern CK-NFR-012 fights.
    expect(INVENTORY).toContain('top_k')
    expect(INVENTORY).toContain('min_p')
    expect(INVENTORY).toContain('repeat_penalty')
    expect(INVENTORY).toContain('Modelfile')
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
