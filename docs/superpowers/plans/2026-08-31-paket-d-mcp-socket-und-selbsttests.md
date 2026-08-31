# Paket D: MCP auf einen Unix-Socket, und Selbsttests im Sandkasten — Umsetzungsplan

> **Für agentische Arbeiter:** PFLICHT-SUB-SKILL: `superpowers:executing-plans` oder
> `superpowers:subagent-driven-development`. Schritte tragen Checkboxen (`- [ ]`).

**Ziel:** keels MCP-Server verlässt TCP und lauscht auf einem Unix-Socket; der Sandkasten
erlaubt danach Loopback (damit `flutter test` läuft) und **keine Unix-Sockets** (damit keels
eigene Werkzeuge unerreichbar bleiben). Der Bearer verschwindet ersatzlos.

**Architektur:** `mcp-http-server.ts` behält HTTP und tauscht nur `listen(port, host)` gegen
`listen(pfad)`. Eine mitgelieferte `stdio`-Brücke (`resources/mcp-bridge.mjs`), gestartet über
`process.execPath` mit `ELECTRON_RUN_AS_NODE=1`, verbindet die CLI-Harnesse mit dem Socket.
`AdapterContext` trägt danach eine Startbeschreibung statt Adresse und Geheimnis.

**Tech Stack:** TypeScript, Electron, Node `node:http` (`socketPath`), vitest, macOS Seatbelt (SBPL).

**Entwurf:** `docs/superpowers/specs/2026-08-31-mcp-unix-socket-und-selbsttests-design.md`

## Globale Vorgaben

- **`npm run lint` gehört in jede Aufgabe.** Der Paket-C-Zweig war seit Task 5 lint-rot, fünf
  Aufgaben lang. Jede Aufgabe endet mit `npm run typecheck && npm run lint && npm run test`.
- Codekommentare **ohne Umlaute** (ae/oe/ue/ss) — Hauskonvention, siehe jede bestehende Datei.
  Markdown-Dokumente tragen Umlaute.
- **Listen werden gemessen, nicht abgeschrieben.** `STANDARD_ZWISCHENSPEICHER` trägt heute zwei
  Einträge, die auf dieser Maschine nicht existieren.
- **Bei jeder neuen Grenze gefragt:** scheitert das laut, oder wartet es? Ein Hänger ist
  schlimmer als ein Fehlschlag.
- Der Beweis ist ein echter Lauf, keine grüne Suite (Task 8).

## Dateiübersicht

| Datei | Rolle |
|---|---|
| `resources/mcp-bridge.mjs` | **neu** — stdin/stdout ↔ Unix-Socket, ~20 Zeilen |
| `src/main/graph/mcp-socket-pfad.ts` | **neu** — Pfad bilden, Länge prüfen, Leiche entfernen |
| `src/main/graph/mcp-http-server.ts` | `listen(pfad)`, 401-Zweig raus, `brueckenBefehl` statt `port`/`apiKey`/`url` |
| `src/main/agent/agent-adapter.ts` | `AdapterContext`: `mcpUrl`/`mcpApiKey` → `mcpBruecke` |
| `src/main/agent/adapters/claude-code.ts` | `stdio`-Eintrag; Pfad 2 (`claude mcp add-json`) entfällt |
| `src/main/agent/adapters/kimi-code.ts` | `stdio`-Eintrag; Bearer-Sätze korrigiert |
| `src/main/ipc-handlers.ts` | Aufrufstelle `postLaunchInjection` |
| `src/main/service-lifecycle.ts` | Start-/Stopp-Protokoll, Socket löschen |
| `src/main/harness/sandkasten.ts` | drei Netz-Zeilen, Deny entfällt, Signal an Kinder, Zwischenspeicher, `bin/cache` |
| `src/main/graph/mcp-server.ts` | Modulkopf: B5-Absatz neu |
| `package.json` | `build.files` trägt `resources/` |

---

## Task 1: Der Socketpfad — bilden, prüfen, aufräumen

**Dateien:**
- Erstellen: `src/main/graph/mcp-socket-pfad.ts`
- Test: `tests/graph/mcp-socket-pfad.test.ts`

**Schnittstellen:**
- Liefert: `sockelPfad(userDataPfad: string): string` — `<userData>/mcp-<8 hex>.sock`, frisch je
  Aufruf. Wirft, wenn der Pfad 104 Byte erreicht.
- Liefert: `entferneLeiche(pfad: string): void` — löscht eine vorhandene Socketdatei, schweigt
  bei `ENOENT`, wirft bei allem anderen.
- Liefert: `SUN_PATH_MAX = 104`

- [ ] **Schritt 1: Test schreiben**

