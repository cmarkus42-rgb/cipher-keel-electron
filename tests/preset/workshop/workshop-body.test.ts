// tests/preset/workshop/workshop-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/workshop/workshop-body.md')

describe('Workshop Body (M5 section 8.5)', () => {
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

  it('names the convergent flow steps', () => {
    expect(body).toMatch(/aufnehmen/i)
    expect(body).toMatch(/klassifizieren/i)
    expect(body).toMatch(/dispatch/i)
    expect(body).toMatch(/konsolidier/i)
  })

  it('claims routing authority inside the fixing phase', () => {
    expect(body).toMatch(/Routing-Hoheit/i)
    expect(body).toMatch(/informiert.*Systems Engineer|SE.*informiert/i)
  })

  it('forbids cross-phase coordination', () => {
    expect(body).toMatch(/keine phasenübergreifende Koordination/i)
  })

  // Corrected after review: /Debugger/i also matched the Debugger's earlier mention
  // as a dispatch target, so the prohibition itself went unasserted.
  it('forbids deep single-bug analysis (Debugger territory)', () => {
    expect(body).toMatch(/(keine|kein).{0,40}(Tiefen-?Analyse|Einzel-?Bug)[\s\S]{0,120}Debugger/i)
  })
})
