/**
 * schleifen-auftrag.test.ts — direct tests of `beauftrageZelle`, the one Zusammenbau
 * `SESSION_AUFTRAG` (ipc-handlers.ts) and `keel_zelle_beauftragen` (graph/mcp-server.ts) both
 * call. These mirror the scenarios `tests/session/session-auftrag.test.ts` already proved
 * through the real IPC handler body — testing the shared function directly here means both
 * callers inherit the same guarantee without re-proving it twice.
 *
 * Falsifikation (2026-08-23): the "fremder Lauf" test below was run once against a version of
 * `beauftrageZelle` with the `zelle.laufId !== beendeterLauf` guard in `beiEnde` removed —
 * confirmed red (the cell falsely flipped to `leerlaufend` on the old run's callback). Restored
 * before commit; see the commit message.
 */

import { describe, it, expect } from 'vitest'
import { neuesRegister } from '../../src/main/session/schleifen-sitzungen'
import { beauftrageZelle } from '../../src/main/session/schleifen-auftrag'
import { SITZUNG_EIGENE_SCHLEIFE } from '../../src/main/agent/agent-adapter'
import type {
  SchleifenSitzungsAdapter, SchleifenStartOpts, SchleifenStartErgebnis, EntitaetsTeile,
} from '../../src/main/agent/agent-adapter'
import type { Ereignis } from '../../src/main/harness/ereignisse'
import type Database from 'better-sqlite3'
import type { SessionStatusChanged } from '../../src/shared/harness-types'

const PRAEFIX: EntitaetsTeile = { body: 'b', persona: 'p', capabilities: 'c', globaleRegeln: 'g' }

function fakeAdapter(impl: (opts: SchleifenStartOpts) => Promise<SchleifenStartErgebnis>): SchleifenSitzungsAdapter {
  return {
    id: 'keel-harness',
    sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
    starteAuftrag: impl,
    brichAb: () => {},
  } as unknown as SchleifenSitzungsAdapter
}

/** No harness.db needed for these scenarios (beiEnde looks up `run.finished`) unless noted. */
function keinHarnessLog() {
  return {
    harnessDb: () => ({} as Database.Database),
    lesen: (): Ereignis[] => [],
  }
}

