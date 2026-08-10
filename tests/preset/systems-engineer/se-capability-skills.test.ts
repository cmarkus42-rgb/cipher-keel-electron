import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getSECapabilities } from '../../../src/main/preset/systems-engineer/se-capabilities'

const OWN = path.join(__dirname, '../../../src/main/preset/systems-engineer/capabilities')
const SHARED = path.join(__dirname, '../../../src/main/preset/shared/capabilities')

// rolling-summary is shared with the Architect and lives at the shared
// location — one file, one source of truth, referenced from both presets.
const fileFor = (id: string) =>
  id === 'rolling-summary'
    ? path.join(SHARED, id, 'SKILL.md')
    : path.join(OWN, id, 'SKILL.md')

describe('SE capability SKILL.md files', () => {
  for (const id of getSECapabilities('A')) {
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
