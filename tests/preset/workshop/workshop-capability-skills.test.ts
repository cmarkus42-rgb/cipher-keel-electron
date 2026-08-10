import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { WORKSHOP_PACKAGES } from '../../../src/main/preset/workshop/workshop-capabilities'
import { validateCapabilityPackage } from '../../../src/main/preset/capability-schema'
import { getNiveauWorkshopConfig } from '../../../src/main/preset/workshop/niveau-config'

const OWN = path.join(__dirname, '../../../src/main/preset/workshop/capabilities')
const SHARED = path.join(__dirname, '../../../src/main/preset/shared/capabilities')

// rolling-summary is shared with the Architect and the Systems Engineer and lives at the
// shared location — one file, one source of truth, referenced from all three presets.
const fileFor = (id: string) =>
  id === 'rolling-summary'
    ? path.join(SHARED, id, 'SKILL.md')
    : path.join(OWN, id, 'SKILL.md')

describe('Workshop capability packages', () => {
  it('defines a package for every Niveau-A capability', () => {
    const names = WORKSHOP_PACKAGES.map(p => p.name)
    for (const id of getNiveauWorkshopConfig('A').capabilities) {
      expect(names, id).toContain(id)
    }
  })

  it('every package passes the schema validator', () => {
    for (const pkg of WORKSHOP_PACKAGES) {
      expect(validateCapabilityPackage(pkg).errors, pkg.name).toEqual([])
    }
  })

  // niveauMinimum is documentation only — nothing in getNiveauWorkshopConfig consumes it, so
  // it can silently drift out of sync with the CAPABILITIES_NIVEAU_A/B/C arrays (fix round 1:
  // debugger-beauftragung was flagged 'B' off a stale comment in niveau-config.ts, while the
  // array itself only ever carried it at Niveau A). This is the price of keeping the field —
  // unlike the guard tests below (frontmatter/sections/length only), this assertion can catch
  // its own subject: a wrong value here fails directly, in either direction. Ordering is
  // A > B > C (Niveau A carries every package, C the fewest, CK-P4-010): niveauMinimum 'X'
  // means "present from Niveau X up to A, absent below X"; no flag means present everywhere.
  const NIVEAU_RANK: Record<'A' | 'B' | 'C', number> = { C: 0, B: 1, A: 2 }
  const MEMBERSHIP: Record<'A' | 'B' | 'C', readonly string[]> = {
    A: getNiveauWorkshopConfig('A').capabilities,
    B: getNiveauWorkshopConfig('B').capabilities,
    C: getNiveauWorkshopConfig('C').capabilities,
  }

  for (const pkg of WORKSHOP_PACKAGES) {
    it(`${pkg.name}: niveauMinimum (${pkg.niveauMinimum ?? 'none'}) matches its actual Niveau-list membership`, () => {
      const requiredRank = pkg.niveauMinimum ? NIVEAU_RANK[pkg.niveauMinimum] : NIVEAU_RANK.C
      for (const niveau of ['A', 'B', 'C'] as const) {
        const isPresent = MEMBERSHIP[niveau].includes(pkg.name)
        const expectedPresent = NIVEAU_RANK[niveau] >= requiredRank
        expect(isPresent, `${pkg.name} at Niveau ${niveau}`).toBe(expectedPresent)
      }
    })
  }
})

describe('Workshop capability SKILL.md files', () => {
  for (const id of getNiveauWorkshopConfig('A').capabilities) {
    describe(id, () => {
      const file = fileFor(id)

      it('exists', () => {
        expect(fs.existsSync(file), file).toBe(true)
      })

      it('carries frontmatter naming itself', () => {
        const content = fs.readFileSync(file, 'utf-8')
        expect(content.startsWith('---\n')).toBe(true)
        expect(content).toMatch(new RegExp(`^name: ${id}$`, 'm'))
        expect(content).toMatch(/^description: \S/m)
      })

      it('carries the three required sections', () => {
        const content = fs.readFileSync(file, 'utf-8')
        expect(content).toContain('## Wann das gilt')
        expect(content).toContain('## Vorgehen')
        expect(content).toContain('## Grenzen')
      })

      it('is substantial but not bloated', () => {
        const content = fs.readFileSync(file, 'utf-8')
        expect(content.length).toBeGreaterThan(400)
        expect(content.length).toBeLessThan(8000)
      })
    })
  }
})
