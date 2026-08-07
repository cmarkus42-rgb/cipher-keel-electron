/**
 * Shared Rolling Summary — Phase 3c Task 6
 * CK-3C-006
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import {
  SE_SUMMARY_CONFIG,
  WORKSHOP_SUMMARY_CONFIG,
  createSummaryNode,
  loadLatestSummary,
} from '../src/main/preset/shared/rolling-summary'

let db: Database.Database

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
})

afterEach(() => {
  if (db?.open) db.close()
})

// ---------------------------------------------------------------------------
// Config constants
// ---------------------------------------------------------------------------

describe('SE_SUMMARY_CONFIG (CK-3C-006)', () => {
  it('pflicht is true', () => {
    expect(SE_SUMMARY_CONFIG.pflicht).toBe(true)
  })

  it('has at least one updateTrigger', () => {
    expect(SE_SUMMARY_CONFIG.updateTriggers.length).toBeGreaterThan(0)
  })

  it('has at least one summaryField', () => {
    expect(SE_SUMMARY_CONFIG.summaryFields.length).toBeGreaterThan(0)
  })
})

describe('WORKSHOP_SUMMARY_CONFIG (CK-3C-006)', () => {
  it('pflicht is true', () => {
    expect(WORKSHOP_SUMMARY_CONFIG.pflicht).toBe(true)
  })

  it('updateTriggers contains workshop-specific triggers', () => {
    expect(WORKSHOP_SUMMARY_CONFIG.updateTriggers).toContain('item-abgeschlossen')
    expect(WORKSHOP_SUMMARY_CONFIG.updateTriggers).toContain('routing-entscheidung')
    expect(WORKSHOP_SUMMARY_CONFIG.updateTriggers).toContain('kontext-druck')
  })

  it('summaryFields contains workshop-specific fields', () => {
    expect(WORKSHOP_SUMMARY_CONFIG.summaryFields).toContain('erledigte_items')
    expect(WORKSHOP_SUMMARY_CONFIG.summaryFields).toContain('items_in_arbeit')
  })
})

// ---------------------------------------------------------------------------
// createSummaryNode
// ---------------------------------------------------------------------------

describe('createSummaryNode (CK-3C-006)', () => {
  it('writes a note node to the graph', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: '## SE Summary\n- aktive Phasen: requirements',
    })

    const row = db.prepare("SELECT COUNT(*) as c FROM node WHERE kind = 'note'").get() as { c: number }
    expect(row.c).toBe(1)
  })

  it('note has notetyp rolling-summary in frontmatter', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'summary content',
    })

    const row = db.prepare(
      "SELECT frontmatter FROM node WHERE kind = 'note' LIMIT 1"
    ).get() as { frontmatter: string } | undefined

    expect(row).toBeDefined()
    const fm = JSON.parse(row!.frontmatter)
    expect(fm.notetyp).toBe('rolling-summary')
  })

  it('note stores entityId in frontmatter', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'test',
    })

    const row = db.prepare(
      "SELECT frontmatter FROM node WHERE kind = 'note' LIMIT 1"
    ).get() as { frontmatter: string }

    const fm = JSON.parse(row.frontmatter)
    expect(fm.entityId).toBe('systems-engineer')
  })

  it('returns the node uid', () => {
    const result = createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'test',
    })

    expect(result.uid).toBeTruthy()
    expect(typeof result.uid).toBe('string')
  })

  it('second call overwrites, does not accumulate (idempotent per entityId)', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'first summary',
    })
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'second summary',
    })

    const row = db.prepare("SELECT COUNT(*) as c FROM node WHERE kind = 'note'").get() as { c: number }
    expect(row.c).toBe(1)
  })

  it('different entityIds create separate nodes', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'SE summary',
    })
    createSummaryNode(db, WORKSHOP_SUMMARY_CONFIG, {
      entityId: 'workshop',
      content: 'Workshop summary',
    })

    const row = db.prepare("SELECT COUNT(*) as c FROM node WHERE kind = 'note'").get() as { c: number }
    expect(row.c).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// loadLatestSummary
// ---------------------------------------------------------------------------

describe('loadLatestSummary (CK-3C-006)', () => {
  it('returns null when no summary exists for entityId', () => {
    const result = loadLatestSummary(db, 'systems-engineer')
    expect(result).toBeNull()
  })

  it('roundtrip: create then load returns the content', () => {
    const content = '## SE Summary\n- phase: requirements\n- gate: gruen'

    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content,
    })

    const loaded = loadLatestSummary(db, 'systems-engineer')
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe(content)
    expect(loaded!.entityId).toBe('systems-engineer')
  })

  it('returns uid and entityId after roundtrip', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'test',
    })

    const loaded = loadLatestSummary(db, 'systems-engineer')
    expect(loaded!.uid).toBeTruthy()
    expect(loaded!.entityId).toBe('systems-engineer')
  })

  it('overwrites: loadLatestSummary returns most recent content', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'first',
    })
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'second',
    })

    const loaded = loadLatestSummary(db, 'systems-engineer')
    expect(loaded!.content).toBe('second')
  })

  it('returns null for unknown entityId even when other summaries exist', () => {
    createSummaryNode(db, SE_SUMMARY_CONFIG, {
      entityId: 'systems-engineer',
      content: 'SE summary',
    })

    const result = loadLatestSummary(db, 'workshop')
    expect(result).toBeNull()
  })
})
