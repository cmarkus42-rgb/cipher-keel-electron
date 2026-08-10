import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CF_CAPABILITIES } from '../../../src/main/preset/cyber-factory/cf-preset'

const DIR = path.join(__dirname, '../../../src/main/preset/cyber-factory/capabilities')

describe('Cyber Factory capability SKILL.md files', () => {
  for (const id of CF_CAPABILITIES) {
    describe(id, () => {
      const file = path.join(DIR, id, 'SKILL.md')

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