```ts
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { sockelPfad, entferneLeiche, SUN_PATH_MAX } from '../../src/main/graph/mcp-socket-pfad'

describe('sockelPfad', () => {
  it('legt den Socket unter userData ab und endet auf .sock', () => {
    const p = sockelPfad('/Users/x/Library/Application Support/keel')
    expect(p.startsWith('/Users/x/Library/Application Support/keel/mcp-')).toBe(true)
    expect(p.endsWith('.sock')).toBe(true)
  })

  it('vergibt bei jedem Aufruf einen anderen Namen — zwei Instanzen kollidieren nie', () => {
    const a = sockelPfad('/tmp/keel')
    const b = sockelPfad('/tmp/keel')
    expect(a).not.toBe(b)
  })

  it('scheitert laut statt einen abgeschnittenen Pfad zu binden', () => {
    const zuLang = '/tmp/' + 'x'.repeat(SUN_PATH_MAX)
    expect(() => sockelPfad(zuLang)).toThrow(/sun_path/)
  })

  it('laesst einen Pfad knapp unter der Grenze durch', () => {
    // 104 ist die Grenze; der Name haengt mit 18 Zeichen dran (/mcp-<8hex>.sock).
    const basis = '/tmp/' + 'x'.repeat(SUN_PATH_MAX - 18 - 5 - 1)
    expect(() => sockelPfad(basis)).not.toThrow()
  })
})

describe('entferneLeiche', () => {
  it('entfernt eine vorhandene Datei', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-sock-'))
    const p = path.join(d, 'alt.sock')
    fs.writeFileSync(p, '')
    entferneLeiche(p)
    expect(fs.existsSync(p)).toBe(false)
  })

  it('schweigt, wenn nichts da ist', () => {
    expect(() => entferneLeiche('/tmp/gibt-es-nicht-12345.sock')).not.toThrow()
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

Ausführen: `npx vitest run tests/graph/mcp-socket-pfad.test.ts`
Erwartet: FAIL — `Cannot find module '.../mcp-socket-pfad'`

- [ ] **Schritt 3: Umsetzen**

```ts
/**
 * mcp-socket-pfad.ts — der Pfad, auf dem der MCP-Server lauscht, und die zwei Eigenheiten
 * von Unix-Sockets, die ihn von einem Port unterscheiden.
 *
 * **Frisch je App-Start.** Der Name traegt acht Hexzeichen aus `randomUUID`. Das erhaelt
 * genau die Eigenschaft, fuer die vorher Port 0 gewaehlt wurde: zwei App-Instanzen, oder ein
 * Neustart ueber einem noch lebenden alten Prozess, kollidieren nie. Ein fester Pfad taete es.
 *
 * **Laengengrenze.** `sun_path` fasst auf macOS 104 Byte, und ein zu langer Pfad wird beim
 * `bind` **abgeschnitten**, nicht abgewiesen — der Server lauschte dann woanders, als der
 * Klient sucht, und niemand saehe einen Fehler. Deshalb wird hier laut geworfen. Gemessen am
 * 2026-08-31: `/Users/cipher/Library/Application Support/cipher-keel` sind 53 Zeichen, mit
 * dem Namen also 71 — Luft, aber kein Naturgesetz; ein laengerer Kurzname kommt naeher heran.
 */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** macOS `sockaddr_un.sun_path`. Linux hat 108; die kleinere Zahl ist die sichere. */
export const SUN_PATH_MAX = 104

export function sockelPfad(userDataPfad: string): string {
  const name = `mcp-${randomUUID().replace(/-/g, '').slice(0, 8)}.sock`
  const voll = path.join(userDataPfad, name)
  if (Buffer.byteLength(voll, 'utf8') >= SUN_PATH_MAX) {
    throw new Error(
      `[mcp-socket-pfad] Pfad ist ${Buffer.byteLength(voll, 'utf8')} Byte lang und ` +
      `erreicht damit die sun_path-Grenze von ${SUN_PATH_MAX}: ${voll}`,
    )
  }
  return voll
}

/**
 * Ein Absturz laesst die Socketdatei liegen; `listen` scheitert dann mit `EADDRINUSE` auf
 * einer Datei, hinter der niemand mehr lauscht. `ENOENT` ist der Normalfall und kein Fehler.
 */
