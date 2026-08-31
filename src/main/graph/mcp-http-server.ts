/**
 * mcp-http-server.ts — the transport that makes GraphMcpServer reachable (Paket B, umgezogen
 * in Paket D).
 *
 * Before this file existed, `GraphMcpServer.handleRequest` had no production caller and
 * `startStdioServer` (mcp-server.ts) was never invoked — see the header comment on
 * mcp-server.ts and docs/anpassbare-flaechen.md ("Was fehlt") for the full history of that
 * gap. This is the missing half: a local server, started once per app run from
 * service-lifecycle.ts (same pattern as initGraph/initNotes), that speaks JSON-RPC 2.0 over
 * a single `POST /mcp` route.
 *
 * **Paket D hat das Ohr getauscht, und mit ihm alle drei tragenden Eigenschaften.** Bis dahin
 * lauschte dieser Server auf `127.0.0.1` an einem fluechtigen Port und pruefte einen Bearer im
 * Anfragekopf. Keine der drei Aussagen gilt noch. Was an ihre Stelle getreten ist:
 *
 *   - **Ein Unix-Socket unter `userData`, kein TCP.** Der Grund ist der Sandkasten: seit
 *     Paket D bekommt ein Kindprozess von `shell_ausfuehren` Loopback, weil ein Testrunner
 *     ohne einen eigenen Server-Socket auf 127.0.0.1 nicht laufen kann (`flutter test`,
 *     Uebergabe vom 2026-08-31 §5). Damit waere dieser Server fuer dieses Kind erreichbar
 *     gewesen — und ueber `keel_zelle_beauftragen` haette es eine Niveau-B-Zelle in der Hand
 *     gehabt, die OHNE Sandkasten laeuft. Das ist ein Ausbruch, keine Datenpreisgabe.
 *     Seatbelt kann keinen einzelnen Port aussperren (gemessen, Paket C §4:
 *     `(remote ip "127.0.0.1:8802")` ist ein Syntaxfehler, `(remote ip "*:8802")` wird
 *     angenommen und greift nicht) — wohl aber Unix-Sockets als ganze Klasse. Deshalb der
 *     Umzug: nicht weil ein Socket schneller waere, sondern weil er die einzige Grenze ist,
 *     die Seatbelt an dieser Stelle ziehen kann.
 *   - **Ein frischer Pfad je App-Start** (`mcp-socket-pfad.ts`). Das erhaelt die Eigenschaft,
 *     fuer die vorher Port 0 gewaehlt wurde: zwei Instanzen, oder ein Neustart ueber einem
 *     noch lebenden alten Prozess, koennen nie auf demselben Ohr landen.
 *   - **Kein Geheimnis, nirgends.** Der Bearer ist in Paket D ersatzlos entfallen, und das ist
 *     die Antwort auf B5: die Frage war *"darf jede Sitzung jede Zelle beauftragen, oder
 *     bindet der Schluessel an eine Sitzung?"* — sie hat keinen Gegenstand mehr. Gegen das
 *     gesandkastete Kind hat ein Schluessel ohnehin nie geholfen: es liest ihn aus
 *     `.claude/settings.local.json`, das im Projektbaum liegt und lesbar ist, und spricht
 *     danach als die Sitzung, der er gehoert. Ein Schluessel je Sitzung haette den Schaden
 *     begrenzt und den Ausbruch nicht verhindert. Was ihn verhindert, steht in
 *     harness/sandkasten.ts und nirgends sonst.
 *
 * **Wer hier etwas aendert, faellt diese Abwaegung neu.** Ein `server.listen(port, host)`
 * zurueck auf 127.0.0.1 macht keinen Test rot, den es hier gibt — es macht den Sandkasten
 * durchlaessig, und das sieht man dieser Datei nicht an. Der Test, der es sieht, steht in
 * tests/harness/sandkasten-lauf.test.ts ("erreicht keinen Unix-Socket").
 *
 * What this buys, and what it does not: every session created while this app instance is
 * running can reach all ten tools. That half is a measurement, not a promise (2026-08-30):
 * a real Architect session created through the grid window, `/mcp` in its own tmux pane
 * showing `cipher-keel · ✔ connected · 10 tools` and `Auth: ✔ authenticated`, and a real
 * `graph_search` call from that very process returning the uid of a node written seconds
 * earlier — see mcp-server.ts's "This is a measurement, not a promise" note and
 * docs/anpassbare-flaechen.md for the full record, including what stayed unmeasured (the
 * restart-surviving branch below). Diese Messung stammt aus der TCP-Zeit; Paket D schuldet
 * ihre Wiederholung ueber dem Socket (Task 8 des Umsetzungsplans). The mechanism behind it:
 * postLaunchInjection's call site in ipc-handlers.ts, SESSION_CREATE — called *before* the
 * tmux pane is created, on purpose: `postLaunchInjection` reads none of `AdapterContext`'s
 * fields from a live tmux session, so running it after `createSession` was a race it could
 * not reliably win against the very process it was configuring — see the security-review
 * finding I-1 in the Paket B history for the measured version of that race. A session whose
 * tmux pane survives an app restart cannot be healed by re-injecting even so — its `claude`
 * process already read `settings.local.json` at its own start and does not reload it live.
 * That session stays unreachable until it is destroyed and a new one created. This is not a
 * bug this file introduces and not one it can fix: der Socketpfad ist bei jedem Start ein
 * anderer, aus demselben Grund, aus dem der Port es war. Named here, not silently accepted —
 * see docs/anpassbare-flaechen.md, "Was fehlt", for the full note.
 *
 * Error path (B6): reuses exactly the two-way split `startStdioServer` already has
 * (-32700 for a body that isn't valid JSON, -32603 for handleRequest throwing in a way its
 * own try/catch didn't already turn into a normal JsonRpcResponse) — not a second policy.
 * Either way the caller gets a JSON-RPC error body over HTTP 200, never a bare 500.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { GraphMcpServer, JsonRpcRequest, JsonRpcResponse } from './mcp-server'
import { sockelPfad, entferneLeiche } from './mcp-socket-pfad'
import { toUnpackedPath } from './native-binding'

/** A body larger than this is rejected before JSON.parse ever runs (413, no body). */
const MAX_BODY_BYTES = 25 * 1024 * 1024

