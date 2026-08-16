import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const SRC = path.join(__dirname, '../../src')

function alleQuelldateien(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) alleQuelldateien(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

// The capability lists once knew the same thing in five places and drifted. The matrices
// get one home, and a second one is a build failure rather than a code review finding.
describe('the suitability rules have exactly one home', () => {
  const erlaubt = [
    path.join(SRC, 'main/model/eignung.ts'),
  ]

  it('names the three Laeufer only in eignung.ts', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => /'eigene-schleife'|"eigene-schleife"/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `Laeufer ausserhalb von eignung.ts: ${treffer.join(', ')}`).toEqual([])
  })

  it('states the runner capability level only in eignung.ts', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => /laeuferFaehigkeit\s*[:=]\s*\{|FAEHIGKEIT\s*:\s*Record/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `zweite Faehigkeitstabelle: ${treffer.join(', ')}`).toEqual([])
  })

  it('keeps every warning text in eignung.ts, so no surface writes its own', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => /Gegenteil des Gefaelles|verlaesst das eigene Netz/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `Warntext ausserhalb von eignung.ts: ${treffer.join(', ')}`).toEqual([])
  })
})