export function entferneLeiche(pfad: string): void {
  try {
    fs.unlinkSync(pfad)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return
    throw err
  }
}
```

- [ ] **Schritt 4: Test laufen lassen, grün sehen**

Ausführen: `npx vitest run tests/graph/mcp-socket-pfad.test.ts` → PASS

- [ ] **Schritt 5: Gesamtlauf und Commit**

```bash
npm run typecheck && npm run lint && npm run test
git add src/main/graph/mcp-socket-pfad.ts tests/graph/mcp-socket-pfad.test.ts
git commit -m "feat(mcp): der Socketpfad, mit Laengengrenze und Leichenraeumung"
```

---

## Task 2: Die Brücke

**Dateien:**
- Erstellen: `resources/mcp-bridge.mjs`
- Ändern: `package.json` (`build.files`)
- Test: `tests/graph/mcp-bruecke.test.ts`

**Schnittstellen:**
- Die Brücke ist ein Programm, kein Modul: `node mcp-bridge.mjs <socketpfad>`. Sie liest
  zeilenweise JSON-RPC von stdin, schickt jede Zeile als `POST /mcp` über den Socket und
  schreibt die Antwort als eine Zeile nach stdout.
- Eine Anfrage ohne `id` (Notification) bekommt keine Antwortzeile.

- [ ] **Schritt 1: Test schreiben** — echter Socket, echter Kindprozess, kein Mock.

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { createServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const BRUECKE = path.resolve(__dirname, '../../resources/mcp-bridge.mjs')

let kind: ChildProcess | null = null
afterEach(() => { kind?.kill(); kind = null })

function starteServer(sock: string) {
  const s = createServer((req, res) => {
    let b = ''
    req.on('data', c => { b += c })
    req.on('end', () => {
      const r = JSON.parse(b)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: r.id ?? null, result: { echo: r.method } }))
    })
  })
  return new Promise<typeof s>(aufl => s.listen(sock, () => aufl(s)))
}

describe('mcp-bridge.mjs', () => {
  it('reicht eine JSON-RPC-Zeile ueber den Socket und die Antwort zurueck', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-br-'))
    const sock = path.join(d, 'p.sock')
    const server = await starteServer(sock)

    kind = spawn(process.execPath, [BRUECKE, sock], { stdio: ['pipe', 'pipe', 'pipe'] })
    const antwort = new Promise<string>(aufl => {
      let puffer = ''
      kind!.stdout!.on('data', c => {
        puffer += c
        const nl = puffer.indexOf('\n')
        if (nl >= 0) aufl(puffer.slice(0, nl))
      })
    })
    kind.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) + '\n')

    expect(JSON.parse(await antwort)).toEqual({
      jsonrpc: '2.0', id: 7, result: { echo: 'tools/list' },
    })
    server.close()
  })

  it('antwortet auf eine Notification (ohne id) mit keiner Zeile', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-br-'))
    const sock = path.join(d, 'p.sock')
    const server = await starteServer(sock)

    kind = spawn(process.execPath, [BRUECKE, sock], { stdio: ['pipe', 'pipe', 'pipe'] })
    let gesehen = ''
    kind.stdout!.on('data', c => { gesehen += c })
    kind.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    await new Promise(a => setTimeout(a, 300))

    expect(gesehen).toBe('')
    server.close()
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

Ausführen: `npx vitest run tests/graph/mcp-bruecke.test.ts`
Erwartet: FAIL — die Brücke gibt es nicht, `spawn` scheitert bzw. es kommt nichts zurück.

- [ ] **Schritt 3: Umsetzen**

```js
#!/usr/bin/env node
/**
 * mcp-bridge.mjs — stdin/stdout <-> Unix-Socket.
 *
 * Warum es diese Datei gibt: Claude Codes `http`-Transport nimmt keine Socket-URL. Am
 * 2026-08-31 gemessen — `unix://…` wird von `claude mcp add` klaglos gespeichert und beim
 * Verbinden abgewiesen: `ERR_INVALID_ARG_VALUE: protocol must be http:, https: or s3:`. Der
 * `stdio`-Transport startet dagegen jedes Programm, also dieses hier.
 *
 * Gestartet wird sie ueber `process.execPath` mit `ELECTRON_RUN_AS_NODE=1`: die App bringt
 * ihr Node mit und setzt keines auf dem System voraus.
 *
 * Eine Zeile rein, eine Zeile raus. Eine Anfrage ohne `id` ist eine Notification und bekommt
 * per JSON-RPC keine Antwort — der Server schickt dafuer einen leeren Rumpf, und eine leere
 * Zeile nach stdout wuerde der Klient als kaputte Nachricht lesen.
 */
import { request } from 'node:http'
import { createInterface } from 'node:readline'

const sockelPfad = process.argv[2]
if (!sockelPfad) {
  process.stderr.write('[mcp-bridge] kein Socketpfad uebergeben\n')
  process.exit(2)
}

createInterface({ input: process.stdin }).on('line', (zeile) => {
  if (!zeile.trim()) return
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
      })
    },
  )
  // Ein Fehler geht nach stderr und nicht nach stdout: stdout traegt den Protokollstrom,
  // und eine Fehlermeldung darin waere fuer den Klienten eine kaputte JSON-RPC-Nachricht.
  anfrage.on('error', (e) => process.stderr.write(`[mcp-bridge] ${e.message}\n`))
  anfrage.end(zeile)
})
```

- [ ] **Schritt 4: `package.json` — die Brücke muss ins Paket**

In `build.files` `"resources/**"` ergänzen. Prüfen, dass `resources/` nicht in `.gitignore`
steht.

- [ ] **Schritt 5: Test laufen lassen, grün sehen**

Ausführen: `npx vitest run tests/graph/mcp-bruecke.test.ts` → PASS

- [ ] **Schritt 6: Gesamtlauf und Commit**

```bash
npm run typecheck && npm run lint && npm run test
git add resources/mcp-bridge.mjs tests/graph/mcp-bruecke.test.ts package.json
git commit -m "feat(mcp): die stdio-Bruecke auf den Unix-Socket"
```

---

## Task 3: Der Server zieht um, der Bearer geht

**Dateien:**
- Ändern: `src/main/graph/mcp-http-server.ts` (ganz)
- Ändern: `tests/graph/mcp-http-server.test.ts`

**Schnittstellen:**
- Konsumiert: `sockelPfad`, `entferneLeiche` (Task 1)
- Liefert: `startMcpHttpServer(mcpServer, userDataPfad: string): Promise<McpHttpServerHandle>`
- Liefert: `McpHttpServerHandle = { server, sockelPfad: string, brueckenBefehl: BrueckenBefehl }`
- Liefert: `BrueckenBefehl = { command: string; args: string[]; env: Record<string,string> }`
  — genau die Form, die `.claude/settings.local.json` und `.kimi-code/mcp.json` brauchen.
- Entfällt: `port`, `apiKey`, `url`, `safeEqual`, `isAuthorized`

- [ ] **Schritt 1: Tests umschreiben**

Die fünf Bearer-Tests (Zeilen 73–162: „mints a fresh key", die drei 401-Tests, der
`timingSafeEqual`-Test) fallen **ersatzlos** — es gibt kein Geheimnis mehr, das sie prüfen
könnten. Die zwei Bindungstests (60, 68) werden zu Socket-Tests. 404/413/−32700/−32603 und der
Ende-zu-Ende-Test bleiben, nur der Klient wechselt von `port` auf `socketPath`.

Neu dazu:

```ts
it('lauscht auf einem Socket unter userData, nicht auf einem TCP-Port', async () => {
  const h = await startMcpHttpServer(mcpServer, userDataDir)
  expect(h.sockelPfad.startsWith(userDataDir)).toBe(true)
  expect(fs.statSync(h.sockelPfad).isSocket()).toBe(true)
  expect(h.server.address()).toBe(h.sockelPfad)   // kein AddressInfo-Objekt = kein TCP
})

