/**
 * keel-zellen-tools.test.ts — the real handler body of the three keel_zellen* MCP tools
 * (graph/mcp-server.ts). `GraphMcpServer` is a plain class, not behind ipcMain, so there is no
 * mocking-electron dance needed here the way `session-auftrag.test.ts` needs for the IPC
 * handler — constructing it directly with a real `Zellenregister` and a fake keel-harness
 * adapter already exercises the exact code path `service-lifecycle.ts` wires in production
 * (`new GraphMcpServer(services.graphDb, services.schleifenZellen, services.praefixJeZelle,
 * services.adapterRegistry)`), just with the last three arguments built here instead of by
 * `registerIpcHandlers`.
 *
 * `keel_zelle_beauftragen` itself delegates to `beauftrageZelle` — its own scenarios (the
 * race, the foreign-run beiEnde, the rollback on throw) are proven once in
 * `tests/session/schleifen-auftrag.test.ts`; this file proves the MCP tool actually reaches
 * that function with the right register/praefix/adapter, not a second copy of those scenarios.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphMcpServer } from '../../src/main/graph/mcp-server'
import type { JsonRpcRequest } from '../../src/main/graph/mcp-server'
import { neuesRegister } from '../../src/main/session/schleifen-sitzungen'
import { SITZUNG_EIGENE_SCHLEIFE } from '../../src/main/agent/agent-adapter'
import type {
  SchleifenSitzungsAdapter, SchleifenStartOpts, SchleifenStartErgebnis, EntitaetsTeile,
} from '../../src/main/agent/agent-adapter'
import type { AdapterRegistry } from '../../src/main/agent/registry'
import type Database from 'better-sqlite3'
import type { Ereignis } from '../../src/main/harness/ereignisse'
import { registerWindow, resetEventBus, type BroadcastTarget } from '../../src/main/event-bus'
import { SESSION_STATUS_CHANGED } from '../../src/shared/ipc-channels'

function makeReq(method: string, params?: unknown, id: number = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params }
}

interface McpToolCallResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

function fakeAdapterRegistry(adapter: SchleifenSitzungsAdapter | undefined): AdapterRegistry {
  return { get: (id: string) => (id === 'keel-harness' ? adapter : undefined) } as unknown as AdapterRegistry
}

function fakeAdapter(impl: (opts: SchleifenStartOpts) => Promise<SchleifenStartErgebnis>): SchleifenSitzungsAdapter {
  return {
    id: 'keel-harness',
    sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
    starteAuftrag: impl,
    brichAb: () => {},
  } as unknown as SchleifenSitzungsAdapter
}

const PRAEFIX: EntitaetsTeile = { body: 'b', persona: 'p', capabilities: 'c', globaleRegeln: 'g' }

describe('keel_zellen', () => {
  it('listet Name, Zustand, eintragId, laufId und letzterEndzustand je Zelle', async () => {
    const db = openGraphDb({ path: ':memory:' })
    const register = neuesRegister()
    register.setze({
      name: 'werkzelle-1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'spark-qwen38-27b',
      zustand: 'leerlaufend', laufId: 'lauf-alt', letzterEndzustand: 'ziel-erreicht',
    })
    const server = new GraphMcpServer(db, register, new Map(), fakeAdapterRegistry(undefined))

    const res = await server.handleRequest(makeReq('tools/call', { name: 'keel_zellen' }))
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)

    expect(data).toEqual([{
      name: 'werkzelle-1', zustand: 'leerlaufend', eintragId: 'spark-qwen38-27b',
      laufId: 'lauf-alt', letzterEndzustand: 'ziel-erreicht',
    }])
    db.close()
  })
})

describe('keel_zelle_beauftragen — ueber den echten GraphMcpServer', () => {
  afterEach(() => resetEventBus())

  // I-2 (Review): der Rundruf war zunaechst ausgelassen, mit einer falschen Begruendung
  // ("MCP-Aufrufer hat kein Fenster") — SESSION_STATUS_CHANGED ist ein broadcast() an ALLE
  // Fenster, keine Antwort an den Aufrufer, und das Gitterfenster hoert darauf
  // (renderer/index.tsx). Dieser Test ruft KEINE eigene sendeStatus-Ueberschreibung — er prueft
  // den echten Default-Pfad (siehe GraphMcpServer-Konstruktor), denselben, den
  // service-lifecycle.ts explizit mit derselben broadcast()-Funktion belegt.
  it(
    'beiStart erreicht ein registriertes Fenster ueber SESSION_STATUS_CHANGED, nicht nur den Rueckgabewert',
    async () => {
      const sent: Array<[string, unknown]> = []
      const fakeWindow: BroadcastTarget = {
        webContents: { send: (channel, ...args) => sent.push([channel, args[0]]) },
        isDestroyed: () => false,
        once: () => {},
      }
      registerWindow(fakeWindow)

      const db = openGraphDb({ path: ':memory:' })
      const register = neuesRegister()
      register.setze({
        name: 'z-rundruf', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
        zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
      })
      const adapter = fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-rundruf')
        return { laufId: 'lauf-rundruf', fortgesetzt: false }
      })
      const server = new GraphMcpServer(
        db, register, new Map([['z-rundruf', PRAEFIX]]), fakeAdapterRegistry(adapter),
      )

      await server.handleRequest(makeReq('tools/call', {
        name: 'keel_zelle_beauftragen',
        arguments: { name: 'z-rundruf', auftragstext: 'los' },
      }))

      expect(sent).toContainEqual([
        SESSION_STATUS_CHANGED, { name: 'z-rundruf', zustand: 'laeuft', laufId: 'lauf-rundruf' },
      ])
      db.close()
    },
  )

  it('beauftragt eine leerlaufende Zelle: laufId kommt sofort zurueck, das Register kippt auf laeuft', async () => {
    const db = openGraphDb({ path: ':memory:' })
    const register = neuesRegister()
    register.setze({
      name: 'z-frisch', wurzel: '/projekt', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const praefixJeZelle = new Map([['z-frisch', PRAEFIX]])
    const starteAuftragCalls: SchleifenStartOpts[] = []
    const adapter = fakeAdapter(async (opts) => {
      starteAuftragCalls.push(opts)
      opts.beiStart?.('lauf-mcp-1')
      return { laufId: 'lauf-mcp-1', fortgesetzt: false }
    })
    const server = new GraphMcpServer(db, register, praefixJeZelle, fakeAdapterRegistry(adapter))

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'keel_zelle_beauftragen',
      arguments: { name: 'z-frisch', auftragstext: 'mach das' },
    }))

    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0].text)
    expect(data).toEqual({ laufId: 'lauf-mcp-1', fortgesetzt: false })
    expect(starteAuftragCalls[0].wurzel).toBe('/projekt')
    expect(register.hole('z-frisch')!.zustand).toBe('laeuft')
    expect(register.hole('z-frisch')!.laufId).toBe('lauf-mcp-1')
    db.close()
  })

  it('eine bereits laufende Zelle nimmt keinen zweiten Auftrag an', async () => {
    const db = openGraphDb({ path: ':memory:' })
    const register = neuesRegister()
    register.setze({
      name: 'z-laeuft', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'lauf-alt', letzterEndzustand: null,
    })
    let called = false
    const adapter = fakeAdapter(async () => { called = true; return { laufId: 'x', fortgesetzt: false } })
    const server = new GraphMcpServer(
      db, register, new Map([['z-laeuft', PRAEFIX]]), fakeAdapterRegistry(adapter),
    )

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'keel_zelle_beauftragen',
      arguments: { name: 'z-laeuft', auftragstext: 'noch einer' },
    }))

    const result = res.result as unknown as McpToolCallResult
    expect(result.isError).toBe(true)
    expect(called).toBe(false)
    db.close()
  })

  it('ohne registrierten keel-harness-Adapter meldet das Werkzeug es benannt', async () => {
    const db = openGraphDb({ path: ':memory:' })
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const server = new GraphMcpServer(db, register, new Map([['z1', PRAEFIX]]), fakeAdapterRegistry(undefined))

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'keel_zelle_beauftragen',
      arguments: { name: 'z1', auftragstext: 'los' },
    }))

    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.error).toBe('Der keel-harness-Adapter ist nicht registriert.')
    db.close()
  })
})

describe('keel_zelle_ergebnis — ueber den echten GraphMcpServer, injiziertes Protokoll', () => {
  it('liefert Endzustand und Ergebnis aus dem letzten run.finished', async () => {
    const db = openGraphDb({ path: ':memory:' })
    const ereignisse: Ereignis[] = [
      { laufId: 'l1', seq: 1, ts: 't', art: 'run.started', nutzlast: {} },
      { laufId: 'l1', seq: 2, ts: 't', art: 'run.finished', nutzlast: { endzustand: 'abgebrochen', grund: 'budget' } },
    ]
    const server = new GraphMcpServer(
      db, null, null, null,
      () => ({} as Database.Database),
      (_db, laufId) => ereignisse.filter((e) => e.laufId === laufId),
    )

    const res = await server.handleRequest(makeReq('tools/call', {
      name: 'keel_zelle_ergebnis', arguments: { laufId: 'l1' },
    }))
    const data = JSON.parse((res.result as unknown as McpToolCallResult).content[0].text)
    expect(data.endzustand).toBe('abgebrochen')
    expect(data.grund).toBe('budget')
    db.close()
  })
})
