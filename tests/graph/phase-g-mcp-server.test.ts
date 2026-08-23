/**
 * Phase G tests — MCP Server (JSON-RPC).
 * CK-GRAPH-037: MCP-Server with 7 graph tools, precise schemas, no tool overload.
 *
 * 2026-08-23: three more tools joined (keel_zellen, keel_zelle_beauftragen,
 * keel_zelle_ergebnis — see graph/mcp-server.ts header comment), and `handleRequest` widened
 * to `JsonRpcResponse | Promise<JsonRpcResponse>` because `keel_zelle_beauftragen` genuinely
 * awaits `starteAuftrag`. Every `it` here now awaits `handleRequest` — `await` on the plain
 * object the seven graph tools and the other two new tools return resolves immediately, so
 * this changes nothing about what these tests exercise, only what TypeScript can prove about
 * the call site.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { GraphMcpServer, TOOL_DEFINITIONS } from '../../src/main/graph/mcp-server'
import type { JsonRpcRequest } from '../../src/main/graph/mcp-server'
import type { Ereignis } from '../../src/main/harness/ereignisse'

function makeReq(method: string, params?: unknown, id: number = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params }
}

// -------------------------------------------------------------------
// Result shapes — JsonRpcResponse.result is `unknown` on the wire;
// these mirror what GraphMcpServer actually puts there (see
// src/main/graph/mcp-server.ts handleRequest / handleToolCall).
// -------------------------------------------------------------------

interface McpInitializeResult {
  serverInfo: { name: string; version: string }
  capabilities: { tools: Record<string, unknown> }
}

interface McpToolsListResult {
  tools: Array<{ name: string }>
}

interface McpToolCallResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

// -------------------------------------------------------------------
// Server lifecycle
// -------------------------------------------------------------------

describe('MCP Server (CK-GRAPH-037)', () => {
  let db: Database.Database
  let server: GraphMcpServer

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    server = new GraphMcpServer(db)
  })
  afterEach(() => { db.close() })

  // --- Initialize ---

  it('responds to initialize with server info', async () => {
    const res = await server.handleRequest(makeReq('initialize'))
    expect(res.error).toBeUndefined()
    const result = res.result as unknown as McpInitializeResult
    // 'cipher-keel', not 'cipher-keel-graph': since 2026-08-23 this server carries the
    // keel_zellen* tools too, not just the graph — and ClaudeCodeAdapter already registers an
    // MCP entry under the key 'cipher-keel' (agent/adapters/claude-code.ts), so the server now
    // answers to the name it is already addressed by.
    expect(result.serverInfo.name).toBe('cipher-keel')
    expect(result.capabilities.tools).toBeDefined()
  })

  // --- tools/list ---

  it('lists exactly 10 tools', async () => {
    const res = await server.handleRequest(makeReq('tools/list'))
    expect(res.error).toBeUndefined()
    const tools = (res.result as unknown as McpToolsListResult).tools
    expect(tools).toHaveLength(10)
  })

  it('tool names match expected set', async () => {
    const res = await server.handleRequest(makeReq('tools/list'))
    const names = (res.result as unknown as McpToolsListResult).tools.map((t) => t.name)
    expect(names).toContain('graph_search')
    expect(names).toContain('graph_get_node')
    expect(names).toContain('graph_expand')
    expect(names).toContain('graph_query')
    expect(names).toContain('graph_upsert_node')
    expect(names).toContain('graph_link')
    expect(names).toContain('graph_maintain')
    expect(names).toContain('keel_zellen')
    expect(names).toContain('keel_zelle_beauftragen')
    expect(names).toContain('keel_zelle_ergebnis')
  })

  it('tool schemas have description and inputSchema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.properties).toBeDefined()
      expect(tool.inputSchema.required).toBeDefined()
    }
  })

  // --- Unknown method ---

  it('returns error for unknown method', async () => {
    const res = await server.handleRequest(makeReq('unknown/method'))
    expect(res.error).toBeDefined()
    expect(res.error!.code).toBe(-32601)
  })

  // --- tools/call: graph_search ---

  it('graph_search returns results via MCP', async () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'note', title: 'MCP Test Note', path: '/mcp.md', body: 'MCP server testing' })

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_search',
      arguments: { query: 'MCP' }
    }))

    expect(res.error).toBeUndefined()
    const content = (res.result as unknown as McpToolCallResult).content[0]
    expect(content.type).toBe('text')
    const data = JSON.parse(content.text)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].title).toContain('MCP')
  })

  // --- tools/call: graph_get_node ---

  it('graph_get_node returns full node', async () => {
    const w = new GraphWriter(db)
    const node = w.upsertNode({ kind: 'note', title: 'Full Node', path: '/full.md', body: 'body content' })

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_get_node',
      arguments: { uid: node.uid }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.uid).toBe(node.uid)
    expect(data.body).toBe('body content')
  })

  it('graph_get_node returns error for non-existent uid', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_get_node',
      arguments: { uid: 'NONEXISTENT_000000000000' }
    }))

    expect(res.error).toBeUndefined()
    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toContain('not found')
  })

  // --- tools/call: graph_expand ---

  it('graph_expand returns neighbors', async () => {
    const w = new GraphWriter(db)
    const n1 = w.upsertNode({ kind: 'anforderung', title: 'REQ', path: '/r.md' })
    const n2 = w.upsertNode({ kind: 'artefakt', title: 'ART', path: '/a.ts' })
    w.linkEdge({ src: n2.uid, dst: n1.uid })

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_expand',
      arguments: { uid: n1.uid, depth: 1 }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.neighbors.length).toBeGreaterThan(0)
  })

  // --- tools/call: graph_query ---

  it('graph_query executes template', async () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'anforderung', title: 'REQ X', path: '/r.md' })

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_query',
      arguments: { template: 'nodes_by_kind', params: { kind: 'anforderung' } }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.count).toBe(1)
  })

  it('graph_query rejects unknown template', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_query',
      arguments: { template: 'free_sql_injection' }
    }))

    expect(res.error).toBeUndefined()
    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
  })

  // --- tools/call: graph_upsert_node ---

  it('graph_upsert_node creates a node', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_upsert_node',
      arguments: { kind: 'note', title: 'Created via MCP', path: '/mcp-created.md' }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.uid).toBeTruthy()
    expect(data.created).toBe(true)
  })

  it('graph_upsert_node returns schema error for invalid kind', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_upsert_node',
      arguments: { kind: 'bogus', title: 'Bad' }
    }))

    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
  })

  // --- tools/call: graph_link ---

  it('graph_link creates an edge', async () => {
    const w = new GraphWriter(db)
    const n1 = w.upsertNode({ kind: 'artefakt', title: 'Art', path: '/a.ts' })
    const n2 = w.upsertNode({ kind: 'anforderung', title: 'Req', path: '/r.md' })

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_link',
      arguments: { src: n1.uid, dst: n2.uid }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.type).toBe('setzt_um')
    expect(data.created).toBe(true)
  })

  // --- tools/call: graph_maintain ---

  it('graph_maintain runs hygiene', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_maintain',
      arguments: { operation: 'hygiene' }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.operation).toBe('hygiene')
  })

  // --- Unknown tool ---

  it('returns error for unknown tool name', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'graph_destroy_everything'
    }))

    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
  })

  // --- tools/call: keel_zellen (no wiring — this server was built with `new GraphMcpServer(db)`
  // alone, so schleifenZellen/praefixJeZelle/adapterRegistry are all null, same as every
  // existing test above) ---

  it('keel_zellen reports unavailable without a register', async () => {
    const res = await server.handleRequest(makeReq('tools/call', { name: 'keel_zellen' }))
    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toContain('nicht verfuegbar')
  })

  it('keel_zelle_beauftragen reports unavailable without a register', async () => {
    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'keel_zelle_beauftragen',
      arguments: { name: 'irgendeine-zelle', auftragstext: 'mach das' }
    }))
    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toContain('nicht verfuegbar')
  })

  // keel_zelle_ergebnis reads through injected harnessDb/lesen functions (constructor params 5
  // and 6, both defaulted to the real electron-backed singletons in production) — a fake pair
  // here means this test never touches electron, unlike a real app run.
  describe('keel_zelle_ergebnis', () => {
    function serverMitProtokoll(ereignisse: Ereignis[]): GraphMcpServer {
      const fakeDb = {} as Database.Database
      return new GraphMcpServer(
        db, null, null, null,
        () => fakeDb,
        (_db, laufId) => ereignisse.filter((e) => e.laufId === laufId),
      )
    }

    it('reports an unknown laufId', async () => {
      const s = serverMitProtokoll([])
      const res = await s.handleRequest(makeReq('tools/call', {
        name: 'keel_zelle_ergebnis',
        arguments: { laufId: 'lauf-existiert-nicht' }
      }))
      const result = res.result as unknown as McpToolCallResult
      expect(result.isError).toBe(true)
      const data = JSON.parse(result.content[0].text)
      expect(data.error).toContain('lauf-existiert-nicht')
    })

    it('reports a run still in progress (no run.finished yet)', async () => {
      const s = serverMitProtokoll([
        { laufId: 'l1', seq: 1, ts: '2026-08-23T00:00:00.000Z', art: 'run.started', nutzlast: {} },
      ])
      const res = await s.handleRequest(makeReq('tools/call', {
        name: 'keel_zelle_ergebnis',
        arguments: { laufId: 'l1' }
      }))
      const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
      expect(data.endzustand).toBeNull()
      expect(data.ergebnis).toBeNull()
      expect(data.hinweis).toBeTruthy()
    })

    it('returns endzustand and ergebnis from the last run.finished', async () => {
      const s = serverMitProtokoll([
        { laufId: 'l2', seq: 1, ts: '2026-08-23T00:00:00.000Z', art: 'run.started', nutzlast: {} },
        {
          laufId: 'l2', seq: 2, ts: '2026-08-23T00:01:00.000Z', art: 'run.finished',
          nutzlast: { endzustand: 'ziel-erreicht', grund: 'fertig', ergebnis: 'die Antwort' },
        },
      ])
      const res = await s.handleRequest(makeReq('tools/call', {
        name: 'keel_zelle_ergebnis',
        arguments: { laufId: 'l2' }
      }))
      const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
      expect(data.endzustand).toBe('ziel-erreicht')
      expect(data.ergebnis).toBe('die Antwort')
      expect(data.grund).toBe('fertig')
    })
  })
})
