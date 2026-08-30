/**
 * mcp-server.ts — MCP Server for the Knowledge Graph and keel's own Niveau-B loop.
 *
 * CK-GRAPH-037: Graph tools as MCP server with 5-8 tools.
 *               JSON-RPC 2.0 over stdio, consistent with cipher-mux MCP pattern.
 *               Tool schemas precise enough for agent use.
 *
 * 7 graph tools:
 *   graph_search       — FTS5 + vec score fusion search (CK-GRAPH-018)
 *   graph_get_node     — Load full node by uid (CK-GRAPH-019)
 *   graph_expand       — Neighborhood expansion (CK-GRAPH-020)
 *   graph_query        — Parameterized templates (CK-GRAPH-021)
 *   graph_upsert_node  — Idempotent node write (CK-GRAPH-022)
 *   graph_link         — Edge write with pair derivation (CK-GRAPH-023)
 *   graph_maintain     — Maintenance operations (CK-GRAPH-024)
 *
 * 3 more tools (2026-08-23), the connection upward the harness-adapter design (§10) named but
 * at the time deliberately did not build a transport for: a strong session (Systems Engineer,
 * Architect, Cyber Factory) can beauftragen a Niveau-B-Gitterzelle the same way it reaches the
 * graph:
 *   keel_zellen             — list Niveau-B cells and their state
 *   keel_zelle_beauftragen  — give a cell an order; returns the laufId immediately, does not
 *                             wait for the run to finish (a run takes minutes; a blocking MCP
 *                             call would be a time bomb)
 *   keel_zelle_ergebnis     — poll a laufId for its end state and result block
 *
 * **Reachability (Paket B, mcp-http-server.ts) is conditional, not universal — say the
 * condition, not "yes" or "no".** All ten tools (the seven graph_* above and the three
 * keel_zelle* below) are reachable from a session that was started while the current app
 * instance is running: `SESSION_CREATE` (ipc-handlers.ts) calls `postLaunchInjection` BEFORE
 * the tmux pane is created (moved there by an I-1 fix, 2026-08-30 — running it after used to
 * race the CLI's own one-time config read and could lose), handing the live HTTP server's
 * address and per-boot key to the not-yet-spawned Claude Code process. A session whose tmux
 * pane survives an app restart is not reachable and cannot be made reachable by re-injecting:
 * its `claude` process already read `settings.local.json` at its own start and does not
 * reload it live, while the server's address and key are both fresh every app start (the key
 * by design — config-store.ts keeps secrets out of the persisted config, and this key is
 * one). Such a session stays unreachable until it is destroyed and a new one created. See
 * mcp-http-server.ts's header comment for why that is a property of the boot-scoped key, not
 * something a fixed port would fix, and docs/anpassbare-flaechen.md ("Was fehlt") for the
 * human-facing half of this note.
 *
 * **This is a measurement, not a promise (2026-08-30).** The freshly-started half of the
 * condition above was watched happen, not inferred from written files: the app was launched
 * for real (`run-keel` skill), a genuine Architect session was created through the actual
 * grid-window UI (a Launcher-Kachel click, not a direct IPC call), and inside that session's
 * real tmux pane, `/mcp` showed `cipher-keel · ✔ connected · 10 tools`, then on drill-down
 * `Status: ✔ connected`, `Auth: ✔ authenticated`, and the URL matching that exact boot's
 * port. The running Claude Code process — not curl, not this file's own tests — was then
 * asked in the pane to call `graph_search` for a node written moments earlier via a direct
 * HTTP call to the same server; it answered "Called cipher-keel" and returned that node's
 * exact uid. That is "a running process read the config and used the tool," the distinction
 * that matters — not "the file contains the right address." What the review above states but
 * this run did not touch, and which stays unmeasured: the restart-surviving branch — no
 * session has been carried across an app restart and then probed for reachability.
 *
 * The scoping this implies (B5): one key for every session of this app instance, not one key
 * per session. `keel_zelle_beauftragen`/`keel_zelle_ergebnis` are meant to let any strong
 * session reach any Niveau-B cell — that is the design above, not an oversight — so a
 * per-session key would buy authentication granularity (which session made this HTTP call)
 * without buying authorization granularity (which cells that session may touch), since nothing
 * in the tool logic ties a cell to an owning session. Accepted and named: these are sessions of
 * the same human, on his own machine.
 */

