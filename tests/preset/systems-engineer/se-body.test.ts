// tests/preset/systems-engineer/se-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/systems-engineer/se-body.md')

describe('Systems Engineer Body (M5 section 4)', () => {
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

  it('names the three M4 burdens', () => {
    expect(body).toMatch(/Steuer-Überblick/i)
    expect(body).toMatch(/Gate-Urteil/i)
    expect(body).toMatch(/Quereinstieg/i)
  })

  it('states the trigger model — no entity-to-entity handoffs', () => {
    expect(body).toMatch(/kein.*Entität-zu-Entität/i)
  })

  it('forbids executing work itself', () => {
    expect(body).toMatch(/schreibt keinen Code|führt nicht aus/i)
  })

  it('separates Führung from Orchestrierung', () => {
    expect(body).toContain('Orchestrierung')
  })
})
