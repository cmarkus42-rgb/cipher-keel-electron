import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TA_CAPABILITIES } from '../../../src/main/preset/testing-assistant/ta-preset'
import { TA_PACKAGES } from '../../../src/main/preset/testing-assistant/ta-capabilities'
import { validateCapabilityPackage } from '../../../src/main/preset/capability-schema'

const OWN = path.join(__dirname, '../../../src/main/preset/testing-assistant/capabilities')

// Unlike the Architect, the Systems Engineer and the Workshop, the Testing Assistant carries
// no rolling-summary (fix round 1, Finding A) — every capability lives under its own directory,
// there is no shared-location special case to route around.
const fileFor = (id: string) => path.join(OWN, id, 'SKILL.md')

describe('Testing Assistant capability SKILL.md files', () => {
  for (const id of TA_CAPABILITIES) {
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

// Fix round 1, Finding D: TA_PACKAGES was dead code with no schema validation — a malformed
// pfad or an over-long beschreibung (the schema caps it at ~100 estimated tokens) would have
// gone unnoticed. Mirrors tests/se-capabilities.test.ts and
// tests/preset/workshop/workshop-capability-skills.test.ts.
describe('Testing Assistant capability packages (TA_PACKAGES)', () => {
  it('every package passes the schema validator', () => {
    for (const pkg of TA_PACKAGES) {
      expect(validateCapabilityPackage(pkg).errors, pkg.name).toEqual([])
    }
  })

  it('carries exactly the names TA_CAPABILITIES declares — no more, no fewer', () => {
    const names = TA_PACKAGES.map(p => p.name)
    expect(names.sort()).toEqual([...TA_CAPABILITIES].sort())
  })
})
