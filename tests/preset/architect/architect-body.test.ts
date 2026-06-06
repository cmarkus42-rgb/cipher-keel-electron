// tests/preset/architect/architect-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/architect/architect-body.md')

describe('Architect Body (CK-P3A-001, CK-P3A-013)', () => {
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

  it('mentions kein produktiver Code', () => {
    expect(body).toMatch(/kein.*produktiver.*Code/i)
  })

  it('mentions keine Welle-Planung', () => {
    expect(body).toMatch(/keine.*Welle.*Planung/i)
  })

  it('mentions keine Anforderungs-Schaerfung', () => {
    expect(body).toMatch(/keine.*Anforderungs/i)
  })

  it('contains role identity section', () => {
    expect(body).toContain('Architect')
  })

  it('contains Schnittstellen-Stempel hint for Niveau C (CK-P3A-009)', () => {
    expect(body).toContain('Bedienhilfe-Modus')
  })
})
