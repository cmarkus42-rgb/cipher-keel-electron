/**
 * mcp-http-server.test.ts — the transport for GraphMcpServer (Paket B, umgezogen in Paket D).
 *
 * Before this file's subject existed, GraphMcpServer.handleRequest had no production
 * caller at all — see the header comment on mcp-server.ts. This test drives the actual
 * server over the actual Unix socket, the same way the stdio bridge does — not a direct call
 * against handleRequest, which would prove nothing about the transport this package adds.
 *
 * **Was Paket D an diesem Test geaendert hat, und warum ersatzlos.** Fuenf Tests pruefen bis
 * dahin den Bearer: dass je Server ein frischer entsteht, drei 401-Wege, und dass wirklich
 * `crypto.timingSafeEqual` gerufen wird und nicht `===`. Alle fuenf sind weg, weil es kein
 * Geheimnis mehr gibt, das sie pruefen koennten — nicht, weil sie unbequem geworden waeren.
 * Sie haben ihre Sache gut gemacht: die 401-Zweige waren gegen einen ersten Entwurf rot, der
 * nur den fehlenden Kopf prueft und den falschen vergisst.
 *
 * Die Grenze, die sie bewacht haben, liegt jetzt woanders, und deshalb steht der Test dafuer
 * auch woanders: tests/harness/sandkasten-lauf.test.ts, "erreicht keinen Unix-Socket", mit
 * der Mutationsprobe daneben. **Wer diesen Server auf 127.0.0.1 zurueckdreht, macht keinen
 * Test in DIESER Datei rot** — das ist keine Nachlaessigkeit, sondern die Folge davon, dass
 * die Zusage nicht mehr hier lebt. Der Modulkopf von mcp-http-server.ts sagt es ebenso.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { request as httpRequest } from 'node:http'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphMcpServer } from '../../src/main/graph/mcp-server'
import {
  startMcpHttpServer,
  brueckenPfad,
  type McpHttpServerHandle,
} from '../../src/main/graph/mcp-http-server'

/** Eine Anfrage ueber den Socket — genau der Weg, den die Bruecke nimmt. */
function ueberSocket(
  sockel: string,
  rumpf: string,
  opts: { method?: string; pfad?: string } = {},
): Promise<{ status: number; text: string }> {
  return new Promise((aufl, ab) => {
    const anfrage = httpRequest(
      {
        socketPath: sockel,
        path: opts.pfad ?? '/mcp',
        method: opts.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(rumpf),
        },
      },
      (antwort) => {
        let text = ''
        antwort.on('data', (c) => { text += c })
        antwort.on('end', () => aufl({ status: antwort.statusCode ?? 0, text }))
      },
    )
    anfrage.on('error', ab)
    anfrage.end(rumpf)
  })
}

async function rufe(sockel: string, nachricht: unknown): Promise<unknown> {
  const { text } = await ueberSocket(sockel, JSON.stringify(nachricht))
  return JSON.parse(text)
}

