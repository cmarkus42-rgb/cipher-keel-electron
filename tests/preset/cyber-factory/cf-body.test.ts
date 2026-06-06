// tests/preset/cyber-factory/cf-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/cyber-factory/cf-body.md')

describe('CF Body (CK-P3CF-001, CK-P3CF-011)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains Negative Grenzen section', () => {
    expect(body).toContain('## Negative Grenzen')
  })

  it('mentions keine Architektur-Entscheidungen', () => {
    expect(body).toMatch(/keine.*Architektur/i)
  })

  it('mentions kein Bugfixing', () => {
    expect(body).toMatch(/kein.*Bugfixing/i)
  })

  it('mentions kein direkter Handoff an SE', () => {
    expect(body).toMatch(/kein.*direkter.*Handoff/i)
  })

  it('mentions Development-Worker-Modus for Niveau C (CK-P3CF-008)', () => {
    expect(body).toContain('Development-Worker-Modus')
  })

  it('contains Zerlegung ist Input reference', () => {
    expect(body).toContain('Zerlegung ist Input')
  })
})