/**
 * Wie ein CLI-Harness die Bruecke startet — genau die Form, die
 * `.claude/settings.local.json` und `.kimi-code/mcp.json` als `stdio`-Eintrag erwarten.
 *
 * Es steht bewusst kein `url` und kein `headers` darin: was hier hineingeschrieben wird,
 * landet in einer Datei im Projektbaum des Nutzers, und seit Paket D soll dort nichts mehr
 * stehen, das jemand geheim halten muesste.
 */
export interface BrueckenBefehl {
  readonly command: string
  readonly args: string[]
  readonly env: Record<string, string>
}

export interface McpHttpServerHandle {
  readonly server: Server
  /** Der Pfad, auf dem gelauscht wird. Frisch je App-Start (mcp-socket-pfad.ts). */
  readonly sockelPfad: string
  /**
   * Der Startbefehl fuer die stdio-Bruecke. `postLaunchInjection` schreibt ihn in die
   * Konfiguration der jeweiligen Sitzung — eine absichtliche Offenlegung, aber keines
   * Geheimnisses mehr: der Befehl nennt einen Pfad, und wer diesen Pfad erreichen darf,
   * entscheidet das Sandkastenprofil, nicht diese Datei.
   */
  readonly brueckenBefehl: BrueckenBefehl
}

/**
 * Der Pfad zur Bruecke, im Entwicklungsbaum wie im gepackten Programm.
 *
 * `toUnpackedPath` ist hier nicht Vorsicht, sondern Pflicht: die Bruecke wird von einem
 * FREMDEN Prozess gestartet (dem CLI-Harness), und der hat keine asar-Kenntnis. Deshalb
 * traegt package.json `resources/**` sowohl in `files` als auch in `asarUnpack` — ohne das
 * zweite laege die Datei nur im Archiv und kein `spawn` faende sie.
 */
export function brueckenPfad(appPath: string): string {
  return toUnpackedPath(join(appPath, 'resources', 'mcp-bridge.mjs'))
}

/**
 * Starts the MCP transport on a Unix socket under `userDataPfad`.
 * Resolves once the socket is actually listening.
 */
export function startMcpHttpServer(
  mcpServer: GraphMcpServer,
  userDataPfad: string,
  appPath: string,
): Promise<McpHttpServerHandle> {
  // Wirft bei einem zu langen Pfad, statt einen abgeschnittenen zu binden — siehe
  // mcp-socket-pfad.ts. Der Aufrufer (service-lifecycle.ts) faengt das und meldet `mcp`
  // als `degraded`, so wie bei einem degradierten Graphen.
  const pfad = sockelPfad(userDataPfad)

  return new Promise((resolve, reject) => {
    // Vor dem listen, nicht danach: eine liegengebliebene Socketdatei aus einem Absturz
    // laesst `listen` mit EADDRINUSE scheitern — ein Fehlerbild, das nach "eine zweite
    // Instanz laeuft" aussieht und keine ist. Bei einem frisch gewuerfelten Namen ist das
    // beinahe nie der Fall; "beinahe nie" ist der Grund, warum die Zeile trotzdem hier steht.
    try {
      entferneLeiche(pfad)
    } catch (err) {
      reject(err)
      return
    }

    const server = createServer((req, res) => {
      void handleHttpRequest(req, res, mcpServer)
    })

    // A bind failure (e.g. a path the process may not write, exhausted fds) must reject the
    // promise rather than leave the caller waiting on a server that will never come up.
    server.once('error', reject)

    server.listen(pfad, () => {
      server.removeListener('error', reject)
      resolve({
        server,
        sockelPfad: pfad,
        brueckenBefehl: {
          // Das eigene Node der App, nicht eines vom System: `process.execPath` ist unter
          // Electron das Programm selbst, und `ELECTRON_RUN_AS_NODE=1` laesst es als Node
          // laufen. Ein `"command": "node"` waere eine Abhaengigkeit von der Maschine des
          // Nutzers, die keine Fehlermeldung ankuendigt.
          command: process.execPath,
          args: [brueckenPfad(appPath), pfad],
          env: { ELECTRON_RUN_AS_NODE: '1' },
        },
      })
    })
  })
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
): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404)
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

  // Eine Nachricht ohne `id` ist per JSON-RPC eine Notification, und auf eine Notification
  // gehoert KEINE Antwort. Bis Paket D war das folgenlos: `handleRequest` schickt fuer
  // `notifications/initialized` ein `-32601 Method not found` mit `id: null`, und ueber HTTP
  // hat der Klient diesen Rumpf schlicht weggeworfen. Ueber die stdio-Bruecke ist derselbe
  // Rumpf eine unaufgeforderte Zeile im Protokollstrom — eine Antwort auf etwas, das der
  // Klient nie gefragt hat, mit einer `id`, die er nie vergeben hat. Deshalb ein leerer
  // Rumpf: die Bruecke schreibt nichts nach stdout, wenn nichts kommt (mcp-bridge.mjs).
  //
  // Die Zeile steht NACH dem Parsen, weil sie die geparste Nachricht braucht, und VOR
  // `handleRequest`, weil sonst genau die Antwort entstuende, die hier nicht entstehen soll.
  if (request.id === undefined) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end()
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
