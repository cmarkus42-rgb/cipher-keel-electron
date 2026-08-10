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

  it('marks debugger-beauftragung as reference material, matching the Niveau-B note', () => {
    const pkg = WORKSHOP_PACKAGES.find(p => p.name === 'debugger-beauftragung')!
    expect(pkg.niveauMinimum).toBe('B')
  })
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
