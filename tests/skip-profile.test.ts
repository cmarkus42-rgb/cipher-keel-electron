/**
 * Skip profile type-level tests — Task 3 (PROC-004).
 * Only covers PhaseAttrs extension and ALLOWED_FRONTMATTER_FIELDS.
 */

import { describe, it, expect } from 'vitest'
import {
  ALLOWED_FRONTMATTER_FIELDS,
  type PhaseAttrs
} from '../src/main/graph/node-types'

describe('skip_profil in PhaseAttrs (PROC-004)', () => {
  it('skip_profil is in ALLOWED_FRONTMATTER_FIELDS.phase', () => {
    expect(ALLOWED_FRONTMATTER_FIELDS.phase).toContain('skip_profil')
  })

  it('PhaseAttrs accepts optional skip_profil with tiefe, begruendung, markiert_von', () => {
    const phase: PhaseAttrs = {
      name: 'ideation',
      position: 1,
      phase_status: 'ausstehend',
      skip_profil: { tiefe: 'trivial', begruendung: 'out-of-scope', markiert_von: 'user' }
    }
    expect(phase.skip_profil?.tiefe).toBe('trivial')
    expect(phase.skip_profil?.begruendung).toBe('out-of-scope')
    expect(phase.skip_profil?.markiert_von).toBe('user')
  })

  it('PhaseAttrs is valid without skip_profil (optional field)', () => {
    const phase: PhaseAttrs = {
      name: 'requirements',
      position: 2,
      phase_status: 'aktiv'
    }
    expect(phase.skip_profil).toBeUndefined()
  })
})