it('nimmt eine Anfrage ohne jeden Authorization-Kopf an — es gibt kein Geheimnis mehr', async () => {
  const h = await startMcpHttpServer(mcpServer, userDataDir)
  const a = await postUeberSocket(h.sockelPfad, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
  expect(a.status).toBe(200)
  expect(a.body.result.tools).toHaveLength(10)
})

it('nennt die Bruecke mit process.execPath und ELECTRON_RUN_AS_NODE', async () => {
  const h = await startMcpHttpServer(mcpServer, userDataDir)
  expect(h.brueckenBefehl.command).toBe(process.execPath)
  expect(h.brueckenBefehl.args.at(-1)).toBe(h.sockelPfad)
  expect(h.brueckenBefehl.env.ELECTRON_RUN_AS_NODE).toBe('1')
})

it('bindet auch dann, wenn eine Socketleiche im Weg liegt', async () => {
  // Kein Absturz simulierbar; also der Zustand, den ein Absturz hinterlaesst.
  const h1 = await startMcpHttpServer(mcpServer, userDataDir)
  const leiche = h1.sockelPfad
  h1.server.close()
  expect(fs.existsSync(leiche)).toBe(true)   // close() raeumt nicht auf
  // Ein Server, der genau diesen Pfad noch einmal nimmt, muss binden koennen.
  await expect(bindeAufPfad(mcpServer, leiche)).resolves.toBeDefined()
})
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

Ausführen: `npx vitest run tests/graph/mcp-http-server.test.ts`
Erwartet: FAIL — `startMcpHttpServer` nimmt noch kein zweites Argument.

- [ ] **Schritt 3: Umsetzen**

`startMcpHttpServer` bekommt `userDataPfad`, ruft `sockelPfad` und `entferneLeiche`, dann
`server.listen(pfad)`. `handleHttpRequest` verliert den 401-Block und den `apiKey`-Parameter.
Der Modulkopf wird neu geschrieben: die drei „load-bearing properties" (127.0.0.1 / Port 0 /
Bearer) sind alle drei nicht mehr wahr. An ihre Stelle treten die drei neuen — Socket unter
`userData`, frischer Name je Start, **kein Geheimnis** — und der Satz, warum die Grenze jetzt im
Sandkastenprofil hängt und nicht mehr im Anfragekopf.

Wichtig: `entferneLeiche` läuft **vor** `listen`, und der `close()`-Pfad in
`service-lifecycle.ts` (Task 6) löscht die Datei danach.

- [ ] **Schritt 4: Tests laufen lassen, grün sehen**

Ausführen: `npx vitest run tests/graph/mcp-http-server.test.ts` → PASS

- [ ] **Schritt 5: Commit** (typecheck/lint/test laufen erst nach Task 4 wieder grün — die
      Aufrufstellen hängen noch am alten Vertrag. Hier wird **nicht** gemergt, nur committet.)

```bash
git add src/main/graph/mcp-http-server.ts tests/graph/mcp-http-server.test.ts
git commit -m "feat(mcp)!: der Server lauscht auf einem Unix-Socket, der Bearer entfaellt"
```

---

## Task 4: Der Vertrag und die zwei Einspritzungen

**Dateien:**
- Ändern: `src/main/agent/agent-adapter.ts:92-109` (`AdapterContext`)
- Ändern: `src/main/agent/adapters/claude-code.ts` (`postLaunchInjection`, Doc-Kommentar)
- Ändern: `src/main/agent/adapters/kimi-code.ts` (`postLaunchInjection`, Doc-Kommentar)
- Ändern: `src/main/ipc-handlers.ts:440-450`
- Ändern: `tests/agent/claude-code-adapter.test.ts`, `tests/agent/kimi-code-adapter.test.ts`

