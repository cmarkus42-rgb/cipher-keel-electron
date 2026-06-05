/**
 * mcp-server.ts — MCP Server for the Knowledge Graph.
 *
 * CK-GRAPH-037: Graph tools as MCP server with 5-8 tools.
 *               JSON-RPC 2.0 over stdio, consistent with cipher-mux MCP pattern.
 *               Tool schemas precise enough for agent use.
 *
 * 7 tools:
 *   graph_search       — FTS5 + vec score fusion search (CK-GRAPH-018)
 *   graph_get_node     — Load full node by uid (CK-GRAPH-019)
 *   graph_expand       — Neighborhood expansion (CK-GRAPH-020)
 *   graph_query        — Parameterized templates (CK-GRAPH-021)
 *   graph_upsert_node  — Idempotent node write (CK-GRAPH-022)
 *   graph_link         — Edge write with pair derivation (CK-GRAPH-023)
 *   graph_maintain     — Maintenance operations (CK-GRAPH-024)
 */

import type Database from 'better-sqlite3'
import { graphSearch, graphGetNode, graphExpand } from './search'
import { graphQuery, QUERY_TEMPLATES } from './query'
import { graphMaintain, MAINTAIN_OPERATIONS } from './maintain'
import { GraphWriter } from './writer'
import { NODE_KINDS } from './node-types'
import { EDGE_TYPES, EDGE_SOURCES } from './edge-types'
import type { SearchParams, ExpandParams } from './search'
import type { QueryParams } from './query'
import type { MaintainParams } from './maintain'
import type { UpsertNodeInput, LinkEdgeInput } from './writer'

// ---------------------------------------------------------------------------
// Tool definitions (CK-GRAPH-037)
// ---------------------------------------------------------------------------

export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export const TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'graph_search',
    description: 'Search the knowledge graph. Returns compact hits (uid, kind, title, score) — use graph_get_node to load full details. Score fuses FTS5 full-text and vector similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (full-text)' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
        kind: { type: 'string', enum: [...NODE_KINDS], description: 'Filter by node kind' }
      },
      required: ['query']
    }
  },
  {
    name: 'graph_get_node',
    description: 'Load a full node by uid. Returns all attributes including body and parsed frontmatter.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'Node uid to load' }
      },
      required: ['uid']
    }
  },
  {
    name: 'graph_expand',
    description: 'Expand the neighborhood of a node. Returns neighbors up to a given depth, optionally filtered by edge type. Uses recursive CTEs for multi-step traversal.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'Center node uid' },
        depth: { type: 'number', description: 'Max depth (1-5, default 1)', default: 1 },
        edge_type: { type: 'string', enum: [...EDGE_TYPES], description: 'Filter by edge type' },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], description: 'Traversal direction (default both)', default: 'both' }
      },
      required: ['uid']
    }
  },
  {
    name: 'graph_query',
    description: `Execute a parameterized query template. Available templates: ${QUERY_TEMPLATES.join(', ')}. No free query generation.`,
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: [...QUERY_TEMPLATES], description: 'Template name' },
        params: { type: 'object', description: 'Template parameters (keys depend on template)', additionalProperties: true }
      },
      required: ['template']
    }
  },
  {
    name: 'graph_upsert_node',
    description: 'Create or update a node idempotently. Uses natural key for entity resolution. Validates schema conformity and checks for decision conflicts.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...NODE_KINDS], description: 'Node type' },
        title: { type: 'string', description: 'Node title' },
        path: { type: 'string', description: 'Vault file path' },
        status: { type: 'string', enum: ['aktiv', 'abgeloest', 'verworfen'], description: 'Node status (default aktiv)' },
        body: { type: 'string', description: 'File content for full-text search' },
        content_hash: { type: 'string', description: 'Content hash for change detection' },
        frontmatter: { type: 'object', description: 'Type-specific attributes', additionalProperties: true }
      },
      required: ['kind', 'title']
    }
  },
  {
    name: 'graph_link',
    description: 'Create an edge between two nodes. Edge type is derived from the node-type pair (e.g., artefakt→anforderung = setzt_um). Override with explicit type if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'Source node uid' },
        dst: { type: 'string', description: 'Destination node uid' },
        type: { type: 'string', enum: [...EDGE_TYPES], description: 'Edge type (derived from pair if omitted)' },
        source: { type: 'string', enum: [...EDGE_SOURCES], description: 'Edge origin (default frontmatter)' },
        props: { type: 'object', description: 'Edge properties', additionalProperties: true }
      },
      required: ['src', 'dst']
    }
  },
  {
    name: 'graph_maintain',
    description: `Run a maintenance operation. Operations: ${MAINTAIN_OPERATIONS.join(', ')}. hygiene = detect problems, konsolidierung = merge duplicates, verdichtung = manage summaries.`,
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: [...MAINTAIN_OPERATIONS], description: 'Maintenance operation' }
      },
      required: ['operation']
    }
  }
]

