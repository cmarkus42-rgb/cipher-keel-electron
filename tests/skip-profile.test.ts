/**
 * Skip profile tests — Task 3 (PROC-004).
 * Type-level: PhaseAttrs extension and ALLOWED_FRONTMATTER_FIELDS.
 * Query-level: phase_skip_status template.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery, QUERY_TEMPLATES } from '../src/main/graph/query'
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

// ---------------------------------------------------------------------------
// Query-level tests
// ---------------------------------------------------------------------------

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db?.open && db.close()
})

describe('phase_skip_status template (PROC-004)', () => {
  it('is registered in QUERY_TEMPLATES', () => {
    expect(QUERY_TEMPLATES).toContain('phase_skip_status')
  })

  it('returns only phases that have skip_profil set', () => {
    writer.upsertNode({
      kind: 'phase', title: 'ideation', path: '/phases/ideation',
      frontmatter: {
        name: 'ideation', position: 1, phase_status: 'ausstehend',
        skip_profil: { tiefe: 'trivial', begruendung: 'out-of-scope', markiert_von: 'user' }
      }
    })
    writer.upsertNode({
      kind: 'phase', title: 'requirements', path: '/phases/requirements',
      frontmatter: { name: 'requirements', position: 2, phase_status: 'aktiv' }
    })

    const result = graphQuery(db, { template: 'phase_skip_status' })

    expect(result.count).toBe(1)
    expect(result.rows[0].phase_name).toBe('ideation')
    const sp = JSON.parse(result.rows[0].skip_profil_raw as string)
    expect(sp.tiefe).toBe('trivial')
    expect(sp.markiert_von).toBe('user')
  })

  it('returns empty when no phases have skip_profil', () => {
    writer.upsertNode({
      kind: 'phase', title: 'architecture', path: '/phases/arch',
      frontmatter: { name: 'architecture', position: 3, phase_status: 'aktiv' }
    })

    const result = graphQuery(db, { template: 'phase_skip_status' })
    expect(result.count).toBe(0)
  })
})