**Schnittstellen:**
- Konsumiert: `BrueckenBefehl` (Task 3)
- `AdapterContext`: `mcpUrl: string` und `mcpApiKey: string` **entfallen**, `mcpBruecke:
  BrueckenBefehl` kommt.
- Geschriebener Eintrag, für beide Harnesse gleich:
  `{ command, args, env }` — **kein `type`, kein `url`, kein `headers`.**

- [ ] **Schritt 1: Tests umschreiben**

In beiden Adaptertests jede Erwartung auf `type: 'http'`, `url`, `Authorization` ersetzen:

```ts
it('schreibt einen stdio-Eintrag ohne jedes Geheimnis', async () => {
  await adapter.postLaunchInjection({
    projectPath: dir,
    mcpBruecke: { command: '/pfad/electron', args: ['/b.mjs', '/s.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } },
    sessionId: 'test',
  })
  const geschrieben = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.local.json'), 'utf-8'))
  expect(geschrieben.mcpServers['cipher-keel']).toEqual({
    command: '/pfad/electron',
    args: ['/b.mjs', '/s.sock'],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  })
  expect(JSON.stringify(geschrieben)).not.toMatch(/Bearer|Authorization/)
})
```

Und für Claude Code der Test, der Pfad 2 begräbt:

```ts
it('ruft die claude-CLI nicht mehr — der zweite Weg ist weg', async () => {
  const laufe = vi.mocked(runCommand)
  await adapter.postLaunchInjection(ctx)
  expect(laufe).not.toHaveBeenCalled()
})
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

Ausführen: `npx vitest run tests/agent/` → FAIL

- [ ] **Schritt 3: Umsetzen**

1. `AdapterContext`: die zwei Felder gegen `mcpBruecke` tauschen, Doc-Kommentar dazu.
2. `claude-code.ts`: `mcpServerConfig` wird `{ ...ctx.mcpBruecke }`. **Pfad 2 fällt ganz**
   (`runCommand('claude', ['mcp', 'remove'…])` und `['mcp', 'add-json'…]`) — er trug den
   Schlüssel als CLI-Argument, also in `ps` sichtbar, und war der nicht zurücknehmbare der
   beiden. Damit wird der Rückgabewert der Einspritzung ehrlicher, nicht ärmer: es gibt nur
   noch einen Weg und der ist vollständig zurücknehmbar.
3. `kimi-code.ts`: `eintrag` wird `{ ...ctx.mcpBruecke }`.
4. `ipc-handlers.ts`: `mcpUrl`/`mcpApiKey` gegen `mcpBruecke: services.mcpHttpServer.brueckenBefehl`.
5. **Alle Sätze über den Bearer korrigieren.** Die Liste ist vollständig — sie stammt aus einem
   `grep`, das absichtlich nicht nur nach „Bearer" gesucht hat (Task 9 der Paket-C-Strecke fand
   mit einem Suchwort einen von sechs Treffern):
   - `mcp-http-server.ts` — Modulkopf, `McpHttpServerHandle.apiKey` (in Task 3 erledigt)
   - `mcp-server.ts` — Modulkopf, B5-Absatz (Task 5)
   - `claude-code.ts` — der lange Doc-Kommentar über `postLaunchInjection`: „one bearer key is
     minted per app start and shared by every session of a project (B5)" und die Sätze über
     Pfad 2
   - `kimi-code.ts` — „ein Bearer-Schluessel wird je App-Start einmal erzeugt", „einen
     gueltigen Bearer woertlich enthalten kann", der `.gitignore`-Absatz
   - `agent-adapter.ts` — `AdapterContext`
   - `ipc-handlers.ts` — „a live bearer key can be left behind in settings.local.json"
   - `docs/anpassbare-flaechen.md`

- [ ] **Schritt 4: Tests laufen lassen, grün sehen**

```bash
npm run typecheck && npm run lint && npm run test
```
Erwartet: alles grün — der Vertrag ist wieder geschlossen.

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "feat(mcp)!: die Einspritzung reicht einen Startbefehl statt eines Geheimnisses"
```

---

## Task 5: Der Modulkopf von mcp-server.ts — B5 beantwortet

**Dateien:**
- Ändern: `src/main/graph/mcp-server.ts:27-63`

Kein Test — es ist Prosa, und sie ist heute falsch. Der Absatz „The scoping this implies (B5):
one key for every session of this app instance" beschreibt eine Welt mit Schlüsseln.