import type Database from 'better-sqlite3'
import { createInterface } from 'readline'
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
import type { Zellenregister } from '../session/schleifen-sitzungen'
import { beauftrageZelle } from '../session/schleifen-auftrag'
import type { EntitaetsTeile } from '../agent/agent-adapter'
import { istSchleifenAdapter } from '../agent/agent-adapter'
import type { AdapterRegistry } from '../agent/registry'
// Renamed on import (not the constructor param names below) so a test can inject a fake
// harnessDb/lesen pair without ever loading harness-sitzung.ts — which touches
// electron's `app.getPath` — just to exercise keel_zelle_ergebnis.
import { harnessDb as harnessDbEcht } from '../harness-sitzung'
import { lesen as lesenEcht } from '../harness'
import type { Ereignis } from '../harness/ereignisse'
// Same rename-on-import reasoning as harnessDb/lesen above, and the same production default:
// SESSION_STATUS_CHANGED is a broadcast to every window, not a reply to whoever called
// starteAuftrag — the grid window's cell (renderer/index.tsx) has no second way to learn the
// state changed (schleifen-sitzungen.ts: "der Renderer leitet nichts ab"), so an MCP-triggered
// order that skipped this would leave that cell showing leerlaufend while the main process
// tracks laeuft, permanently, since the renderer only initialises the cell at session:create.
import { broadcast as broadcastEcht } from '../event-bus'
import { SESSION_STATUS_CHANGED } from '../../shared/ipc-channels'
import type { SessionStatusChanged } from '../../shared/harness-types'

// ---------------------------------------------------------------------------
// Runtime validation (P2-SEC: replaces double-casts)
// ---------------------------------------------------------------------------

export function assertString(val: unknown, name: string): string {
  if (typeof val !== 'string' || val.trim() === '') {
    throw new Error(`Expected non-empty string for '${name}', got ${typeof val}`)
  }
  return val
}

export function assertOptionalString(val: unknown, name: string): string | undefined {
  if (val === undefined || val === null) return undefined
  if (typeof val !== 'string') {
    throw new Error(`Expected string for '${name}', got ${typeof val}`)
  }
  return val
}

export function assertOptionalNumber(val: unknown, name: string): number | undefined {
  if (val === undefined || val === null) return undefined
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new Error(`Expected number for '${name}', got ${typeof val}`)
  }
  return val
}

export function assertOptionalObject(val: unknown, name: string): Record<string, unknown> | undefined {
  if (val === undefined || val === null) return undefined
  if (typeof val !== 'object' || Array.isArray(val)) {
    throw new Error(`Expected object for '${name}', got ${typeof val}`)
  }
  return val as Record<string, unknown>
}

export function validateSearchParams(args: Record<string, unknown>): SearchParams {
  return {
    query: assertString(args.query, 'query'),
    limit: assertOptionalNumber(args.limit, 'limit'),
    kind: assertOptionalString(args.kind, 'kind') as SearchParams['kind'],
  }
}

export function validateExpandParams(args: Record<string, unknown>): ExpandParams {
  return {
    uid: assertString(args.uid, 'uid'),
    depth: assertOptionalNumber(args.depth, 'depth'),
    edge_type: assertOptionalString(args.edge_type, 'edge_type') as ExpandParams['edge_type'],
    direction: assertOptionalString(args.direction, 'direction') as ExpandParams['direction'],
  }
}

export function validateQueryParams(args: Record<string, unknown>): QueryParams {
  return {
    template: assertString(args.template, 'template'),
    params: assertOptionalObject(args.params, 'params'),
  }
}

export function validateUpsertNodeInput(args: Record<string, unknown>): UpsertNodeInput {
  return {
    kind: assertString(args.kind, 'kind'),
    title: assertString(args.title, 'title'),
    path: assertOptionalString(args.path, 'path'),
    status: assertOptionalString(args.status, 'status'),
    body: assertOptionalString(args.body, 'body'),
    content_hash: assertOptionalString(args.content_hash, 'content_hash'),
    frontmatter: assertOptionalObject(args.frontmatter, 'frontmatter'),
  }
}

