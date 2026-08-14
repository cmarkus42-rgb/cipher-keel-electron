import { describe, it, expect } from 'vitest'
import { checkWorkerAnswer, RESULT_MARKER } from '../../src/main/worker/result-contract'

const FIELDS = ['datei', 'aenderung', 'begruendung']

function block(inner: string): string {
  return '```' + RESULT_MARKER + '\n' + inner + '\n```'
}

describe('checkWorkerAnswer', () => {
  it('accepts a well-formed block and returns the parsed object', () => {
    const raw = 'Klar, hier ist das Ergebnis:\n\n' + block(
      '{ "datei": "src/foo.ts", "aenderung": "x", "begruendung": "y" }'
    )
    const check = checkWorkerAnswer(raw, FIELDS)
    expect(check.ok).toBe(true)
    if (check.ok) expect(check.data.datei).toBe('src/foo.ts')
  })

  it('tolerates prose around the block but never inside it', () => {
    const raw = 'Vorher.\n' + block('{ "a": 1 }') + '\nNachher, mit Erklärung.'
    const check = checkWorkerAnswer(raw, ['a'])
    expect(check.ok).toBe(true)
  })

  it('rejects an answer without the marked block', () => {
    const check = checkWorkerAnswer('{ "datei": "x" }', FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('kein Block')
  })

  it('rejects more than one block instead of guessing which is meant', () => {
    const raw = block('{ "a": 1 }') + '\n\n' + block('{ "a": 2 }')
    const check = checkWorkerAnswer(raw, ['a'])
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('mehr als ein Block')
  })

  it('rejects invalid JSON and names the parser complaint', () => {
    const check = checkWorkerAnswer(block('{ "datei": }'), FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('JSON im Block ist ungültig')
  })

  it('rejects a non-object payload', () => {
    const check = checkWorkerAnswer(block('[1, 2, 3]'), FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toContain('kein JSON-Objekt')
  })

  it('names every missing field', () => {
    const check = checkWorkerAnswer(block('{ "datei": "x" }'), FIELDS)
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.reason).toContain('aenderung')
      expect(check.reason).toContain('begruendung')
      expect(check.reason).not.toContain('datei,')
    }
  })

  it('allows extra fields — presence is checked, not exclusivity', () => {
    const raw = block('{ "datei": "x", "aenderung": "y", "begruendung": "z", "extra": 1 }')
    expect(checkWorkerAnswer(raw, FIELDS).ok).toBe(true)
  })

  it('counts an empty value as present — content is the caller\'s business', () => {
    const raw = block('{ "datei": "", "aenderung": "", "begruendung": "" }')
    expect(checkWorkerAnswer(raw, FIELDS).ok).toBe(true)
  })

  it('accepts a block when no fields are required', () => {
    expect(checkWorkerAnswer(block('{}'), []).ok).toBe(true)
  })
})
