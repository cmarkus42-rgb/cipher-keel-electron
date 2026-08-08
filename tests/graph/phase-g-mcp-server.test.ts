/**
 * Phase G tests — MCP Server (JSON-RPC).
 * CK-GRAPH-037: MCP-Server with 7 tools, precise schemas, no tool overload.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { GraphMcpServer, TOOL_DEFINITIONS } from '../../src/main/graph/mcp-server'
import type { JsonRpcRequest } from '../../src/main/graph/mcp-server'

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

  it('responds to initialize with server info', () => {
    const res = server.handleRequest(makeReq('initialize'))
    expect(res.error).toBeUndefined()
    const result = res.result as unknown as McpInitializeResult
    expect(result.serverInfo.name).toBe('cipher-keel-graph')
    expect(result.capabilities.tools).toBeDefined()
  })

  // --- tools/list ---

  it('lists exactly 7 tools', () => {
    const res = server.handleRequest(makeReq('tools/list'))
    expect(res.error).toBeUndefined()
    const tools = (res.result as unknown as McpToolsListResult).tools
    expect(tools).toHaveLength(7)
  })

  it('tool names match expected set', () => {
    const res = server.handleRequest(makeReq('tools/list'))
    const names = (res.result as unknown as McpToolsListResult).tools.map((t) => t.name)
    expect(names).toContain('graph_search')
    expect(names).toContain('graph_get_node')
    expect(names).toContain('graph_expand')
    expect(names).toContain('graph_query')
    expect(names).toContain('graph_upsert_node')
    expect(names).toContain('graph_link')
    expect(names).toContain('graph_maintain')
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

  it('returns error for unknown method', () => {
    const res = server.handleRequest(makeReq('unknown/method'))
    expect(res.error).toBeDefined()
    expect(res.error!.code).toBe(-32601)
  })

  // --- tools/call: graph_search ---

  it('graph_search returns results via MCP', () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'note', title: 'MCP Test Note', path: '/mcp.md', body: 'MCP server testing' })

    const res = server.handleRequest(makeReq('tools/call', {
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

  it('graph_get_node returns full node', () => {
    const w = new GraphWriter(db)
    const node = w.upsertNode({ kind: 'note', title: 'Full Node', path: '/full.md', body: 'body content' })

    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_get_node',
      arguments: { uid: node.uid }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.uid).toBe(node.uid)
    expect(data.body).toBe('body content')
  })

  it('graph_get_node returns error for non-existent uid', () => {
    const res = server.handleRequest(makeReq('tools/call', {
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

  it('graph_expand returns neighbors', () => {
    const w = new GraphWriter(db)
    const n1 = w.upsertNode({ kind: 'anforderung', title: 'REQ', path: '/r.md' })
    const n2 = w.upsertNode({ kind: 'artefakt', title: 'ART', path: '/a.ts' })
    w.linkEdge({ src: n2.uid, dst: n1.uid })

    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_expand',
      arguments: { uid: n1.uid, depth: 1 }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.neighbors.length).toBeGreaterThan(0)
  })

  // --- tools/call: graph_query ---

  it('graph_query executes template', () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'anforderung', title: 'REQ X', path: '/r.md' })

    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_query',
      arguments: { template: 'nodes_by_kind', params: { kind: 'anforderung' } }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.count).toBe(1)
  })

  it('graph_query rejects unknown template', () => {
    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_query',
      arguments: { template: 'free_sql_injection' }
    }))

    expect(res.error).toBeUndefined()
    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
  })

  // --- tools/call: graph_upsert_node ---

  it('graph_upsert_node creates a node', () => {
    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_upsert_node',
      arguments: { kind: 'note', title: 'Created via MCP', path: '/mcp-created.md' }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.uid).toBeTruthy()
    expect(data.created).toBe(true)
  })

  it('graph_upsert_node returns schema error for invalid kind', () => {
    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_upsert_node',
      arguments: { kind: 'bogus', title: 'Bad' }
    }))

    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
  })

  // --- tools/call: graph_link ---

  it('graph_link creates an edge', () => {
    const w = new GraphWriter(db)
    const n1 = w.upsertNode({ kind: 'artefakt', title: 'Art', path: '/a.ts' })
    const n2 = w.upsertNode({ kind: 'anforderung', title: 'Req', path: '/r.md' })

    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_link',
      arguments: { src: n1.uid, dst: n2.uid }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.type).toBe('setzt_um')
    expect(data.created).toBe(true)
  })

  // --- tools/call: graph_maintain ---

  it('graph_maintain runs hygiene', () => {
    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_maintain',
      arguments: { operation: 'hygiene' }
    }))

    expect(res.error).toBeUndefined()
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.operation).toBe('hygiene')
  })

  // --- Unknown tool ---

  it('returns error for unknown tool name', () => {
    const res = server.handleRequest(makeReq('tools/call', {
      name: 'graph_destroy_everything'
    }))

    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
  })
})