export function validateLinkEdgeInput(args: Record<string, unknown>): LinkEdgeInput {
  return {
    src: assertString(args.src, 'src'),
    dst: assertString(args.dst, 'dst'),
    type: assertOptionalString(args.type, 'type'),
    source: assertOptionalString(args.source, 'source'),
    props: assertOptionalObject(args.props, 'props'),
  }
}

export function validateMaintainParams(args: Record<string, unknown>): MaintainParams {
  return {
    operation: assertString(args.operation, 'operation'),
  }
}

export interface ZelleBeauftragenParams {
  name: string
  auftragstext: string
}

/**
 * `name` must be non-empty (assertString) — an empty cell name can never match a real cell.
 * `auftragstext` deliberately does NOT use assertString: an empty order is a valid, distinct
 * rejection ("Der Auftrag ist leer.") that `beauftrageZelle` (session/schleifen-auftrag.ts)
 * owns — assertString's generic "expected non-empty string" would shadow that one message with
 * a second, slightly different one for the same case.
 */
export function validateZelleBeauftragenParams(args: Record<string, unknown>): ZelleBeauftragenParams {
  if (typeof args.auftragstext !== 'string') {
    throw new Error(`Expected string for 'auftragstext', got ${typeof args.auftragstext}`)
  }
  return {
    name: assertString(args.name, 'name'),
    auftragstext: args.auftragstext,
  }
}

export interface ZelleErgebnisParams {
  laufId: string
}

export function validateZelleErgebnisParams(args: Record<string, unknown>): ZelleErgebnisParams {
  return {
    laufId: assertString(args.laufId, 'laufId'),
  }
}

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
  },
  {
    name: 'keel_zellen',
    description: 'List keel\'s own Niveau-B Gitterzellen (its local-model agent loop cells). Each entry: name, zustand (leerlaufend/laeuft), the model registry entry id it runs, its most recent laufId and end state.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'keel_zelle_beauftragen',
    description: 'Give a Niveau-B Gitterzelle an order. Returns the laufId immediately once the run has started — it does NOT wait for the run to finish (a run takes minutes). Poll keel_zelle_ergebnis with the returned laufId for the end state.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Cell name' },
        auftragstext: { type: 'string', description: 'The order text' }
      },
      required: ['name', 'auftragstext']
    }
  },
  {
    name: 'keel_zelle_ergebnis',
    description: 'Poll a laufId for its end state and result block from the run log (run.finished: endzustand, grund, ergebnis). If the run has not finished yet, endzustand and ergebnis come back null with a hint.',
    inputSchema: {
      type: 'object',
      properties: {
        laufId: { type: 'string', description: 'The laufId returned by keel_zelle_beauftragen' }
      },
      required: ['laufId']
    }
  }
]

// ---------------------------------------------------------------------------
// MCP Server handler
// ---------------------------------------------------------------------------

export class GraphMcpServer {
  private db: Database.Database
  private writer: GraphWriter
  // The three fields below back the keel_zellen* tools. Null is a real, expected value here
  // (see the doc comment on AppServices in window-manager.ts) — this class only ever stores
  // them, never dereferences them at construction time, so a caller who has none of this
  // wiring yet (every existing test that does `new GraphMcpServer(db)`) still gets a working
  // graph server; the three new tools just answer "nicht verfuegbar" instead of crashing.
  private schleifenZellen: Zellenregister | null
  private praefixJeZelle: ReadonlyMap<string, EntitaetsTeile> | null
  private adapterRegistry: AdapterRegistry | null
  // Defaulted to the real, electron-backed singletons (harness-sitzung.ts/harness/protokoll.ts)
  // so every production call site (service-lifecycle.ts) is unaffected — injectable so a test
  // of keel_zelle_ergebnis never has to load electron just to reach this constructor.
  private harnessDb: () => Database.Database
  private lesen: (db: Database.Database, laufId: string) => Ereignis[]
  // Same story as harnessDb/lesen: defaulted to the real broadcast() so service-lifecycle.ts
  // needs no change here, injectable so a test can capture calls instead of touching the real
  // event bus.
  private sendeStatus: (status: SessionStatusChanged) => void

