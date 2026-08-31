#!/usr/bin/env node
/**
 * mcp-bridge.mjs — stdin/stdout <-> Unix-Socket (Paket D).
 *
 * **Warum es diese Datei gibt.** Claude Codes `http`-Transport nimmt keine Socket-URL. Am
 * 2026-08-31 gemessen, nicht angenommen: `unix://…` wird von `claude mcp add` klaglos
 * gespeichert und beim Verbinden abgewiesen — `ERR_INVALID_ARG_VALUE: protocol must be http:,
 * https: or s3:`. Der `stdio`-Transport startet dagegen jedes Programm, also dieses hier.
 *
 * **Warum ein Socket und nicht 127.0.0.1.** Der Sandkasten (harness/sandkasten.ts) erlaubt
 * einem Kindprozess seit Paket D Loopback, damit `flutter test` ueberhaupt laufen kann. Damit
 * waere ein MCP-Server auf 127.0.0.1 fuer dieses Kind erreichbar — und ueber
 * `keel_zelle_beauftragen` haette es eine Niveau-B-Zelle in der Hand, die OHNE Sandkasten
 * laeuft. Seatbelt kann keinen einzelnen Port aussperren (gemessen, Paket C §4), wohl aber
 * Unix-Sockets als Ganzes: `(allow network-outbound (remote ip "*:*"))` gewaehrt IP-Netz und
 * keine Sockets. Die Grenze haengt also an der Form der Erlaubnis, und diese Datei ist der
 * Preis dafuer.
 *
 * **Wie sie gestartet wird.** Ueber `process.execPath` mit `ELECTRON_RUN_AS_NODE=1`: die App
 * bringt ihr Node mit und setzt keines auf dem System voraus.
 *
 * Eine Zeile rein, eine Zeile raus. Eine Anfrage ohne `id` ist eine Notification und bekommt
 * per JSON-RPC keine Antwort — mcp-http-server.ts schickt dafuer einen leeren Rumpf, und eine
 * leere Zeile nach stdout wuerde der Klient als kaputte Nachricht lesen.
 */

import { request } from 'node:http'
import { createInterface } from 'node:readline'

const sockelPfad = process.argv[2]
if (!sockelPfad) {
  process.stderr.write('[mcp-bridge] kein Socketpfad uebergeben\n')
  process.exit(2)
}

/**
 * Die Antworten gehen in Ankunftsreihenfolge der ANFRAGEN nach stdout, nicht in der ihrer
 * eigenen Ankunft. Ohne diese Kette koennte eine schnelle zweite Antwort eine langsame erste
 * ueberholen: JSON-RPC traegt zwar die `id`, aber ein Klient, der auf die erste Zeile wartet,
 * saehe die Vertauschung trotzdem. Die Kette kostet nichts — der Server dahinter beantwortet
 * ohnehin eine Anfrage nach der anderen.
 */
let kette = Promise.resolve()

createInterface({ input: process.stdin }).on('line', (zeile) => {
  if (!zeile.trim()) return

  kette = kette.then(() => new Promise((fertig) => {
    const anfrage = request(
      {
        socketPath: sockelPfad,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(zeile),
        },
      },
      (antwort) => {
        let rumpf = ''
        antwort.on('data', (c) => { rumpf += c })
        antwort.on('end', () => {
          if (rumpf.length > 0) process.stdout.write(rumpf + '\n')
          fertig()
        })
      },
    )
    // Nach stderr und nie nach stdout: stdout traegt den Protokollstrom, und eine
    // Fehlermeldung darin waere fuer den Klienten eine kaputte JSON-RPC-Nachricht. Die Kette
    // laeuft weiter — ein einzelner Fehlschlag darf den Strom nicht anhalten.
    anfrage.on('error', (e) => {
      process.stderr.write(`[mcp-bridge] ${e.message}\n`)
      fertig()
    })
    anfrage.end(zeile)
  }))
})
