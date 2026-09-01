/**
 * mcp-bruecke.test.ts — die stdio-Bruecke auf den Unix-Socket (Paket D).
 *
 * Echter Kindprozess, echter Socket, kein Mock: die Bruecke IST ein Programm, und was an ihr
 * schiefgehen kann (Rahmung, Notifications, stdout gegen stderr), zeigt sich nur, wenn sie
 * wirklich laeuft. Ein Test gegen eine importierte Funktion wuerde ueber genau die Frage
 * hinweggehen, fuer die es die Datei gibt.
 *
 * Warum es sie ueberhaupt gibt, am 2026-08-31 gemessen: Claude Codes `http`-Transport nimmt
 * keine Socket-URL. `unix://…` wird von `claude mcp add` klaglos gespeichert und beim
 * Verbinden abgewiesen — `ERR_INVALID_ARG_VALUE: protocol must be http:, https: or s3:`.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const BRUECKE = path.resolve(__dirname, '../../resources/mcp-bridge.mjs')

let kind: ChildProcess | null = null
let server: Server | null = null

afterEach(async () => {
  kind?.kill()
  kind = null
  if (server) {
    await new Promise<void>((aufl) => server!.close(() => aufl()))
    server = null
  }
})

/** Ein Server, der jede Anfrage beantwortet — und eine ohne `id` mit leerem Rumpf, wie es
 *  mcp-http-server.ts fuer eine Notification tut. */
function starteServer(sock: string): Promise<Server> {
  const s = createServer((req, res) => {
    let rumpf = ''
    req.on('data', (c) => { rumpf += c })
    req.on('end', () => {
      const r = JSON.parse(rumpf)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (r.id === undefined) { res.end(''); return }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: r.id, result: { echo: r.method } }))
    })
  })
  return new Promise((aufl) => s.listen(sock, () => aufl(s)))
}

function frischerSocket(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-br-'))
  return path.join(d, 'p.sock')
}

function starteBruecke(sock: string): ChildProcess {
  return spawn(process.execPath, [BRUECKE, sock], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
}

describe('mcp-bridge.mjs', () => {
  it('reicht eine JSON-RPC-Zeile ueber den Socket und die Antwort zurueck', async () => {
    const sock = frischerSocket()
    server = await starteServer(sock)
    kind = starteBruecke(sock)

    const antwort = new Promise<string>((aufl) => {
      let puffer = ''
      kind!.stdout!.on('data', (c) => {
        puffer += c
        const nl = puffer.indexOf('\n')
        if (nl >= 0) aufl(puffer.slice(0, nl))
      })
    })
    kind.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) + '\n')

    expect(JSON.parse(await antwort)).toEqual({
      jsonrpc: '2.0', id: 7, result: { echo: 'tools/list' },
    })
  })

  it('haelt die Reihenfolge zweier Anfragen ein', async () => {
    // Eine Bruecke, die je Zeile eine eigene HTTP-Anfrage aufmacht, kann Antworten
    // vertauschen. JSON-RPC traegt zwar die id, aber ein Klient, der auf die erste Zeile
    // wartet, sieht die Vertauschung trotzdem — also festhalten, was heute gilt.
    const sock = frischerSocket()
    server = await starteServer(sock)
    kind = starteBruecke(sock)

    const zeilen: string[] = []
    const zwei = new Promise<void>((aufl) => {
      let puffer = ''
      kind!.stdout!.on('data', (c) => {
        puffer += c
        let nl
        while ((nl = puffer.indexOf('\n')) >= 0) {
          zeilen.push(puffer.slice(0, nl))
          puffer = puffer.slice(nl + 1)
          if (zeilen.length === 2) aufl()
        }
      })
    })
    kind.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'a' }) + '\n')
    kind.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'b' }) + '\n')
    await zwei

    expect(zeilen.map((z) => JSON.parse(z).id)).toEqual([1, 2])
  })

  it('antwortet auf eine Notification (ohne id) mit keiner Zeile', async () => {
    // Eine leere Zeile nach stdout waere fuer den Klienten eine kaputte JSON-RPC-Nachricht.
    const sock = frischerSocket()
    server = await starteServer(sock)
    kind = starteBruecke(sock)

    let gesehen = ''
    kind.stdout!.on('data', (c) => { gesehen += c })
    kind.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    )
    await new Promise((a) => setTimeout(a, 300))

    expect(gesehen).toBe('')
  })

  it('schreibt einen Verbindungsfehler nach stderr, nie nach stdout', async () => {
    // stdout traegt den Protokollstrom. Eine Fehlermeldung darin wuerde den Klienten
    // aus dem Tritt bringen, statt ihm zu helfen.
    const sock = frischerSocket() // niemand lauscht
    kind = starteBruecke(sock)

    let aus = ''
    let fehler = ''
    kind.stdout!.on('data', (c) => { aus += c })
    kind.stderr!.on('data', (c) => { fehler += c })
    kind.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'a' }) + '\n')
    await new Promise((a) => setTimeout(a, 300))

    expect(aus).toBe('')
    expect(fehler).toContain('[mcp-bridge]')
  })

  it('scheitert laut, wenn kein Socketpfad uebergeben wurde', async () => {
    const ohne = spawn(process.execPath, [BRUECKE], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    const code = await new Promise<number | null>((aufl) => ohne.on('exit', aufl))
    expect(code).toBe(2)
  })
})