- [ ] **Schritt 1: Neu schreiben.** Der Absatz muss vier Dinge sagen:
  1. B5 ist beantwortet, indem die Voraussetzung entfällt: es gibt keinen Schlüssel.
  2. Das alte Argument („ein Schlüssel je Sitzung kauft Authentisierungs- ohne
     Autorisierungsschärfe") bleibt richtig und wird nur um seine Voraussetzung erleichtert.
  3. Was die Grenze **jetzt** hält: `sandkasten.ts` erlaubt keine Unix-Sockets, gemessen am
     2026-08-31. Die Erreichbarkeitsaussage („conditional, not universal") gilt weiter, ihre
     Bedingung ist dieselbe geblieben.
  4. Was offen bleibt: darf Sitzung A den Lauf von Sitzung B auslesen? Ungebaut, benannt, und
     nach diesem Paket eine Frage zwischen Sitzungen desselben Menschen — kein Ausbruch mehr.

- [ ] **Schritt 2: Gesamtlauf und Commit**

```bash
npm run typecheck && npm run lint && npm run test
git add src/main/graph/mcp-server.ts
git commit -m "docs(mcp): B5 ist beantwortet -- es gibt keinen Schluessel mehr"
```

---

## Task 6: Der Lebenszyklus

**Dateien:**
- Ändern: `src/main/service-lifecycle.ts:369-373` (Start), `:165-175` (Stopp)
- Ändern: `src/main/window-manager.ts:48-51` (Doc-Kommentar `mcpHttpServer`)

- [ ] **Schritt 1: Start.** `startMcpHttpServer(services.graphMcpServer, app.getPath('userData'))`.
  Die Protokollzeile nennt den Socketpfad statt der URL. Ein zu langer Pfad (Task 1) landet
  im vorhandenen `catch` und setzt `mcp` auf `degraded` — das ist die richtige Stelle: die App
  läuft weiter, nur ohne die zehn Werkzeuge, genau wie beim degradierten Graphen.

- [ ] **Schritt 2: Stopp.** Nach `server.close()` die Socketdatei entfernen —
  `close()` tut das **nicht**, und ein nächster Start würde sonst eine Leiche mehr im
  `userData` finden (er käme damit klar, Task 1, aber Müll bleibt Müll). Der bestehende
  Kommentar über die veraltete Adresse/den veralteten Schlüssel wird korrigiert: veraltet ist
  jetzt der Socketpfad, und die Sitzung, die einen App-Neustart überlebt, verliert die
  Werkzeuge aus demselben Grund wie vorher — der Pfad ist frisch, nicht der Schlüssel.

- [ ] **Schritt 3: Gesamtlauf und Commit**

```bash
npm run typecheck && npm run lint && npm run test
git add src/main/service-lifecycle.ts src/main/window-manager.ts
git commit -m "feat(mcp): Lebenszyklus -- Socketpfad statt Port, und die Datei geht mit"
```

---

## Task 7: Der Sandkasten

**Dateien:**
- Ändern: `src/main/harness/sandkasten.ts` (`profilText`, `STANDARD_ZWISCHENSPEICHER`)
- Ändern: `tests/harness/sandkasten-profil.test.ts`, `tests/harness/sandkasten-lauf.test.ts`

**Schnittstellen:**
- `SandkastenKontext` bekommt `flutterWurzel: string | null` — der Aufrufer misst
  `$FLUTTER_ROOT` (oder leitet es aus `which flutter` ab); `null` heisst „kein Flutter da,
  keine Regel". **Nicht raten:** die Liste, die geraten wurde, trägt zwei Einträge, die es
  nicht gibt.

- [ ] **Schritt 1: Profiltests schreiben**

```ts
it('erlaubt unter zu Loopback in allen drei Richtungen', () => {
  const p = profilText({ ...ktx, netz: 'zu' })
  expect(p).toContain('(allow network-bind     (local  ip "localhost:*"))')
  expect(p).toContain('(allow network-inbound  (local  ip "localhost:*"))')
  expect(p).toContain('(allow network-outbound (remote ip "localhost:*"))')
})

it('erlaubt unter zu kein Netz nach draussen', () => {
  const p = profilText({ ...ktx, netz: 'zu' })
  expect(p).not.toContain('(allow network-outbound (remote ip "*:*"))')
})

it('nennt in keinem Modus Unix-Sockets — sie bleiben unter deny default', () => {
  for (const netz of ['zu', 'offen'] as const) {
    const p = profilText({ ...ktx, netz })
    expect(p).not.toMatch(/network-outbound \((literal|subpath|regex)/)
  }
})

it('braucht den alten localhost-Deny nicht mehr', () => {
  const p = profilText({ ...ktx, netz: 'offen' })
  expect(p).not.toContain('(deny network-outbound (remote ip "localhost:*"))')
})

it('erlaubt Signale an Kinder — sonst haengt jeder Testrunner', () => {
  expect(profilText(ktx)).toContain('(allow signal (target self) (target children))')
})

it('gibt vom Flutter-Zwischenspeicher nur die vier Namen frei, nie den Baum', () => {
  const p = profilText({ ...ktx, flutterWurzel: '/opt/homebrew/share/flutter' })
  expect(p).toContain('(allow file-write* (literal "/opt/homebrew/share/flutter/bin/cache/engine.stamp"))')
  expect(p).toContain('(allow file-write* (literal "/opt/homebrew/share/flutter/bin/cache/engine.realm"))')
  expect(p).toContain('(allow file-write* (literal "/opt/homebrew/share/flutter/bin/cache/lockfile"))')
  expect(p).toContain('engine\\\\.stamp\\\\.tmp\\\\.')          // das pid-Muster als Regex
  expect(p).not.toContain('(allow file-write* (subpath "/opt/homebrew/share/flutter'))
})

it('schweigt ueber Flutter, wenn keines da ist', () => {
  expect(profilText({ ...ktx, flutterWurzel: null })).not.toContain('bin/cache')
})

it('fuehrt .dart-tool und nicht die zwei Eintraege, die es nicht gibt', () => {
  expect(STANDARD_ZWISCHENSPEICHER).toContain('.dart-tool')
  expect(STANDARD_ZWISCHENSPEICHER).not.toContain('.dart')
  expect(STANDARD_ZWISCHENSPEICHER).not.toContain('.flutter')
})
```

- [ ] **Schritt 2: Lauftests umschreiben** (`sandkasten-lauf.test.ts`, `describe('starte — Netz')`)

Die zwei Tests „erreicht die eigene Maschine nicht" (171, 178) behaupten jetzt das Gegenteil
dessen, was gebaut wird — sie werden gedreht:

```ts
it('zu: erreicht einen Loopback-Dienst — das ist der Punkt, damit Tests laufen', async () => {
  const r = await starte(`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${probePort}`, 'zu')
  expect(r.ausgabe.trim()).toBe('200')
})

it('zu: darf trotzdem nicht nach draussen', async () => {
  const r = await starte("curl -s -o /dev/null -w '%{http_code}' https://example.com", 'zu')
  expect(r.ausgabe.trim()).toBe('000')
})

it('zu: darf einen eigenen Server-Socket oeffnen — listen(2) braucht network-inbound', async () => {
  const r = await starte(
    `python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); s.listen(1); print('OK')"`, 'zu')
  expect(r.ausgabe).toContain('OK')
})

