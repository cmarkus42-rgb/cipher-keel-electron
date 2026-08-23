/**
 * session-auftrag.test.ts — Task 9: SESSION_AUFTRAG, der Kanal, der einer Niveau-B-Gitterzelle
 * zum ersten Mal einen Auftrag geben kann.
 *
 * Kein Test in diesem Repo erreicht ipcMain direkt. Drei Ebenen hier:
 *
 * 1. Die reine Kette, die der Handler fahren MUSS (pruefeZelleFrei/Zellenregister) — Pflichttests
 *    aus dem Brief.
 * 2. Das Rennen in Worten, gegen das reine Register nachgestellt — ebenfalls Pflicht.
 * 3. Der echte Handler-Rumpf, ueber registerIpcHandlers mit `electron` und `./agent/registry`
 *    gemockt und dem echten Zellenregister per `vi.importActual` durchgereicht — dasselbe Muster
 *    wie tests/session/session-create-schleife.test.ts. Nur so ist bewiesen, dass der Handler
 *    beiStart/beiEnde tatsaechlich verdrahtet, nicht nur, dass die Bausteine fuer sich stimmen.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { neuesRegister, pruefeZelleFrei } from '../../src/main/session/schleifen-sitzungen'
import { SITZUNG_EIGENE_SCHLEIFE } from '../../src/main/agent/agent-adapter'
import type { Zellenregister } from '../../src/main/session/schleifen-sitzungen'
import type { SchleifenStartOpts, SchleifenStartErgebnis } from '../../src/main/agent/agent-adapter'

// ---------------------------------------------------------------------------
// 1. Die reine Kette (Brief Step 2)
// ---------------------------------------------------------------------------

describe('die Kette hinter session:auftrag', () => {
  it('eine laufende Zelle nimmt keinen zweiten Auftrag an', () => {
    const r = neuesRegister()
    r.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'l1', letzterEndzustand: null,
    })
    expect(pruefeZelleFrei('z1', r).ok).toBe(false)
  })

  it('nach dem Lauf ist die Zelle wieder frei und behaelt ihre laufId', () => {
    const r = neuesRegister()
    r.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'l1', letzterEndzustand: null,
    })
    r.setzeZustand('z1', 'leerlaufend', 'ziel-erreicht')
    const p = pruefeZelleFrei('z1', r)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.zelle.laufId).toBe('l1')
  })

  // Das Rennen in Worten: beiStart traegt die laufId ein, beiEnde kippt zurueck. Faellt
  // beiEnde vor beiStart, steht die Zelle danach fuer immer auf 'laeuft'. Deshalb ruft
  // beauftrageSchleife beiStart SYNCHRON vor dem Schleifenstart.
  it('ein Lauf, der vor der Rueckkehr endet, laesst die Zelle nicht auf laeuft stehen', () => {
    const r = neuesRegister()
    r.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    // Reihenfolge wie im Handler: erst setzeLauf (beiStart), dann setzeZustand (beiEnde).
    r.setzeLauf('z1', 'l1')
    r.setzeZustand('z1', 'leerlaufend', 'ziel-erreicht')
    expect(r.hole('z1')!.zustand).toBe('leerlaufend')
    expect(pruefeZelleFrei('z1', r).ok).toBe(true)
  })

  it('das Ende eines fremden Laufs kippt die Zelle nicht', () => {
    const r = neuesRegister()
    r.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'l2', letzterEndzustand: null,
    })
    // Der Id-Vergleich im Handler: nur der eigene Lauf kippt die Zelle.
    const zelle = r.hole('z1')!
    expect(zelle.laufId === 'l1').toBe(false)   // 'l1' ist der beendete, 'l2' der laufende
    expect(zelle.zustand).toBe('laeuft')
  })
})

// ---------------------------------------------------------------------------
// 2. Der echte Handler-Rumpf — session:create (Zelle anlegen) + session:auftrag
// ---------------------------------------------------------------------------

type SessionCreateHandler = (
  event: unknown,
  opts: { name?: string; entityId?: string; cwd?: string },
) => Promise<{ id: string | null; name: string | null; error: string | null; sitzungsart?: string }>

type SessionAuftragHandler = (
  event: unknown,
  args: { name?: string; auftragstext?: string },
) => Promise<{ ok: boolean; meldung?: string; wert?: SchleifenStartErgebnis }>

describe('session:auftrag — der echte Handler-Rumpf', () => {
  let userDataDir: string
  let projectDir: string
  let capturedRegister: Zellenregister | undefined
  let broadcastCalls: Array<[string, unknown]>
  let starteAuftragCalls: SchleifenStartOpts[]
  /** Pro Test austauschbar: bestimmt, wie sich der Fake-Adapter verhaelt. */
  let starteAuftragImpl: (opts: SchleifenStartOpts) => Promise<SchleifenStartErgebnis>

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
    capturedRegister = undefined
    broadcastCalls = []
    starteAuftragCalls = []
    starteAuftragImpl = async (opts) => {
      opts.beiStart?.('lauf-default')
      return { laufId: 'lauf-default', fortgesetzt: false }
    }
  })

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('../../src/main/agent/registry')
    vi.doUnmock('../../src/main/session/schleifen-sitzungen')
    vi.doUnmock('../../src/main/event-bus')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  async function loadHandlers(): Promise<{
    create: SessionCreateHandler
    auftrag: SessionAuftragHandler
  }> {
    let registeredCreate: SessionCreateHandler | undefined
    let registeredAuftrag: SessionAuftragHandler | undefined

    vi.doMock('electron', () => ({
      app: { getPath: () => userDataDir, getAppPath: () => process.cwd() },
      ipcMain: {
        handle: (channel: string, fn: SessionCreateHandler | SessionAuftragHandler) => {
          if (channel === 'session:create') registeredCreate = fn as SessionCreateHandler
          if (channel === 'session:auftrag') registeredAuftrag = fn as SessionAuftragHandler
        },
        on: () => {},
      },
      BrowserWindow: class {},
      dialog: {},
    }))

    vi.doMock('../../src/main/agent/registry', () => ({
      AdapterRegistry: class {
        register() {}
        getForRuntime() {
          return {
            id: 'keel-harness',
            displayName: 'keel-Harness',
            niveau: 'B',
            sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
            isAvailable: () => true,
            nichtVerfuegbarGrund: () => null,
            buildLaunchCommand: () => {
              throw new Error('buildLaunchCommand must not run on the loop path')
            },
          }
        }
        get(id: string) {
          if (id !== 'keel-harness') return undefined
          return {
            id: 'keel-harness',
            sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
            starteAuftrag: (opts: SchleifenStartOpts) => {
              starteAuftragCalls.push(opts)
              return starteAuftragImpl(opts)
            },
            brichAb: () => {},
          }
        }
      },
    }))

    // Der echte Zellenregister-Bau, nur eingefangen — dieselbe Konstruktion, die die App faehrt.
    vi.doMock('../../src/main/session/schleifen-sitzungen', async () => {
      const actual = await vi.importActual<
        typeof import('../../src/main/session/schleifen-sitzungen')
      >('../../src/main/session/schleifen-sitzungen')
      return {
        ...actual,
        neuesRegister: () => {
          const reg = actual.neuesRegister()
          capturedRegister = reg
          return reg
        },
      }
    })

    vi.doMock('../../src/main/event-bus', () => ({
      registerWindow: () => {},
      broadcast: (channel: string, ...args: unknown[]) => {
        broadcastCalls.push([channel, args[0]])
      },
    }))

    const { configStore } = await import('../../src/main/config/config-store')
    configStore.set('modelle', {
      eintraege: [],
      zuordnung: {
        tiers: { light: '', standard: '', heavy: '' },
        rollen: { tagging: '', worker: '', rechercheur: '' },
        sitzungen: { 'niveau-b': 'spark-qwen38-27b' },
      },
    })

    const { registerIpcHandlers } = await import('../../src/main/ipc-handlers')
    const fakeTmux = {
      listSessions: vi.fn(),
      isConnected: vi.fn(() => true),
      connect: vi.fn(),
      createSession: vi.fn(),
      watchSession: vi.fn(),
      unwatchSession: vi.fn(),
      killSession: vi.fn(),
    }
    registerIpcHandlers({ tmux: fakeTmux } as never)

    expect(registeredCreate).toBeDefined()
    expect(registeredAuftrag).toBeDefined()
    return { create: registeredCreate!, auftrag: registeredAuftrag! }
  }

  it('ein leerer Auftragstext wird abgelehnt, ohne den Adapter zu rufen', async () => {
    const { auftrag } = await loadHandlers()
    const result = await auftrag({}, { name: 'irgendwas', auftragstext: '   ' })
    expect(result.ok).toBe(false)
    expect(result.meldung).toBe('Der Auftrag ist leer.')
    expect(starteAuftragCalls).toHaveLength(0)
  })

  it('eine unbekannte Zelle wird abgelehnt', async () => {
    const { auftrag } = await loadHandlers()
    const result = await auftrag({}, { name: 'nie-angelegt', auftragstext: 'los' })
    expect(result.ok).toBe(false)
    expect(result.meldung).toContain("keine Niveau-B-Zelle 'nie-angelegt'")
    expect(starteAuftragCalls).toHaveLength(0)
  })

  it('eine laufende Zelle nimmt keinen zweiten Auftrag an — ueber den echten Handler', async () => {
    const { create, auftrag } = await loadHandlers()
    await create({}, { entityId: 'keel-arbeiter', name: 'z-laeuft', cwd: projectDir })
    capturedRegister!.setzeLauf('z-laeuft', 'lauf-alt')

    const result = await auftrag({}, { name: 'z-laeuft', auftragstext: 'noch einer' })

    expect(result.ok).toBe(false)
    expect(starteAuftragCalls).toHaveLength(0)
  })

  it('beauftragt eine leerlaufende Zelle: beiStart kippt auf laeuft und sendet SESSION_STATUS_CHANGED', async () => {
    const { create, auftrag } = await loadHandlers()
    await create({}, { entityId: 'keel-arbeiter', name: 'z-frisch', cwd: projectDir })
    expect(capturedRegister?.hole('z-frisch')?.zustand).toBe('leerlaufend')

    const result = await auftrag({}, { name: 'z-frisch', auftragstext: 'mach das' })

    expect(result.ok).toBe(true)
    expect(starteAuftragCalls).toHaveLength(1)
    // wurzel/eintragId/letzteLaufId kommen aus der Zelle, nicht aus dem Aufruf.
    expect(starteAuftragCalls[0].wurzel).toBe(projectDir)
    expect(starteAuftragCalls[0].letzteLaufId).toBeNull()

    // beiStart lief bereits (starteAuftragImpl ruft es synchron auf, bevor es aufloest) —
    // die Zelle traegt danach die neue laufId und steht auf 'laeuft'.
    expect(capturedRegister!.hole('z-frisch')!.zustand).toBe('laeuft')
    expect(capturedRegister!.hole('z-frisch')!.laufId).toBe('lauf-default')
    expect(broadcastCalls).toContainEqual([
      'session:status-changed', { name: 'z-frisch', zustand: 'laeuft', laufId: 'lauf-default' },
    ])
  })

  it('beiEnde kippt die Zelle nach dem Lauf zurueck auf leerlaufend', async () => {
    const { create, auftrag } = await loadHandlers()
    await create({}, { entityId: 'keel-arbeiter', name: 'z-ende', cwd: projectDir })
    await auftrag({}, { name: 'z-ende', auftragstext: 'mach das' })
    expect(capturedRegister!.hole('z-ende')!.zustand).toBe('laeuft')

    // Der Fake-Adapter reicht beiEnde nicht selbst aufgerufen zurueck — hier simuliert, indem
    // die Opts eingefangen und beiEnde von aussen (wie es die echte Schleife spaeter tut) ausgeloest wird.
    starteAuftragCalls[0].beiEnde?.('lauf-default')

    expect(capturedRegister!.hole('z-ende')!.zustand).toBe('leerlaufend')
    expect(broadcastCalls).toContainEqual([
      'session:status-changed', { name: 'z-ende', zustand: 'leerlaufend', endzustand: null },
    ])
  })

  it(
    'das Rennen: ein Lauf, der VOR der Rueckkehr von starteAuftrag schon beiEnde ausloest, ' +
    'laesst die Zelle nicht auf laeuft stehen',
    async () => {
      // Das ist genau das Rennen aus dem Brief: beiStart und beiEnde feuern beide, bevor
      // starteAuftrag selbst aufloest — ein sehr kurzer Lauf im Hintergrund. Waere die
      // laufId nur aus dem Rueckgabewert eingetragen worden, stuende die Zelle danach fuer
      // immer auf 'laeuft', weil beiEnde schon vorher gelaufen waere und nichts zum
      // Zurueckkippen gefunden haette.
      starteAuftragImpl = async (opts) => {
        opts.beiStart?.('lauf-kurz')
        opts.beiEnde?.('lauf-kurz')
        return { laufId: 'lauf-kurz', fortgesetzt: false }
      }
      const { create, auftrag } = await loadHandlers()
      await create({}, { entityId: 'keel-arbeiter', name: 'z-kurz', cwd: projectDir })

      const result = await auftrag({}, { name: 'z-kurz', auftragstext: 'schnell fertig' })

      expect(result.ok).toBe(true)
      expect(capturedRegister!.hole('z-kurz')!.zustand).toBe('leerlaufend')
      expect(capturedRegister!.hole('z-kurz')!.laufId).toBe('lauf-kurz')
    },
  )

  it('das Ende eines fremden Laufs kippt die Zelle nicht — ueber den echten Handler', async () => {
    const { create, auftrag } = await loadHandlers()
    await create({}, { entityId: 'keel-arbeiter', name: 'z-fremd', cwd: projectDir })
    await auftrag({}, { name: 'z-fremd', auftragstext: 'erster Auftrag' })
    expect(capturedRegister!.hole('z-fremd')!.laufId).toBe('lauf-default')

    // Zerstoeren-und-Neuanlegen unter demselben Namen, simuliert durch direktes Ueberschreiben
    // der laufId im echten Register — die Zelle "gehoert" jetzt einem anderen Lauf.
    capturedRegister!.setzeLauf('z-fremd', 'lauf-neu')

    // Das (spaete) beiEnde des ALTEN Laufs trifft ein.
    starteAuftragCalls[0].beiEnde?.('lauf-default')

    // Die Zelle bleibt bei ihrem neuen Lauf stehen, nicht auf leerlaufend gekippt.
    expect(capturedRegister!.hole('z-fremd')!.zustand).toBe('laeuft')
    expect(capturedRegister!.hole('z-fremd')!.laufId).toBe('lauf-neu')
  })

  it('scheitert starteAuftrag, bleibt die Zelle nicht auf laeuft stehen', async () => {
    starteAuftragImpl = async () => {
      throw new Error('Transportfehler')
    }
    const { create, auftrag } = await loadHandlers()
    await create({}, { entityId: 'keel-arbeiter', name: 'z-fehler', cwd: projectDir })

    const result = await auftrag({}, { name: 'z-fehler', auftragstext: 'mach das' })

    expect(result.ok).toBe(false)
    expect(result.meldung).toBe('Transportfehler')
    expect(capturedRegister!.hole('z-fehler')!.zustand).toBe('leerlaufend')
  })
})