// ---------------------------------------------------------------------------
// MCP Server handler
// ---------------------------------------------------------------------------

export class GraphMcpServer {
  private db: Database.Database
  private writer: GraphWriter

  constructor(db: Database.Database) {
    this.db = db
    this.writer = new GraphWriter(db)
  }

  /** Handle a JSON-RPC 2.0 request and return the response object. */
  handleRequest(request: JsonRpcRequest): JsonRpcResponse {
    try {
      switch (request.method) {
        case 'initialize':
          return this.success(request.id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'cipher-keel-graph', version: '0.1.0' }
          })

        case 'tools/list':
          return this.success(request.id, {
            tools: TOOL_DEFINITIONS
          })

        case 'tools/call':
          return this.handleToolCall(request)

        default:
          return this.error(request.id, -32601, `Method not found: ${request.method}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return this.error(request.id, -32603, message)
    }
  }

  private handleToolCall(request: JsonRpcRequest): JsonRpcResponse {
    const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined
    if (!params?.name) {
      return this.error(request.id, -32602, 'Missing tool name')
    }

    const args = params.arguments ?? {}

    try {
      let result: unknown
      switch (params.name) {
        case 'graph_search':
          result = graphSearch(this.db, args as unknown as SearchParams)
          break
        case 'graph_get_node': {
          const uid = args.uid as string
          if (!uid) return this.toolError(request.id, 'Missing required parameter: uid')
          const node = graphGetNode(this.db, uid)
          if (!node) return this.toolError(request.id, `Node not found: ${uid}`)
          result = node
          break
        }
        case 'graph_expand':
          result = graphExpand(this.db, args as unknown as ExpandParams)
          break
        case 'graph_query':
          result = graphQuery(this.db, args as unknown as QueryParams)
          break
        case 'graph_upsert_node':
          result = this.writer.upsertNode(args as unknown as UpsertNodeInput)
          break
        case 'graph_link':
          result = this.writer.linkEdge(args as unknown as LinkEdgeInput)
          break
        case 'graph_maintain':
          result = graphMaintain(this.db, args as unknown as MaintainParams)
          break
        default:
          return this.toolError(request.id, `Unknown tool: ${params.name}`)
      }

      return this.success(request.id, {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return this.success(request.id, {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true
      })
    }
  }

  private success(id: JsonRpcId, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result }
  }

  private error(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } }
  }

  private toolError(id: JsonRpcId, message: string): JsonRpcResponse {
    return this.success(id, {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true
    })
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

type JsonRpcId = string | number | null

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string }
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

/**
 * Start the MCP server on stdio (newline-delimited JSON-RPC).
 *
 * Usage: import and call startStdioServer(db) from a CLI entry point.
 */
export function startStdioServer(db: Database.Database): void {
  const server = new GraphMcpServer(db)
  const readline = require('readline') as typeof import('readline')

  const rl = readline.createInterface({ input: process.stdin, terminal: false })

  rl.on('line', (line: string) => {
    if (!line.trim()) return
    try {
      const request = JSON.parse(line) as JsonRpcRequest
      const response = server.handleRequest(request)
      process.stdout.write(JSON.stringify(response) + '\n')
    } catch {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      }
      process.stdout.write(JSON.stringify(errorResponse) + '\n')
    }
  })
}