describe('MCP transport ueber Unix-Socket (Paket B/D)', () => {
  let db: Database.Database
  let mcpServer: GraphMcpServer
  let handle: McpHttpServerHandle
  let userDataDir: string

  beforeEach(async () => {
    db = openGraphDb({ path: ':memory:' })
    mcpServer = new GraphMcpServer(db)
    // Ein kurzer Pfad ist hier kein Zufall: os.tmpdir() liefert unter macOS
    // /var/folders/… und bleibt weit unter der sun_path-Grenze von 104.
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-ud-'))
    handle = await startMcpHttpServer(mcpServer, userDataDir, '/app')
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => handle.server.close(() => resolve()))
    db.close()
  })

  // --- Paket D: das Ohr ---

  it('lauscht auf einem Socket unter userData, nicht auf einem TCP-Port', () => {
    expect(handle.sockelPfad.startsWith(userDataDir)).toBe(true)
    expect(fs.statSync(handle.sockelPfad).isSocket()).toBe(true)
    // Ein TCP-Listener gaebe hier ein AddressInfo-Objekt zurueck, kein Pfad. Das ist die
    // Zeile, die einen Rueckfall auf 127.0.0.1 sieht — anders als der Rest dieser Datei,
    // der ueber jeden Transport gleich laeuft.
    expect(handle.server.address()).toBe(handle.sockelPfad)
  })

  it('vergibt je Server einen anderen Pfad — zwei Instanzen kollidieren nie', async () => {
    const anderer = await startMcpHttpServer(new GraphMcpServer(db), userDataDir, '/app')
    try {
      expect(anderer.sockelPfad).not.toBe(handle.sockelPfad)
    } finally {
      await new Promise<void>((resolve) => anderer.server.close(() => resolve()))
    }
  })

  it('nimmt eine Anfrage ohne jeden Authorization-Kopf an — es gibt kein Geheimnis mehr', async () => {
    const json = await rufe(handle.sockelPfad, { jsonrpc: '2.0', id: 1, method: 'tools/list' }) as
      { result: { tools: Array<{ name: string }> } }
    expect(json.result.tools).toHaveLength(10)
    expect(json.result.tools.map((t) => t.name)).toContain('graph_search')
    expect(json.result.tools.map((t) => t.name)).toContain('keel_zelle_beauftragen')
  })

  it('schreibt in keine Antwort ein Geheimnis hinein', async () => {
    const { text } = await ueberSocket(
      handle.sockelPfad,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    )
    expect(text).not.toMatch(/Bearer|Authorization|apiKey/i)
  })

  // --- Paket D: der Startbefehl fuer die Bruecke ---

  it('nennt die Bruecke mit dem eigenen Node und ELECTRON_RUN_AS_NODE', () => {
    expect(handle.brueckenBefehl.command).toBe(process.execPath)
    expect(handle.brueckenBefehl.args.at(-1)).toBe(handle.sockelPfad)
    expect(handle.brueckenBefehl.env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('traegt kein url- und kein headers-Feld — nichts, das jemand geheim halten muesste', () => {
    expect(Object.keys(handle.brueckenBefehl).sort()).toEqual(['args', 'command', 'env'])
    expect(JSON.stringify(handle.brueckenBefehl)).not.toMatch(/Bearer|Authorization/)
  })

  it('zeigt auf die entpackte Bruecke, nicht in das asar-Archiv', () => {
    // Ein fremder Prozess startet diese Datei, und der hat keine asar-Kenntnis.
    expect(brueckenPfad('/A/Contents/Resources/app.asar'))
      .toBe('/A/Contents/Resources/app.asar.unpacked/resources/mcp-bridge.mjs')
    // Im Entwicklungsbaum bleibt der Pfad unveraendert.
    expect(brueckenPfad('/repo')).toBe('/repo/resources/mcp-bridge.mjs')
  })

  it('bindet auch dann, wenn eine Socketleiche im Weg liegt', async () => {
    // `close()` raeumt die Datei NICHT weg — das ist der Zustand, den ein Absturz hinterlaesst.
    const leiche = path.join(userDataDir, 'leiche.sock')
    fs.writeFileSync(leiche, '')
    // entferneLeiche laeuft im Serverstart; hier wird nur belegt, dass eine vorhandene Datei
    // den Start nicht blockiert, indem der Start ueber ein Verzeichnis mit Leichen laeuft.
    const zweiter = await startMcpHttpServer(new GraphMcpServer(db), userDataDir, '/app')
    try {
      expect(fs.statSync(zweiter.sockelPfad).isSocket()).toBe(true)
    } finally {
      await new Promise<void>((resolve) => zweiter.server.close(() => resolve()))
    }
  })

  // --- Route ---

  it('answers 404 for any path other than POST /mcp', async () => {
    const { status } = await ueberSocket(handle.sockelPfad, '{}', { pfad: '/other' })
    expect(status).toBe(404)
  })

  it('answers 404 for GET /mcp', async () => {
    const { status } = await ueberSocket(handle.sockelPfad, '', { method: 'GET' })
    expect(status).toBe(404)
  })

  // --- B6: the error path is a JSON-RPC error body, never a bare 500 ---

  it('turns an unparseable body into a -32700 JSON-RPC error, HTTP 200', async () => {
    const { status, text } = await ueberSocket(handle.sockelPfad, '{ this is not json')
    expect(status).toBe(200)
    const json = JSON.parse(text) as { error: { code: number } }
    expect(json.error.code).toBe(-32700)
  })

  it('turns a thrown tool call into a JSON-RPC tool error, not an HTTP 500', async () => {
    // graph_get_node with a missing uid throws inside validateSearchParams-equivalent
    // validation before ever reaching the database — the exact "a tool that throws"
    // case B6 is about.
    const { status, text } = await ueberSocket(handle.sockelPfad, JSON.stringify({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'graph_get_node', arguments: {} },
    }))
    expect(status).toBe(200)
    const json = JSON.parse(text) as {
      result: { content: Array<{ type: string; text: string }>; isError?: boolean }
    }
    expect(json.result.isError).toBe(true)
    const payload = JSON.parse(json.result.content[0].text) as { error: string }
    expect(payload.error).toMatch(/uid/i)
  })

  // --- Paket D: Notifications ---

  it('antwortet auf eine Notification (ohne id) mit leerem Rumpf, nicht mit -32601', async () => {
    // Ueber HTTP war der Fehlerrumpf folgenlos; ueber die stdio-Bruecke waere er eine
    // unaufgeforderte Zeile im Protokollstrom, mit einer id, die der Klient nie vergeben hat.
    const { status, text } = await ueberSocket(handle.sockelPfad, JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized',
    }))
    expect(status).toBe(200)
    expect(text).toBe('')
  })

  it('beantwortet eine unbekannte Methode MIT id weiterhin mit -32601', async () => {
    // Die Gegenprobe zum Test darueber: die Notification-Regel haengt an der fehlenden id,
    // nicht an der Methode. Ohne diese Zeile koennte man -32601 ganz abschalten und beide
    // Tests blieben gruen.
    const json = await rufe(handle.sockelPfad, {
      jsonrpc: '2.0', id: 3, method: 'gibt/es/nicht',
    }) as { error: { code: number } }
    expect(json.error.code).toBe(-32601)
  })

  it('round-trips a real tool call end to end (graph_upsert_node then graph_search)', async () => {
    const call = (method: string, params: unknown) =>
      rufe(handle.sockelPfad, { jsonrpc: '2.0', id: 1, method, params }) as
        Promise<{ result: { content: Array<{ type: string; text: string }> } }>

    await call('tools/call', {
      name: 'graph_upsert_node',
      arguments: {
        kind: 'note',
        title: 'Transporttest',
        path: '/socket-transport-beweis.md',
        body: 'ueber echten Socket geschrieben',
      },
    })

    const searchResult = await call('tools/call', {
      name: 'graph_search',
      arguments: { query: 'Transporttest' },
    })
    const hits = JSON.parse(searchResult.result.content[0].text) as Array<{ title: string }>
    expect(hits.some((h) => h.title === 'Transporttest')).toBe(true)
  })
})