  constructor(
    db: Database.Database,
    schleifenZellen: Zellenregister | null = null,
    praefixJeZelle: ReadonlyMap<string, EntitaetsTeile> | null = null,
    adapterRegistry: AdapterRegistry | null = null,
    harnessDb: () => Database.Database = harnessDbEcht,
    lesen: (db: Database.Database, laufId: string) => Ereignis[] = lesenEcht,
    sendeStatus: (status: SessionStatusChanged) => void =
      (status) => broadcastEcht(SESSION_STATUS_CHANGED, status),
  ) {
    this.db = db
    this.writer = new GraphWriter(db)
    this.schleifenZellen = schleifenZellen
    this.praefixJeZelle = praefixJeZelle
    this.adapterRegistry = adapterRegistry
    this.harnessDb = harnessDb
    this.lesen = lesen
    this.sendeStatus = sendeStatus
  }

  /**
   * Handle a JSON-RPC 2.0 request and return the response object — or, for exactly one method
   * (`tools/call` on `keel_zelle_beauftragen`), a Promise of it. `starteAuftrag` behind that one
   * tool is genuinely async (see the header comment on `SchleifenStartOpts.beiStart`,
   * agent-adapter.ts); the other nine tools stay synchronous, unchanged, and still return a
   * plain object. A caller that always awaits the result (as it must, since it cannot tell in
   * advance which branch it will get) is unaffected either way — `await` on a non-Promise
   * value resolves immediately.
   */
  handleRequest(request: JsonRpcRequest): JsonRpcResponse | Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.success(request.id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'cipher-keel', version: '0.1.0' }
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

