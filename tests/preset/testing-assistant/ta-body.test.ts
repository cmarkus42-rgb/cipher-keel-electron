// tests/preset/testing-assistant/ta-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/testing-assistant/ta-body.md')

describe('Testing Assistant Body (M5 section 8.4)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains the standard sections', () => {
    expect(body).toContain('## Kernaufgaben')
    expect(body).toContain('## Arbeitsablauf')
    expect(body).toContain('## Negative Grenzen')
    expect(body).toContain('## Niveau-Hinweise')
  })

  it('names all four duties from M5 section 8.4', () => {
    expect(body).toMatch(/Suite/i)
    expect(body).toMatch(/Testqualität/i)
    expect(body).toMatch(/[Aa]dversarial/)
    expect(body).toMatch(/dokumentier/i)
  })

  it('states the sharpest boundary: it does not fix', () => {
    expect(body).toMatch(/fixt nicht|kein.*[Ff]ix/)
    expect(body).toMatch(/ändert keinen Code|kein.*Code.*ändern/i)
  })
})