describe('beauftrageZelle', () => {
  it('lehnt einen leeren Auftragstext ab, ohne den Adapter zu rufen', async () => {
    const register = neuesRegister()
    let called = false
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: '   ',
      register, praefixJeZelle: new Map(),
      adapter: fakeAdapter(async () => { called = true; return { laufId: 'l', fortgesetzt: false } }),
      ...keinHarnessLog(),
    })
    expect(ergebnis).toEqual({ ok: false, meldung: 'Der Auftrag ist leer.' })
    expect(called).toBe(false)
  })

  it('lehnt eine unbekannte Zelle ab', async () => {
    const register = neuesRegister()
    const ergebnis = await beauftrageZelle({
      name: 'nie-angelegt', auftragstext: 'los',
      register, praefixJeZelle: new Map(),
      adapter: undefined,
      ...keinHarnessLog(),
    })
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.meldung).toContain("keine Niveau-B-Zelle 'nie-angelegt'")
  })

  it('lehnt eine laufende Zelle ab', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'alt', letzterEndzustand: null,
    })
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map(),
      adapter: fakeAdapter(async () => ({ laufId: 'neu', fortgesetzt: false })),
      ...keinHarnessLog(),
    })
    expect(ergebnis.ok).toBe(false)
  })

  it('meldet einen fehlenden Adapter benannt', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map(),
      adapter: undefined,
      ...keinHarnessLog(),
    })
    expect(ergebnis).toEqual({ ok: false, meldung: 'Der keel-harness-Adapter ist nicht registriert.' })
  })

  it('meldet fehlende Praefixteile benannt', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map(), // absichtlich leer
      adapter: fakeAdapter(async () => ({ laufId: 'l', fortgesetzt: false })),
      ...keinHarnessLog(),
    })
    expect(ergebnis).toEqual({
      ok: false, meldung: "Fuer die Zelle 'z1' liegen keine Praefixteile vor.",
    })
  })

  it('beiStart kippt die Zelle auf laeuft und ruft sendeStatus, bevor starteAuftrag aufloest', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/projekt', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const statusCalls: SessionStatusChanged[] = []
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'mach das',
      register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
      adapter: fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-1')
        expect(register.hole('z1')!.zustand).toBe('laeuft')
        return { laufId: 'lauf-1', fortgesetzt: false }
      }),
      ...keinHarnessLog(),
      sendeStatus: (s) => statusCalls.push(s),
    })
    expect(ergebnis).toEqual({ ok: true, wert: { laufId: 'lauf-1', fortgesetzt: false } })
    expect(statusCalls).toContainEqual({ name: 'z1', zustand: 'laeuft', laufId: 'lauf-1' })
    // wurzel/eintragId/letzteLaufId kommen aus der Zelle, nicht aus dem Aufruf.
    expect(register.hole('z1')!.laufId).toBe('lauf-1')
  })

  it('sendeStatus ist optional — ohne Rueckruf laeuft die Registermutation trotzdem', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
      adapter: fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-x')
        return { laufId: 'lauf-x', fortgesetzt: false }
      }),
      ...keinHarnessLog(),
      // kein sendeStatus — wie der MCP-Aufrufer, der kein Fenster hat
    })
    expect(ergebnis.ok).toBe(true)
    expect(register.hole('z1')!.zustand).toBe('laeuft')
  })

  it('beiEnde liest den Endzustand aus run.finished und kippt auf leerlaufend', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const statusCalls: SessionStatusChanged[] = []
    const ereignisse: Ereignis[] = [
      { laufId: 'lauf-1', seq: 1, ts: 't', art: 'run.started', nutzlast: {} },
      { laufId: 'lauf-1', seq: 2, ts: 't', art: 'run.finished', nutzlast: { endzustand: 'ziel-erreicht' } },
    ]
    await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
      adapter: fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-1')
        opts.beiEnde?.('lauf-1')
        return { laufId: 'lauf-1', fortgesetzt: false }
      }),
      harnessDb: () => ({} as Database.Database),
      lesen: (_db, laufId) => ereignisse.filter((e) => e.laufId === laufId),
      sendeStatus: (s) => statusCalls.push(s),
    })
    expect(register.hole('z1')!.zustand).toBe('leerlaufend')
    expect(register.hole('z1')!.letzterEndzustand).toBe('ziel-erreicht')
    expect(statusCalls).toContainEqual({ name: 'z1', zustand: 'leerlaufend', endzustand: 'ziel-erreicht' })
  })

  it(
    'das Rennen: beiEnde vor der Rueckkehr von starteAuftrag laesst die Zelle nicht auf laeuft stehen',
    async () => {
      const register = neuesRegister()
      register.setze({
        name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
        zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
      })
      const ergebnis = await beauftrageZelle({
        name: 'z1', auftragstext: 'schnell fertig',
        register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
        adapter: fakeAdapter(async (opts) => {
          opts.beiStart?.('lauf-kurz')
          opts.beiEnde?.('lauf-kurz')
          return { laufId: 'lauf-kurz', fortgesetzt: false }
        }),
        ...keinHarnessLog(),
      })
      expect(ergebnis.ok).toBe(true)
      expect(register.hole('z1')!.zustand).toBe('leerlaufend')
      expect(register.hole('z1')!.laufId).toBe('lauf-kurz')
    },
  )

  it('das Ende eines fremden Laufs kippt die Zelle nicht', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    let capturedBeiEnde: ((laufId: string) => void) | undefined
    await beauftrageZelle({
      name: 'z1', auftragstext: 'erster Auftrag',
      register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
      adapter: fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-alt')
        capturedBeiEnde = opts.beiEnde
        return { laufId: 'lauf-alt', fortgesetzt: false }
      }),
      ...keinHarnessLog(),
    })
    // Zerstoeren-und-Neuanlegen unter demselben Namen, simuliert durch direktes Ueberschreiben.
    register.setzeLauf('z1', 'lauf-neu')
    capturedBeiEnde?.('lauf-alt')
    expect(register.hole('z1')!.zustand).toBe('laeuft')
    expect(register.hole('z1')!.laufId).toBe('lauf-neu')
  })

  it('scheitert starteAuftrag nach beiStart, kippt die Zelle zurueck und meldet den Fehler', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: 'alter-endzustand',
    })
    const statusCalls: SessionStatusChanged[] = []
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
      adapter: fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-vor-wurf')
        throw new Error('Transportfehler nach beiStart')
      }),
      ...keinHarnessLog(),
      sendeStatus: (s) => statusCalls.push(s),
    })
    expect(ergebnis).toEqual({ ok: false, meldung: 'Transportfehler nach beiStart' })
    expect(register.hole('z1')!.zustand).toBe('leerlaufend')
    // M-2: explizit null, nicht der alte Wert stehengelassen.
    expect(register.hole('z1')!.letzterEndzustand).toBeNull()
    expect(statusCalls).toContainEqual({ name: 'z1', zustand: 'leerlaufend', endzustand: null })
  })

  it('ein Fehler, der VOR beiStart wirft, laesst eine neu belegte Zelle unangetastet', async () => {
    const register = neuesRegister()
    register.setze({
      name: 'z1', wurzel: '/p', entityId: 'e', eintragId: 'm1',
      zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
    })
    const statusCalls: SessionStatusChanged[] = []
    const ergebnis = await beauftrageZelle({
      name: 'z1', auftragstext: 'los',
      register, praefixJeZelle: new Map([['z1', PRAEFIX]]),
      adapter: fakeAdapter(async (opts) => {
        opts.beiStart?.('lauf-alt')
        // Waehrend dieses Await-Fensters: Zelle zerstoert und mit neuem, wirklich laufendem
        // Auftrag neu belegt.
        register.setzeLauf('z1', 'lauf-neu')
        throw new Error('Transportfehler, kommt zu spaet')
      }),
      ...keinHarnessLog(),
      sendeStatus: (s) => statusCalls.push(s),
    })
    expect(ergebnis.ok).toBe(false)
    expect(register.hole('z1')!.zustand).toBe('laeuft')
    expect(register.hole('z1')!.laufId).toBe('lauf-neu')
    expect(statusCalls).not.toContainEqual({ name: 'z1', zustand: 'leerlaufend', endzustand: null })
  })
})