  private handleToolCall(request: JsonRpcRequest): JsonRpcResponse | Promise<JsonRpcResponse> {
    const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined
    if (!params?.name) {
      return this.error(request.id, -32602, 'Missing tool name')
    }

    const args = params.arguments ?? {}

    // Branched out before the switch below so the other nine tools keep returning a plain
    // JsonRpcResponse, unchanged — see the doc comment on handleRequest.
    if (params.name === 'keel_zelle_beauftragen') {
      return this.handleZelleBeauftragen(request.id, args)
    }

    try {
      let result: unknown
      switch (params.name) {
        case 'graph_search':
          result = graphSearch(this.db, validateSearchParams(args))
          break
        case 'graph_get_node': {
          const uid = assertString(args.uid, 'uid')
          const node = graphGetNode(this.db, uid)
          if (!node) return this.toolError(request.id, `Node not found: ${uid}`)
          result = node
          break
        }
        case 'graph_expand':
          result = graphExpand(this.db, validateExpandParams(args))
          break
        case 'graph_query':
          result = graphQuery(this.db, validateQueryParams(args))
          break
        case 'graph_upsert_node':
          result = this.writer.upsertNode(validateUpsertNodeInput(args))
          break
        case 'graph_link':
          result = this.writer.linkEdge(validateLinkEdgeInput(args))
          break
        case 'graph_maintain':
          result = graphMaintain(this.db, validateMaintainParams(args))
          break
        case 'keel_zellen': {
          if (!this.schleifenZellen) {
            return this.toolError(request.id, 'Das Zellenregister ist nicht verfuegbar.')
          }
          result = this.schleifenZellen.alle().map((z) => ({
            name: z.name,
            zustand: z.zustand,
            eintragId: z.eintragId,
            laufId: z.laufId,
            letzterEndzustand: z.letzterEndzustand,
          }))
          break
        }
        case 'keel_zelle_ergebnis': {
          const { laufId } = validateZelleErgebnisParams(args)
          const ereignisse = this.lesen(this.harnessDb(), laufId)
          if (ereignisse.length === 0) {
            return this.toolError(request.id, `Kein Lauf mit der laufId '${laufId}' gefunden.`)
          }
          const letztes = [...ereignisse].reverse().find((e) => e.art === 'run.finished')
          if (!letztes) {
            result = {
              laufId, endzustand: null, ergebnis: null,
              hinweis: 'Der Lauf laeuft noch — noch kein run.finished im Protokoll.',
            }
          } else {
            result = {
              laufId,
              endzustand: typeof letztes.nutzlast.endzustand === 'string'
                ? letztes.nutzlast.endzustand : null,
              ergebnis: letztes.nutzlast.ergebnis ?? null,
              grund: typeof letztes.nutzlast.grund === 'string' ? letztes.nutzlast.grund : null,
            }
          }
          break
        }
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

  /**
   * keel_zelle_beauftragen — the one tool that awaits `starteAuftrag`. Never rejects: every
   * error path (validation, missing wiring, a thrown starteAuftrag) resolves to a valid
   * JsonRpcResponse with `isError: true`, the same contract the synchronous tools' catch block
   * keeps above — so handleRequest's own (synchronous) try/catch never needs to see a rejection
   * from this method.
   */
  private async handleZelleBeauftragen(
    id: JsonRpcId, args: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    try {
      const { name, auftragstext } = validateZelleBeauftragenParams(args)
      if (!this.schleifenZellen || !this.praefixJeZelle) {
        return this.toolError(id, 'Das Zellenregister ist nicht verfuegbar.')
      }
      const registryEintrag = this.adapterRegistry?.get('keel-harness')
      const adapter = registryEintrag && istSchleifenAdapter(registryEintrag)
        ? registryEintrag : undefined

      const ergebnis = await beauftrageZelle({
        name, auftragstext,
        register: this.schleifenZellen,
        praefixJeZelle: this.praefixJeZelle,
        adapter,
        harnessDb: this.harnessDb, lesen: this.lesen,
        // SESSION_STATUS_CHANGED is a broadcast() to every window, not a reply to whoever called
        // starteAuftrag — so this is not optional the way it looked at first: the grid window's
        // cell (renderer/index.tsx) has no other way to learn the state changed
        // (schleifen-sitzungen.ts: "der Renderer leitet nichts ab"), and it only initialises a
        // cell at session:create. Skipping this would leave that cell showing leerlaufend
        // forever while the main process tracks laeuft — the exact two-source drift this file
        // argues against.
        sendeStatus: this.sendeStatus,
      })
      if (!ergebnis.ok) {
        return this.toolError(id, ergebnis.meldung)
      }
      return this.success(id, {
        content: [{
          type: 'text',
          text: JSON.stringify({ laufId: ergebnis.wert.laufId, fortgesetzt: ergebnis.wert.fortgesetzt }),
        }],
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return this.success(id, {
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
 * Usage: import and call startStdioServer(db) from a CLI entry point — there is none today,
 * see the header comment on this file for the reachability gap this is one half of.
 *
 * The `'line'` listener is `async` since `handleRequest` can now return a Promise (the
 * `keel_zelle_beauftragen` tool). Real behaviour change, named rather than left implicit: with
 * a synchronous listener, responses come back in the exact order their requests arrived; an
 * async listener lets a slow request's response land after a faster, later request's response.
 * A client can still match each response to its request by `id`, but a reader of raw stdio
 * output can no longer assume line order is request order.
 *
 * Parsing and handling are two separate try/catches, not one: a `JSON.parse` failure is
 * genuinely `-32700 Parse error`, but `handleRequest` failing is a different thing entirely —
 * every branch inside it (including `handleZelleBeauftragen`, which its own doc comment says
 * never rejects) already converts its own errors into a valid response, so this second catch is
 * a last-resort net for a future bug, not an expected path. Labeling that net's failure
 * `-32700` too, as one shared catch used to, would tell a client "malformed JSON" for a request
 * that parsed fine and failed for an unrelated reason.
 */
export function startStdioServer(db: Database.Database): void {
  const server = new GraphMcpServer(db)

  const rl = createInterface({ input: process.stdin, terminal: false })

  rl.on('line', async (line: string) => {
    if (!line.trim()) return

    let request: JsonRpcRequest
    try {
      request = JSON.parse(line) as JsonRpcRequest
    } catch {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      }
      process.stdout.write(JSON.stringify(errorResponse) + '\n')
      return
    }

    try {
      const response = await server.handleRequest(request)
      process.stdout.write(JSON.stringify(response) + '\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: -32603, message }
      }
      process.stdout.write(JSON.stringify(errorResponse) + '\n')
    }
  })
}