it('erreicht keinen Unix-Socket — hier haengt die Grenze zu keels eigenen Werkzeugen', async () => {
  const r = await starte(`nc -U ${probeSock}`, 'offen')
  expect(r.code).not.toBe(0)
})

it('Mutationsprobe: mit erweiterter Regel gelingt derselbe Aufruf', async () => {
  // Ohne diese Probe belegt der Test darueber nur, dass der Socket nicht da war.
  // Zwei Schutzmechanismen mit derselben Meldung machen einander unprueftbar (Paket C, Task 7).
  const profil = profilText({ ...ktx, netz: 'offen' }) + '\n(allow network-outbound)\n'
  const r = await starteMitProfil(profil, `nc -U ${probeSock}`)
  expect(r.code).toBe(0)
})
```

- [ ] **Schritt 3: Tests laufen lassen, Fehlschlag sehen**

Ausführen: `npx vitest run tests/harness/sandkasten-profil.test.ts tests/harness/sandkasten-lauf.test.ts`

- [ ] **Schritt 4: Umsetzen**

In `profilText`, im Erlaubnisblock **oben** (die Ordnung „alle Erlaubnisse zuerst, alle Verbote
zuletzt" ist die tragende Regel dieser Funktion und bleibt unangetastet):

```ts
'(allow signal (target self) (target children))',
```

und statt des `if (netz === 'offen')`-Blocks mit `(allow network-outbound)`:

```ts
// Gemessen am 2026-08-31: `listen(2)` scheitert mit `Operation not permitted` selbst bei
// UNGEFILTERTEM `(allow network-bind)` — es braucht `network-inbound`. Der Dart-Testrunner
// oeffnet einen Server-Socket auf 127.0.0.1; ohne diese drei Zeilen laeuft `flutter test`
// im Sandkasten nicht, und zwar auch nicht unter `offen`.
//
// Und: keine dieser Zeilen nennt einen Pfad, also bleiben **Unix-Sockets unter
// `(deny default)`**. Das ist die ganze Grenze zu keels eigenem MCP-Server, der seit Paket D
// auf einem Socket unter `userData` lauscht und nicht mehr auf 127.0.0.1. Gemessen:
// `(allow network-outbound (remote ip "*:*"))` -> `nc -U <sock>` = rc 1. Die Zusage haengt
// an der FORM der Erlaubnis, nicht an einer Verbotszeile, die jeden Pfad kennen muesste —
// ein `(deny file-read* file-write*)` auf dem Verzeichnis haelt den Connect NICHT auf
// (rc 0, gemessen), denn Seatbelt mediiert ihn als Netz-, nicht als Dateioperation.
//
// Der Preis, laut gesagt: das Kind erreicht jeden lokal lauschenden Dienst. Auf dieser
// Maschine am 2026-08-31 unter anderem Ollama (11433), ein llama-server (8766), `adb`
// (5037) und mehrere Python-Dienste. Das ist Datenpreisgabe, kein Ausbruch — der Ausbruch
// lief ueber keels MCP (eine beauftragte Niveau-B-Zelle laeuft OHNE Sandkasten), und der
// ist zu. Wer diese Zeilen anfasst, faellt genau diese Abwaegung neu.
const ziel = netz === 'offen' ? '*:*' : 'localhost:*'
zeilen.push(
  `(allow network-bind     (local  ip "${ziel}"))`,
  `(allow network-inbound  (local  ip "${ziel}"))`,
  `(allow network-outbound (remote ip "${ziel}"))`,
  '',
)
```

Der `if (netz === 'offen')`-Block **unten** mit `(deny network-outbound (remote ip
"localhost:*"))` fällt ersatzlos — er schützte den TCP-MCP-Server, den es nicht mehr gibt.
Der lange Kommentar dort wird nicht gelöscht, sondern nach oben verschoben und korrigiert: die
Messreihe (`200` / `000` / `200` / `rc 0`) bleibt wertvoll, ihre Schlussfolgerung ändert sich.

`STANDARD_ZWISCHENSPEICHER`: `.dart` und `.flutter` raus, `.dart-tool` rein, mit dem Grund
im Kommentar (die beiden existieren auf dieser Maschine nicht — abgeschrieben, nicht gemessen).

Die vier `bin/cache`-Regeln, nur wenn `flutterWurzel` gesetzt ist. Für
`engine.stamp.tmp.<pid>` eine Regex-Regel — und dort gilt die gemessene Regel aus Paket C: im
`#"…"`-Literal **ist** `\\` der Rückstrich, vier machen die Regel still unwirksam. Deshalb
`sbplRegex`, nie von Hand.

