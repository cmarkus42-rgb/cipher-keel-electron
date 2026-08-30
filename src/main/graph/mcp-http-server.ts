/**
 * mcp-http-server.ts — the transport that makes GraphMcpServer reachable (Paket B).
 *
 * Before this file existed, `GraphMcpServer.handleRequest` had no production caller and
 * `startStdioServer` (mcp-server.ts) was never invoked — see the header comment on
 * mcp-server.ts and docs/anpassbare-flaechen.md ("Was fehlt") for the full history of that
 * gap. This is the missing half: a local HTTP server, started once per app run from
 * service-lifecycle.ts (same pattern as initGraph/initNotes), that speaks JSON-RPC 2.0 over
 * a single `POST /mcp` route.
 *
 * Three properties are load-bearing, not incidental:
 *
 *   - Bound to 127.0.0.1, never 0.0.0.0 — this is a local tool surface for sessions running
 *     on the same machine, not a network service.
 *   - Bound to port 0 (ephemeral) and read back after listen() resolves, so two app
 *     instances (or a restart while an old process lingers) can never collide on a fixed
 *     port. The actual port only ever needs to reach `postLaunchInjection`
 *     (agent/adapters/claude-code.ts), which runs in the same process right after the
 *     server starts — nothing outside this process needs to guess it in advance.
 *   - The bearer key this module mints is fresh per app start (`randomUUID()`, see
 *     startMcpHttpServer below) and lives only in memory here — this file itself never
 *     writes it to a persisted config file, and config-store.ts is explicit that secrets do
 *     not belong there. That claim is about this module's own storage, not about every place
 *     the key ends up: `postLaunchInjection` deliberately writes it to a spawned session's
 *     own `.claude/settings.local.json` and hands it to `claude mcp add-json` as a CLI
 *     argument (see claude-code.ts) — that disclosure is the point of injection, not a leak
 *     this file causes.
 *
 * What this buys, and what it does not: every session created while this app instance is
 * running can reach all ten tools (see postLaunchInjection's call site in ipc-handlers.ts,
 * SESSION_CREATE — called *before* the tmux pane is created, on purpose: `postLaunchInjection`
 * reads none of `AdapterContext`'s fields from a live tmux session, so running it after
 * `createSession` was a race it could not reliably win against the very process it was
 * configuring — see the security-review finding I-1 in the Paket B history for the measured
 * version of that race). A session whose tmux pane survives an app restart cannot be healed
 * by re-injecting even so — its `claude` process already read `settings.local.json` at its
 * own start and does not reload it live. That session stays unreachable until it is
 * destroyed and a new one created. This is not a bug this file introduces and not one it can
 * fix: making the port fixed would not help (the key still rotates by design, see
 * startMcpHttpServer), and making the key stable across restarts would undo the reason it
 * rotates. Named here, not silently accepted — see docs/anpassbare-flaechen.md, "Was fehlt",
 * for the full note.
 *
 * Auth (B2): every request needs `Authorization: Bearer <key>`. Missing or wrong -> 401,
 * no body — a body would confirm to an unauthenticated caller that something is listening
 * at all. The comparison is `crypto.timingSafeEqual`, not `===`: a local single-user tool
 * is still worth not leaking key material through a timing side channel for free.
 *
 * Error path (B6): reuses exactly the two-way split `startStdioServer` already has
 * (-32700 for a body that isn't valid JSON, -32603 for handleRequest throwing in a way its
 * own try/catch didn't already turn into a normal JsonRpcResponse) — not a second policy.
 * Either way the caller gets a JSON-RPC error body over HTTP 200, never a bare 500.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { GraphMcpServer, JsonRpcRequest, JsonRpcResponse } from './mcp-server'

/** A body larger than this is rejected before JSON.parse ever runs (413, no body). */
const MAX_BODY_BYTES = 25 * 1024 * 1024

