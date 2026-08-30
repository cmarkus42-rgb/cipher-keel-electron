/**
 * mcp-http-server.test.ts — the transport for GraphMcpServer (Paket B, B1/B2/B3/B6).
 *
 * Before this file's subject existed, GraphMcpServer.handleRequest had no production
 * caller at all — see the header comment on mcp-server.ts. This test drives the actual
 * HTTP server with real `fetch()` calls, on the real loopback interface, the same way a
 * spawned Claude Code session would — not a direct call against handleRequest, which
 * would prove nothing about the transport this package adds.
 *
 * Falsification (repo rule): both auth failure modes below were red before
 * mcp-http-server.ts existed (this whole file failed to import), and the 401 branches
 * were red again against a first draft that only checked for a *missing* header and
 * forgot the constant-time compare against a *wrong* one — see the commit message.
 *
 * Security review (2026-08-30, I-3): stubbing isAuthorized() to always return true only
 * proves the 401 tests depend on that call — it never touches the bind address or the
 * timing-safe comparison, the two properties that actually decide whether this server has
 * an open ear on the network. Two tests below nail those down directly: one reads the real
 * socket address back from Node (a swap to '0.0.0.0' would still build the same handle.url
 * template and pass every other test in this file), and one spies on
 * `crypto.timingSafeEqual` itself (a swap to `===` would still reject a wrong key — the
 * return value is identical either way — so nothing short of asserting the call happened
 * can tell the two apart).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphMcpServer } from '../../src/main/graph/mcp-server'
import { startMcpHttpServer, type McpHttpServerHandle } from '../../src/main/graph/mcp-http-server'

// Partial mock, same pattern as tests/service-lifecycle.test.ts's exec-util mock: every
// export stays real (timingSafeEqual actually runs and actually compares), only wrapped in
// vi.fn so a call to it is observable.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) }
})
import { timingSafeEqual } from 'node:crypto'

describe('MCP HTTP transport (Paket B)', () => {
  let db: Database.Database
  let mcpServer: GraphMcpServer
  let handle: McpHttpServerHandle

  beforeEach(async () => {
    db = openGraphDb({ path: ':memory:' })
    mcpServer = new GraphMcpServer(db)
    handle = await startMcpHttpServer(mcpServer)
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => handle.server.close(() => resolve()))
    db.close()
  })

  // --- B3: ephemeral port ---

  it('binds to 127.0.0.1 on an OS-assigned port, not a fixed one', () => {
    expect(handle.port).toBeGreaterThan(0)
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}/mcp`)
  })

  // I-3: handle.url is built from the same string template this asserts against — it would
  // read "http://0.0.0.0:<port>/mcp" just as happily if the bind address regressed. Only
  // asking the OS what address the socket is actually bound to catches that.
  it('is actually bound to 127.0.0.1 on the socket, not just in the URL string', () => {
    const address = handle.server.address() as AddressInfo
    expect(address.address).toBe('127.0.0.1')
  })

  it('mints a fresh key per server, not a shared constant', async () => {
    const other = await startMcpHttpServer(new GraphMcpServer(db))
    try {
      expect(other.apiKey).not.toBe(handle.apiKey)
      expect(other.port).not.toBe(handle.port)
    } finally {
      await new Promise<void>((resolve) => other.server.close(() => resolve()))
    }
  })

  // --- B2: auth ---

  it('rejects a request with no Authorization header — 401, no body', async () => {
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(text).toBe('')
  })

  it('rejects a request with the wrong bearer key — 401, no body', async () => {
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer not-the-real-key',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(text).toBe('')
  })

  it('rejects a bearer key of the same length as the real one but wrong content', async () => {
    const wrongSameLength = handle.apiKey.slice(0, -1) + (handle.apiKey.endsWith('0') ? '1' : '0')
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wrongSameLength}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
  })

  it('accepts the real bearer key', async () => {
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${handle.apiKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { result: { tools: Array<{ name: string }> } }
    expect(json.result.tools).toHaveLength(10)
    expect(json.result.tools.map((t) => t.name)).toContain('graph_search')
    expect(json.result.tools.map((t) => t.name)).toContain('keel_zelle_beauftragen')
  })

  // I-3: a wrong key of the SAME length as the real one is the one request that must reach
  // the actual crypto.timingSafeEqual call (a length mismatch short-circuits before it).
  // `===` would reject this key just as correctly — same boolean, same 401 — so the only
  // way to tell a constant-time compare from `===` apart is to see the real call happen.
  it('actually calls crypto.timingSafeEqual for a same-length wrong key, not just ===', async () => {
    vi.mocked(timingSafeEqual).mockClear()
    const wrongSameLength = handle.apiKey.slice(0, -1) + (handle.apiKey.endsWith('0') ? '1' : '0')

    await fetch(handle.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wrongSameLength}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    expect(timingSafeEqual).toHaveBeenCalledTimes(1)
    const [a, b] = vi.mocked(timingSafeEqual).mock.calls[0]
    expect(Buffer.from(a as Uint8Array).length).toBe(Buffer.from(b as Uint8Array).length)
  })

  // --- Route ---

  it('answers 404 for any path other than POST /mcp', async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/other`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${handle.apiKey}` },
      body: '{}',
    })
    expect(res.status).toBe(404)
  })

  it('answers 404 for GET /mcp', async () => {
    const res = await fetch(handle.url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${handle.apiKey}` },
    })
    expect(res.status).toBe(404)
  })

  // --- B6: the error path is a JSON-RPC error body, never a bare 500 ---

  it('turns an unparseable body into a -32700 JSON-RPC error, HTTP 200', async () => {
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${handle.apiKey}`,
      },
      body: '{ this is not json',
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { error: { code: number; message: string } }
    expect(json.error.code).toBe(-32700)
  })

  it('turns a thrown tool call into a JSON-RPC tool error, not an HTTP 500', async () => {
    // graph_get_node with a missing uid throws inside validateSearchParams-equivalent
    // validation before ever reaching the database — the exact "a tool that throws"
    // case B6 is about.
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${handle.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 7, method: 'tools/call',
        params: { name: 'graph_get_node', arguments: {} },
      }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      result: { content: Array<{ type: string; text: string }>; isError?: boolean }
    }
    expect(json.result.isError).toBe(true)
    const payload = JSON.parse(json.result.content[0].text) as { error: string }
    expect(payload.error).toMatch(/uid/i)
  })

  it('round-trips a real tool call end to end (graph_upsert_node then graph_search)', async () => {
    const call = async (method: string, params: unknown) => {
      const res = await fetch(handle.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${handle.apiKey}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      return res.json() as Promise<{ result: { content: Array<{ type: string; text: string }> } }>
    }

    await call('tools/call', {
      name: 'graph_upsert_node',
      arguments: { kind: 'note', title: 'Transporttest', path: '/http-transport-beweis.md', body: 'ueber echten Server geschrieben' },
    })

    const searchResult = await call('tools/call', {
      name: 'graph_search',
      arguments: { query: 'Transporttest' },
    })
    const hits = JSON.parse(searchResult.result.content[0].text) as Array<{ title: string }>
    expect(hits.some((h) => h.title === 'Transporttest')).toBe(true)
  })
})