`flutter precache` gehört in den Aufbau (siehe `neuer-lauf.sh` in `~/keel-teststrecke/` und die
README dort), sonst **hängt** der erste Lauf beim Nachladen der Engine, statt zu scheitern.

- [ ] **Schritt 5: Tests laufen lassen, grün sehen**

```bash
npm run typecheck && npm run lint && npm run test
```

- [ ] **Schritt 6: Commit**

```bash
git add -A
git commit -m "feat(sandkasten): Loopback auf, Unix-Sockets zu, Signal an Kinder"
```

---

## Task 8: Der Beweis — ein echter Lauf, keine grüne Suite

**Dateien:** keine. Das ist die Aufgabe, die Paket C gerettet hat.

Alle drei Funde von Paket C, die zählten, kamen aus einem echten Lauf; keiner aus 3077 Tests.
Die Suite kann einen `ipcMain`-Handler nicht erreichen, und grüne Tests sagen über die
Verdrahtung nichts.

- [ ] **Schritt 1:** App bauen und starten (`run-keel`-Skill).
- [ ] **Schritt 2:** Sitzung über das Gitterfenster anlegen — **Kachelklick, kein direkter
      IPC-Aufruf.**
- [ ] **Schritt 3:** `/mcp` im echten tmux-Pane zeigt `cipher-keel · ✔ connected · 10 tools`.
- [ ] **Schritt 4:** Im Pane ein `graph_search` nach einem Knoten, der Sekunden vorher direkt
      geschrieben wurde. Der laufende Prozess muss die uid zurückgeben.
- [ ] **Schritt 5:** `flutter test` über `shell_ausfuehren` im Sandkasten: `rc=0`, „All tests
      passed", **und die Dauer im Sekundenbereich**. 2:29 Minuten heissen: das Signal an die
      Kinder greift nicht. Die Dauer ist Teil des Beweises, nicht Beiwerk.
- [ ] **Schritt 6:** Gegenprobe — `nc -U <socketpfad>` aus dem Sandkasten heraus muss
      scheitern. **Und die Mutationsprobe dazu** (Task 7, Schritt 2): mit erweiterter Regel muss
      derselbe Aufruf gelingen. Ohne sie belegt das Scheitern nur, dass der Socket nicht da war.
- [ ] **Schritt 7:** Die Zusagen aus Paket C gelten unverändert: ein Schreibversuch ausserhalb
      der Wurzel wird kassiert (`tool.entschieden`, `erlaubt: false`), `.git` bleibt unberührt.
- [ ] **Schritt 8:** Übergabe schreiben — was gemessen wurde, was ungemessen blieb, und der
      Nebenbefund aus §3.1 des Entwurfs (`bind(0.0.0.0)` gelingt unter der localhost-Filterung;
      ob von aussen jemand ankommt, ist **nicht** gemessen).

---

## Selbstprüfung des Plans

**Abdeckung gegen den Entwurf:** §4.1 Transport → Task 1+3 · §4.2 Brücke → Task 2 · §4.3
Einspritzung und Bearer → Task 4+5 · §4.4 Sandkasten → Task 7 · §4.5 die drei mechanischen
Punkte → Task 7 · §5 Beweis → Task 8 · §6 Aufgabenbrief-Regeln → Globale Vorgaben · §7 was
nicht gebaut wird → in Task 5 als Prosa, kein Code.

**Namenskonsistenz:** `sockelPfad`/`entferneLeiche`/`SUN_PATH_MAX` (Task 1) werden in Task 3 und
6 unter genau diesen Namen konsumiert. `BrueckenBefehl` (Task 3) wird in Task 4 unter genau
diesem Namen konsumiert. `mcpBruecke` heisst in `AdapterContext`, in beiden Adaptern und in
`ipc-handlers.ts` gleich.

**Wo der Baum nicht baut:** zwischen Task 3 und Task 4 — der Server liefert schon
`brueckenBefehl`, die Aufrufstellen greifen noch nach `mcpUrl`. Das ist benannt und gewollt
(Task 3, Schritt 5); dazwischen wird nicht gemergt.