export interface McpHttpServerHandle {
  readonly server: Server
  /** The bound ephemeral port, read back from the OS after listen() resolves (B3). */
  readonly port: number
  /**
   * The per-app-start bearer key (B2) — this module keeps it in memory only and never
   * writes it to disk itself. `postLaunchInjection` (claude-code.ts) does write it, into a
   * spawned session's own project settings and CLI invocation — an intentional disclosure
   * to the session that needs to authenticate, not a claim that the key never touches disk
   * anywhere in the app.
   */
  readonly apiKey: string
  /** Full URL of the one route this server answers, e.g. http://127.0.0.1:54321/mcp. */
  readonly url: string
}

/**
 * Starts the MCP HTTP transport bound to 127.0.0.1 on an OS-assigned ephemeral port.
 * Resolves once the socket is actually listening and the real port is known.
 */
export function startMcpHttpServer(mcpServer: GraphMcpServer): Promise<McpHttpServerHandle> {
  const apiKey = randomUUID()

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void handleHttpRequest(req, res, mcpServer, apiKey)
    })

    // A bind failure (e.g. no loopback interface, exhausted fds) must reject the promise
    // rather than leave the caller waiting on a server that will never come up.
    server.once('error', reject)

    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        // Cannot happen for a TCP listener bound to a hostname+port — named rather than
        // silently defaulted to a made-up port, which would be worse than throwing.
        reject(new Error('[mcp-http-server] server.address() did not return a TCP address'))
        return
      }
      const { port } = address
      resolve({
        server,
        port,
        apiKey,
        url: `http://127.0.0.1:${port}/mcp`,
      })
    })
  })
}

/** Constant-time string comparison — two different lengths are unequal, checked first
 *  so timingSafeEqual (which throws on a length mismatch) is only ever called on
 *  equal-length buffers. The length check itself leaks length, not content; the
 *  bearer key format (a UUID) makes that leak meaningless in practice. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const header = req.headers.authorization
  if (typeof header !== 'string') return false
  return safeEqual(header, `Bearer ${apiKey}`)
}

/**
 * Rejects once the body exceeds MAX_BODY_BYTES, but deliberately does NOT call
 * `req.destroy()` here (minor finding from the security review, 2026-08-30): destroying the
 * request destroys the underlying socket immediately, and `res` shares that socket — a
 * `res.end()` written afterward in the caller's catch block never reaches the client at all
 * (measured: the server-side call does not throw, but the client sees a connection reset,
 * not a 413). `over` just stops accumulating further chunks; the caller writes 413 first,
 * on the still-live socket, and destroys the (by then finished) request afterward to stop
 * reading the rest of an oversized body.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let over = false
    req.on('data', (chunk: Buffer) => {
      if (over) return
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        over = true
        reject(new Error('body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  mcpServer: GraphMcpServer,
  apiKey: string,
): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404)
    res.end()
    return
  }

  // B2: unauthenticated request gets 401 with no body, before the request body is even
  // read — nothing about a wrong key should be distinguishable from a missing one.
  if (!isAuthorized(req, apiKey)) {
    res.writeHead(401)
    res.end()
    return
  }

  let body: string
  try {
    body = await readBody(req)
  } catch {
    // Write the response BEFORE destroying the request — see the doc comment on readBody.
    res.writeHead(413)
    res.end()
    req.destroy()
    return
  }

  // Two separate try/catches, same reasoning as startStdioServer (mcp-server.ts): a
  // JSON.parse failure is genuinely -32700 Parse error, but handleRequest failing is a
  // different thing — its own try/catch already turns almost everything into a normal
  // JsonRpcResponse, so the second catch below is a last-resort net for a future bug,
  // not an expected path, and must not be mislabeled -32700 either.
  let request: JsonRpcRequest
  try {
    request = JSON.parse(body) as JsonRpcRequest
  } catch {
    const errorResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    }
    writeJson(res, 200, errorResponse)
    return
  }

  try {
    const response = await mcpServer.handleRequest(request)
    writeJson(res, 200, response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const errorResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id ?? null,
      error: { code: -32603, message },
    }
    writeJson(res, 200, errorResponse)
  }
}
