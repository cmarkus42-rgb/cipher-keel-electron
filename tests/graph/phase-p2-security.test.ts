/**
 * Phase P2 Security tests — SQL parameterization, MCP runtime validation,
 * unhandledRejection handler.
 *
 * P2-SEC backlog items:
 *   1. SQL string interpolation → parameterized queries (search.ts, query.ts)
 *   2. MCP double-casts → runtime type-guards (mcp-server.ts)
 *   3. process.on('unhandledRejection') in main.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphExpand } from '../../src/main/graph/search'
import { graphQuery } from '../../src/main/graph/query'
import {
  GraphMcpServer,
  assertString,
  assertOptionalString,
  assertOptionalNumber,
  assertOptionalObject,
  validateSearchParams,
  validateExpandParams,
  validateQueryParams,
  validateUpsertNodeInput,
  validateLinkEdgeInput,
  validateMaintainParams,
} from '../../src/main/graph/mcp-server'
import type { JsonRpcRequest } from '../../src/main/graph/mcp-server'

function makeReq(method: string, params?: unknown, id: number = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params }
}

// -------------------------------------------------------------------
// P2-SEC-1: SQL parameterized queries
// -------------------------------------------------------------------

describe('P2-SEC-1: SQL parameterized queries', () => {
  let db: Database.Database
  let w: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    w = new GraphWriter(db)
  })
  afterEach(() => { db.close() })

  it('graphExpand with edge_type filter uses parameterized query (no injection)', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-SEC', path: '/r.md' })
    const art = w.upsertNode({ kind: 'artefakt', title: 'ART-SEC', path: '/a.ts' })
    w.linkEdge({ src: art.uid, dst: anf.uid }) // derives setzt_um

    // Valid edge_type filter should work
    const result = graphExpand(db, { uid: anf.uid, depth: 1, edge_type: 'setzt_um' })
    expect(result.neighbors).toHaveLength(1)
    expect(result.neighbors[0].uid).toBe(art.uid)
  })

  it('graphExpand with direction=outgoing and edge_type filter', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-OUT', path: '/ro.md' })
    const art = w.upsertNode({ kind: 'artefakt', title: 'ART-OUT', path: '/ao.ts' })
    w.linkEdge({ src: art.uid, dst: anf.uid })

    const result = graphExpand(db, { uid: art.uid, depth: 1, edge_type: 'setzt_um', direction: 'outgoing' })
    expect(result.neighbors).toHaveLength(1)
  })

  it('graphExpand with direction=incoming and edge_type filter', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-IN', path: '/ri.md' })
    const art = w.upsertNode({ kind: 'artefakt', title: 'ART-IN', path: '/ai.ts' })
    w.linkEdge({ src: art.uid, dst: anf.uid })

    const result = graphExpand(db, { uid: anf.uid, depth: 1, edge_type: 'setzt_um', direction: 'incoming' })
    expect(result.neighbors).toHaveLength(1)
  })

  it('graphExpand without edge_type still works', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-NO', path: '/rn.md' })
    const art = w.upsertNode({ kind: 'artefakt', title: 'ART-NO', path: '/an.ts' })
    w.linkEdge({ src: art.uid, dst: anf.uid })

    const result = graphExpand(db, { uid: anf.uid, depth: 1 })
    expect(result.neighbors).toHaveLength(1)
  })

  it('graphExpand rejects invalid edge_type before query', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-BAD', path: '/rb.md' })
    expect(() => {
      graphExpand(db, { uid: anf.uid, depth: 1, edge_type: "'; DROP TABLE node; --" as any })
    }).toThrow(/Invalid edge_type/)
  })

  it('graphQuery reverse_trace with edge_type filter uses parameterized query', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-RT', path: '/rrt.md' })
    const art = w.upsertNode({ kind: 'artefakt', title: 'ART-RT', path: '/art.ts' })
    w.linkEdge({ src: art.uid, dst: anf.uid })

    const result = graphQuery(db, {
      template: 'reverse_trace',
      params: { uid: anf.uid, edge_type: 'setzt_um', max_depth: 3 }
    })
    expect(result.template).toBe('reverse_trace')
    expect(result.rows.length).toBeGreaterThanOrEqual(1) // at least the seed node
  })

  it('graphQuery reverse_trace without edge_type still works', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-RT2', path: '/rrt2.md' })
    const result = graphQuery(db, {
      template: 'reverse_trace',
      params: { uid: anf.uid }
    })
    expect(result.template).toBe('reverse_trace')
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('graphQuery reverse_trace rejects invalid edge_type', () => {
    const anf = w.upsertNode({ kind: 'anforderung', title: 'REQ-RT3', path: '/rrt3.md' })
    expect(() => {
      graphQuery(db, {
        template: 'reverse_trace',
        params: { uid: anf.uid, edge_type: "'; DROP TABLE node; --" }
      })
    }).toThrow(/Invalid edge_type/)
  })
})

// -------------------------------------------------------------------
// P2-SEC-2: MCP runtime validation (type guards)
// -------------------------------------------------------------------

describe('P2-SEC-2: MCP runtime validation', () => {
  // --- Primitive validators ---

  describe('assertString', () => {
    it('accepts valid string', () => {
      expect(assertString('hello', 'test')).toBe('hello')
    })
    it('rejects number', () => {
      expect(() => assertString(42, 'test')).toThrow(/Expected non-empty string/)
    })
    it('rejects empty string', () => {
      expect(() => assertString('', 'test')).toThrow(/Expected non-empty string/)
    })
    it('rejects null', () => {
      expect(() => assertString(null, 'test')).toThrow(/Expected non-empty string/)
    })
    it('rejects undefined', () => {
      expect(() => assertString(undefined, 'test')).toThrow(/Expected non-empty string/)
    })
  })

  describe('assertOptionalString', () => {
    it('accepts string', () => {
      expect(assertOptionalString('hi', 'x')).toBe('hi')
    })
    it('accepts undefined', () => {
      expect(assertOptionalString(undefined, 'x')).toBeUndefined()
    })
    it('accepts null → undefined', () => {
      expect(assertOptionalString(null, 'x')).toBeUndefined()
    })
    it('rejects number', () => {
      expect(() => assertOptionalString(42, 'x')).toThrow(/Expected string/)
    })
  })

  describe('assertOptionalNumber', () => {
    it('accepts number', () => {
      expect(assertOptionalNumber(5, 'n')).toBe(5)
    })
    it('accepts undefined', () => {
      expect(assertOptionalNumber(undefined, 'n')).toBeUndefined()
    })
    it('rejects string', () => {
      expect(() => assertOptionalNumber('5', 'n')).toThrow(/Expected number/)
    })
    it('rejects NaN', () => {
      expect(() => assertOptionalNumber(NaN, 'n')).toThrow(/Expected number/)
    })
  })

  describe('assertOptionalObject', () => {
    it('accepts object', () => {
      expect(assertOptionalObject({ a: 1 }, 'o')).toEqual({ a: 1 })
    })
    it('accepts undefined', () => {
      expect(assertOptionalObject(undefined, 'o')).toBeUndefined()
    })
    it('rejects array', () => {
      expect(() => assertOptionalObject([1, 2], 'o')).toThrow(/Expected object/)
    })
    it('rejects string', () => {
      expect(() => assertOptionalObject('obj', 'o')).toThrow(/Expected object/)
    })
  })

  // --- Composite validators ---

  describe('validateSearchParams', () => {
    it('accepts valid params', () => {
      const p = validateSearchParams({ query: 'test', limit: 5, kind: 'note' })
      expect(p.query).toBe('test')
      expect(p.limit).toBe(5)
      expect(p.kind).toBe('note')
    })
    it('rejects missing query', () => {
      expect(() => validateSearchParams({})).toThrow(/query/)
    })
    it('rejects numeric query', () => {
      expect(() => validateSearchParams({ query: 123 })).toThrow(/query/)
    })
  })

  describe('validateExpandParams', () => {
    it('accepts valid params', () => {
      const p = validateExpandParams({ uid: 'ABC', depth: 2, direction: 'outgoing' })
      expect(p.uid).toBe('ABC')
      expect(p.depth).toBe(2)
    })
    it('rejects missing uid', () => {
      expect(() => validateExpandParams({ depth: 1 })).toThrow(/uid/)
    })
  })

  describe('validateQueryParams', () => {
    it('accepts valid params', () => {
      const p = validateQueryParams({ template: 'orphaned_nodes' })
      expect(p.template).toBe('orphaned_nodes')
    })
    it('rejects missing template', () => {
      expect(() => validateQueryParams({})).toThrow(/template/)
    })
  })

  describe('validateUpsertNodeInput', () => {
    it('accepts valid input', () => {
      const p = validateUpsertNodeInput({ kind: 'note', title: 'X', body: 'y' })
      expect(p.kind).toBe('note')
      expect(p.title).toBe('X')
    })
    it('rejects missing kind', () => {
      expect(() => validateUpsertNodeInput({ title: 'X' })).toThrow(/kind/)
    })
    it('rejects missing title', () => {
      expect(() => validateUpsertNodeInput({ kind: 'note' })).toThrow(/title/)
    })
  })

  describe('validateLinkEdgeInput', () => {
    it('accepts valid input', () => {
      const p = validateLinkEdgeInput({ src: 'A', dst: 'B', type: 'setzt_um' })
      expect(p.src).toBe('A')
      expect(p.dst).toBe('B')
    })
    it('rejects missing src', () => {
      expect(() => validateLinkEdgeInput({ dst: 'B' })).toThrow(/src/)
    })
    it('rejects missing dst', () => {
      expect(() => validateLinkEdgeInput({ src: 'A' })).toThrow(/dst/)
    })
  })

  describe('validateMaintainParams', () => {
    it('accepts valid operation', () => {
      const p = validateMaintainParams({ operation: 'hygiene' })
      expect(p.operation).toBe('hygiene')
    })
    it('rejects missing operation', () => {
      expect(() => validateMaintainParams({})).toThrow(/operation/)
    })
  })

  // --- Integration: MCP server rejects bad types ---

  describe('MCP server rejects invalid argument types', () => {
    let db: Database.Database
    let server: GraphMcpServer

    beforeEach(() => {
      db = openGraphDb({ path: ':memory:' })
      server = new GraphMcpServer(db)
    })
    afterEach(() => { db.close() })

    it('graph_search rejects numeric query', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_search',
        arguments: { query: 42 }
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('query')
    })

    it('graph_get_node rejects missing uid', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_get_node',
        arguments: {}
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('uid')
    })

    it('graph_expand rejects array uid', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_expand',
        arguments: { uid: ['not', 'a', 'string'] }
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
    })

    it('graph_upsert_node rejects missing kind', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_upsert_node',
        arguments: { title: 'No kind' }
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('kind')
    })

    it('graph_link rejects numeric src', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_link',
        arguments: { src: 123, dst: 'ABC' }
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('src')
    })

    it('graph_maintain rejects missing operation', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_maintain',
        arguments: {}
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('operation')
    })

    it('graph_query rejects boolean template', () => {
      const res = server.handleRequest(makeReq('tools/call', {
        name: 'graph_query',
        arguments: { template: true }
      }))
      const result = res.result as any
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('template')
    })
  })
})

// -------------------------------------------------------------------
// P2-SEC-3: unhandledRejection handler
// -------------------------------------------------------------------

describe('P2-SEC-3: unhandledRejection handler exists in main.ts', () => {
  it('main.ts contains process.on unhandledRejection', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const mainSrc = readFileSync(
      resolve(__dirname, '../../src/main/main.ts'),
      'utf-8'
    )
    expect(mainSrc).toContain("process.on('unhandledRejection'")
  })
})
