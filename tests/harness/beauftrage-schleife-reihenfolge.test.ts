/**
 * beauftrageSchleife — die Reihenfolge an der Produktionsstelle (Review nach Task 9, I-3).
 *
 * tests/session/session-auftrag.test.ts belegt, dass der SESSION_AUFTRAG-Handler beiStart und
 * beiEnde richtig auswertet, WENN ein Adapter sie in dieser Reihenfolge ruft — aber ein
 * Fake-Adapter dort ruft sie selbst, in einer vom Test vorgegebenen Reihenfolge. Kein Test bis
 * hierher hat je `beauftrageSchleife` selbst geladen: verschoebe man `opts.beiStart?.(laufId)`
 * in `harness-sitzung.ts` (Zeile 525 im Folgeauftrags-Zweig, Zeile 563 im frischen Zweig) hinter
 * das jeweilige `await`, bliebe jeder bisherige Test gruen. Das ist dieselbe Falle, gegen die
 * dieses Repo seine erste Regel hat ("gruene Tests sagen hier nichts ueber eine Verdrahtung"),
 * nur eine Ebene tiefer: nicht der IPC-Handler ist unverdrahtet pruefbar, sondern die Funktion,
 * die er aufruft.
 *
 * Beide Zweige von `beauftrageSchleife` treiben hier tatsaechlich `starteLauf` bzw.
 * `setzeFolgeauftrag` an (aus `./harness` gemockt, damit kein echtes Modell gerufen wird) und
 * zeichnen die Reihenfolge auf, in der beiStart und der jeweilige Schleifenstart tatsaechlich
 * feuern — nicht nur, ob sie es koennten.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ModellEintrag } from '../../src/main/model/entry'
import type { AppServices } from '../../src/main/window-manager'
import type { SchleifenStartOpts } from '../../src/main/agent/agent-adapter'

const EINTRAG: ModellEintrag = {
  id: 'test-modell', name: 'Testmodell', art: 'api',
  erreichbarkeit: { art: 'api', baseUrl: 'https://x/v1', model: 'm', keyRef: 'k' },
  oertlichkeit: 'fremdes-netz', erklaertext: '', empfehlung: '',
  faehigkeiten: {
    codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
    bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
    nutzbaresKontextfenster: 100_000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
    rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
  },
}

const BUDGETS = { runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8 }
const services = { graphDb: null } as unknown as AppServices

describe('beauftrageSchleife — beiStart lief vor dem Schleifenstart (I-3)', () => {
  let userDataDir: string
  let projectDir: string
  let reihenfolge: string[]

  beforeEach(() => {
    vi.resetModules()
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-project-'))
    reihenfolge = []
  })

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('../../src/main/model/registry')
    vi.doUnmock('../../src/main/harness-netz')
    vi.doUnmock('../../src/main/harness')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  /**
   * Laedt harness-sitzung.ts frisch, mit `electron` gemockt (echte harnessDb() braucht
   * app.getPath), der Registry auf einen einzigen Testeintrag reduziert, `baueNetzKontext`
   * stillgelegt (keine echte Keychain-/Netzabfrage in einem Test) und `starteLauf`/
   * `setzeFolgeauftrag` aus dem `./harness`-Barrel durch Reihenfolge-Aufzeichner ersetzt — alles
   * andere aus dem Barrel (lesen, weiterOderFrisch, WerkzeugRegistry, ...) bleibt echt.
   */
  async function ladeBeauftrageSchleife() {
    vi.doMock('electron', () => ({
      app: { getPath: () => userDataDir, getAppPath: () => process.cwd() },
    }))
    vi.doMock('../../src/main/model/registry', () => ({
      eintragNachId: (id: string) => (id === EINTRAG.id ? EINTRAG : null),
      eintragFuerRolle: () => null,
    }))
    vi.doMock('../../src/main/harness-netz', () => ({
      baueNetzKontext: async () => undefined,
    }))
    vi.doMock('../../src/main/harness', async () => {
      const actual = await vi.importActual<typeof import('../../src/main/harness')>(
        '../../src/main/harness',
      )
      return {
        ...actual,
        starteLauf: async (_auftrag: unknown, _u: unknown, laufId: string) => {
          reihenfolge.push(`starteLauf:${laufId}`)
          return laufId
        },
        setzeFolgeauftrag: async (laufId: string) => {
          reihenfolge.push(`setzeFolgeauftrag:${laufId}`)
        },
      }
    })

    return import('../../src/main/harness-sitzung')
  }

  it('frischer Lauf: beiStart traegt die laufId ein, BEVOR starteLauf (die Schleife) faehrt', async () => {
    const { beauftrageSchleife } = await ladeBeauftrageSchleife()
    const opts: SchleifenStartOpts = {
      wurzel: projectDir, sitzungsname: 'z1', auftragstext: 'Mach etwas',
      eintragId: EINTRAG.id,
      praefix: { body: 'B', persona: '', capabilities: '', globaleRegeln: '' },
      letzteLaufId: null,
      beiStart: (laufId) => reihenfolge.push(`beiStart:${laufId}`),
      beiEnde: (laufId) => reihenfolge.push(`beiEnde:${laufId}`),
    }

    const ergebnis = await beauftrageSchleife(opts, services)

    expect(ergebnis.fortgesetzt).toBe(false)
    // Nicht nur "beide kamen vor" -- die tatsaechliche Position zaehlt.
    expect(reihenfolge[0]).toBe(`beiStart:${ergebnis.laufId}`)
    expect(reihenfolge[1]).toBe(`starteLauf:${ergebnis.laufId}`)
  })

  it('Folgeauftrag: beiStart traegt die laufId ein, BEVOR setzeFolgeauftrag (die Schleife) faehrt', async () => {
    const { beauftrageSchleife, harnessDb } = await ladeBeauftrageSchleife()
    const { anhaengen } = await import('../../src/main/harness/protokoll')
    const laufId = 'lauf-bestehend'
    anhaengen(harnessDb(), laufId, 'run.started', {
      auftragstext: 'Erster Auftrag', modellId: EINTRAG.id, wurzel: projectDir, budgets: BUDGETS,
    })

    const opts: SchleifenStartOpts = {
      wurzel: projectDir, sitzungsname: 'z1', auftragstext: 'Zweiter Auftrag',
      eintragId: EINTRAG.id,
      praefix: { body: 'B', persona: '', capabilities: '', globaleRegeln: '' },
      letzteLaufId: laufId,
      beiStart: (id) => reihenfolge.push(`beiStart:${id}`),
      beiEnde: (id) => reihenfolge.push(`beiEnde:${id}`),
    }

    const ergebnis = await beauftrageSchleife(opts, services)

    expect(ergebnis.fortgesetzt).toBe(true)
    expect(reihenfolge[0]).toBe(`beiStart:${laufId}`)
    expect(reihenfolge[1]).toBe(`setzeFolgeauftrag:${laufId}`)
  })
})
