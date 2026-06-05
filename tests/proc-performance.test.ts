/**
 * proc-performance.test.ts — Gate Cache + Performance Benchmarks (Wave 3).
 *
 * Benchmarks: gate_structural_coverage at 50 / 500 nodes.
 * Unit tests: GateCache hit + invalidation semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import { GateCache } from '../src/main/graph/gate-cache'

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db?.open && db.close()
})

// ---------------------------------------------------------------------------
// Helper: seed N anforderungen + N/2 artefakte in one phase
// ---------------------------------------------------------------------------

function seedLargeGraph(database: Database.Database, nodeCount: number): string {
  const w = new GraphWriter(database)

  const phase = w.upsertNode({
    kind: 'phase',
    title: 'perf-phase',
    path: '/phases/perf.md',
    frontmatter: { name: 'perf', position: 1, phase_status: 'ausstehend' }
  })

  const reqUids: string[] = []
  for (let i = 0; i < nodeCount; i++) {
    const req = w.upsertNode({
      kind: 'anforderung',
      title: `REQ-${i}`,
      path: `/req/${i}.md`,
      frontmatter: {}
    })
    w.linkEdge({ src: req.uid, dst: phase.uid, type: 'traegt_phase', source: 'inferred' })
    reqUids.push(req.uid)
  }

  const artefaktCount = Math.floor(nodeCount / 2)
  for (let i = 0; i < artefaktCount; i++) {
    const art = w.upsertNode({
      kind: 'artefakt',
      title: `ART-${i}`,
      path: `/art/${i}.ts`,
      frontmatter: {}
    })
    w.linkEdge({ src: art.uid, dst: reqUids[i], type: 'setzt_um', source: 'inferred' })
  }

  return phase.uid
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ---------------------------------------------------------------------------
// Performance benchmarks
// ---------------------------------------------------------------------------

describe('gate_structural_coverage performance benchmarks', () => {
  it('50 nodes: median query time < 500ms over 10 runs', () => {
    const phaseUid = seedLargeGraph(db, 50)
    const times: number[] = []

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      graphQuery(db, {
        template: 'gate_structural_coverage',
        params: { edge_type: 'setzt_um', phase_uid: phaseUid }
      })
      times.push(performance.now() - t0)
    }

    const med = median(times)
    expect(med).toBeLessThan(500)
  })

  it('500 nodes: median query time < 2000ms over 10 runs', () => {
    const phaseUid = seedLargeGraph(db, 500)
    const times: number[] = []

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      graphQuery(db, {
        template: 'gate_structural_coverage',
        params: { edge_type: 'setzt_um', phase_uid: phaseUid }
      })
      times.push(performance.now() - t0)
    }

    const med = median(times)
    expect(med).toBeLessThan(2000)
  })
})

// ---------------------------------------------------------------------------
// GateCache unit tests
// ---------------------------------------------------------------------------

describe('GateCache', () => {
  it('cache hit returns same result reference on repeated call', () => {
    const phase = writer.upsertNode({
      kind: 'phase',
      title: 'cache-phase',
      path: '/phases/cache.md',
      frontmatter: { name: 'cache', position: 1, phase_status: 'ausstehend' }
    })
    const params = {
      template: 'gate_structural_coverage',
      params: { edge_type: 'setzt_um', phase_uid: phase.uid }
    }

    const cache = new GateCache()
    const r1 = cache.getOrQuery(db, params)
    const r2 = cache.getOrQuery(db, params)

    expect(r1).toBe(r2)          // same object reference — served from cache
    expect(cache.hits).toBe(1)   // second call was a hit
  })

  it('invalidation clears cache so next call re-queries', () => {
    const phase = writer.upsertNode({
      kind: 'phase',
      title: 'inv-phase',
      path: '/phases/inv.md',
      frontmatter: { name: 'inv', position: 1, phase_status: 'ausstehend' }
    })
    const params = {
      template: 'gate_structural_coverage',
      params: { edge_type: 'setzt_um', phase_uid: phase.uid }
    }

    const cache = new GateCache()
    const r1 = cache.getOrQuery(db, params)  // miss
    cache.invalidate()
    const r2 = cache.getOrQuery(db, params)  // miss again after invalidation

    expect(r1).not.toBe(r2)      // different objects — re-queried
    expect(cache.hits).toBe(0)   // no hits occurred (both were misses)
  })
})
