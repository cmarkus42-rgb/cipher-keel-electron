/**
 * `faehigkeit_lesen` durch die echte Schleife, nicht an einer nachgebauten Zug-Funktion.
 *
 * Das Werkzeug wird in `fuehreAus` abgefangen, bevor die Werkzeugsuche laeuft — genau wie
 * `werkzeug_schema`. Ein Test, der `ausfuehren()` direkt aufruft, wuerde diesen Pfad nie sehen und
 * gruen bleiben, waehrend das Abfangen fehlt.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oeffneHarnessDb, lesen } from '../../src/main/harness/protokoll'
import { starteLauf } from '../../src/main/harness/lauf'
import { WerkzeugRegistry, type Werkzeug } from '../../src/main/harness/werkzeuge'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import {
  FAEHIGKEIT_WERKZEUG_NAME, faehigkeitLesenWerkzeug, type Faehigkeit,
} from '../../src/main/harness/faehigkeiten'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { ModellEintrag } from '../../src/main/model/entry'

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

const WEB: Faehigkeit = {
  name: 'web-recherche',
  beschreibung: 'Sucht im Netz und liest Seiten.',
  rumpf: '# Web-Recherche\n\nErst `web_suchen`, dann `seite_lesen`.',
  pfad: '.claude/skills/web-recherche',
}
const GATE: Faehigkeit = {
  name: 'gate-urteil-guide',
  beschreibung: 'Faellt das Urteil an einem Gate.',
  rumpf: 'Struktur und Plausibilitaet getrennt fuehren.',
  pfad: '.claude/capabilities/gate-urteil-guide',
}

function umgebung(
  wurzel: string, antworten: ModelAntwort[], faehigkeiten: Faehigkeit[],
  werkzeuge: Werkzeug[] = [...DATEI_WERKZEUGE, faehigkeitLesenWerkzeug],
) {
  let i = 0, t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: {
      body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: 'a', faehigkeiten,
    },
    wache: { wurzel, heim: wurzel, userDataPfad: join(wurzel, 'ud') },
    graphDb: null,
    registry: new WerkzeugRegistry(werkzeuge),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    sende: async (): Promise<ModelAntwort> => antworten[i++],
  }
}

const ruft = (name: string, eingabe: Record<string, unknown>, id = 'c1'): ModelAntwort => ({
  bloecke: [{ art: 'werkzeug-aufruf', id, name, eingabe }],
  stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const sagt = (text: string): ModelAntwort => ({
  bloecke: [{ art: 'text', text }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const AUFTRAG = (wurzel: string) => ({
  auftragstext: 'recherchiere', modellId: 'test-modell', wurzel,
  budgets: { runden: 6, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 },
})

function mitWurzel<T>(f: (wurzel: string) => Promise<T>): Promise<T> {
  const w = mkdtempSync(join(tmpdir(), 'keel-lf-'))
  return f(w).finally(() => rmSync(w, { recursive: true, force: true }))
}

describe('faehigkeit_lesen', () => {
  it('schreibt bei bekanntem Namen skill.geladen mit Namen und Rumpf', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, { name: 'web-recherche' }), sagt('fertig')], [WEB, GATE])
      const id = await starteLauf(AUFTRAG(w), u)
      const geladen = lesen(u.db, id).find(e => e.art === 'skill.geladen')
      expect(geladen?.nutzlast.name).toBe('web-recherche')
      expect(String(geladen?.nutzlast.text)).toContain('Erst `web_suchen`, dann `seite_lesen`.')
    })
  })

  it('schreibt den Intent vor dem Ergebnis und schliesst den Aufruf ab', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, { name: 'web-recherche' }), sagt('fertig')], [WEB])
      const id = await starteLauf(AUFTRAG(w), u)
      const arten = lesen(u.db, id).map(e => e.art)
      expect(arten.indexOf('tool.intent')).toBeLessThan(arten.indexOf('skill.geladen'))
      expect(arten.indexOf('skill.geladen')).toBeLessThan(arten.indexOf('tool.completed'))
    })
  })

  it('haelt den Rumpf aus dem stabilen Praefix heraus und traegt ihn in den Verlauf', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, { name: 'web-recherche' }), sagt('fertig')], [WEB])
      const id = await starteLauf(AUFTRAG(w), u)
      const prompts = lesen(u.db, id).filter(e => e.art === 'prompt.sent').map(e => String(e.nutzlast.text))
      expect(prompts).toHaveLength(2)
      // Die eine Zeile steht im Praefix, der Rumpf in keinem der beiden Prompts.
      expect(prompts[0]).toContain('- `web-recherche` — Sucht im Netz und liest Seiten.')
      for (const p of prompts) expect(p).not.toContain('Erst `web_suchen`')
    })
  })

  it('lehnt einen unbekannten Namen benannt ab und nennt die verfuegbaren', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, { name: 'gibt-es-nicht' }), sagt('fertig')], [WEB, GATE])
      const id = await starteLauf(AUFTRAG(w), u)
      const ereignisse = lesen(u.db, id)
      expect(ereignisse.some(e => e.art === 'skill.geladen')).toBe(false)
      const fehlgeschlagen = ereignisse.find(e => e.art === 'tool.failed')
      const meldung = String(fehlgeschlagen?.nutzlast.meldung)
      expect(meldung).toContain('gibt-es-nicht')
      expect(meldung).toContain('gate-urteil-guide')
      expect(meldung).toContain('web-recherche')
    })
  })

  it('sagt bei gar keinen Faehigkeiten, dass keine da sind — statt einer leeren Aufzaehlung', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, { name: 'irgendwas' }), sagt('fertig')], [])
      const id = await starteLauf(AUFTRAG(w), u)
      const meldung = String(lesen(u.db, id).find(e => e.art === 'tool.failed')?.nutzlast.meldung)
      expect(meldung).toContain('keine Faehigkeiten')
      expect(meldung).not.toMatch(/Verfuegbar sind:\s*\./)
    })
  })

  it('lehnt eine Eingabe ohne Feld name benannt ab', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, {}), sagt('fertig')], [WEB])
      const id = await starteLauf(AUFTRAG(w), u)
      const meldung = String(lesen(u.db, id).find(e => e.art === 'tool.failed')?.nutzlast.meldung)
      expect(meldung).toContain('name')
    })
  })

  it('steht als Stummel im Praefix, mit genau der einen Zeile aus der Spec', async () => {
    await mitWurzel(async w => {
      const u = umgebung(w, [sagt('fertig')], [WEB])
      const id = await starteLauf(AUFTRAG(w), u)
      const prompt = String(lesen(u.db, id).find(e => e.art === 'prompt.sent')?.nutzlast.text)
      expect(prompt).toContain(
        '- `faehigkeit_lesen` — Liest den vollen Text einer Faehigkeit aus der Liste oben. ' +
        'Rufe es, bevor du eine benutzt.',
      )
    })
  })
})

/**
 * Der Abfang in `fuehreAus` laeuft ueber den **Namen**. `recherchieren` hat dort seit jeher eine
 * Registry-Bedingung dazu — `faehigkeit_lesen` hatte keine, und damit war die Registry fuer diesen
 * einen Namen keine Grenze mehr: wer das Werkzeug aus einer Registry nimmt (etwa aus der des
 * Rechercheurs, weil lokale Skill-Rumpfe neben Fremdinhalt unerwuenscht sind), entfernt es nur aus
 * dem Praefix. Das Modell muesste den Namen bloss raten.
 *
 * Gegenprobe (Registry-Bedingung in `fuehreAus` wieder entfernt): 1 rot, `expected true to be
 * false` — `skill.geladen` stand im Protokoll und der Rumpf im Verlauf.
 */
describe('faehigkeit_lesen ist an die Registry gebunden, nicht nur an den Praefix', () => {
  it('liefert keinen Rumpf aus, wenn das Werkzeug nicht in der Registry steht', async () => {
    await mitWurzel(async w => {
      const geheim: Faehigkeit = {
        name: 'hausregeln',
        beschreibung: 'Die Hausregeln.',
        rumpf: 'RUMPF-NUR-IN-DEN-PRAEFIXTEILEN-4711',
        pfad: '.claude/capabilities/hausregeln',
      }
      // Registry ohne `faehigkeit_lesen` — die Rumpfe stehen trotzdem in `praefixTeile`, weil
      // `baueLaufUmgebung` sie unabhaengig von der Werkzeugliste einliest.
      const u = umgebung(
        w, [ruft(FAEHIGKEIT_WERKZEUG_NAME, { name: 'hausregeln' }), sagt('fertig')], [geheim],
        [...DATEI_WERKZEUGE],
      )
      const id = await starteLauf(AUFTRAG(w), u)
      const ev = lesen(u.db, id)

      expect(ev.some(e => e.art === 'skill.geladen')).toBe(false)
      const meldung = String(ev.find(e => e.art === 'tool.failed')?.nutzlast.meldung)
      expect(meldung).toContain(`Es gibt kein Werkzeug '${FAEHIGKEIT_WERKZEUG_NAME}'`)
      // Und der Rumpf ist nirgends im Protokoll — auch nicht in einem `prompt.sent`.
      expect(JSON.stringify(ev)).not.toContain('RUMPF-NUR-IN-DEN-PRAEFIXTEILEN-4711')
    })
  })
})

describe('faehigkeitLesenWerkzeug als Registry-Eintrag', () => {
  it('traegt das Schema aus der Spec', () => {
    expect(faehigkeitLesenWerkzeug.name).toBe('faehigkeit_lesen')
    expect(faehigkeitLesenWerkzeug.schema()).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    })
  })

  it('lehnt seine eigene Ausfuehrung benannt ab, falls das Abfangen je verschwindet', async () => {
    // Der Eintrag existiert fuer Stummel und Schema; ausgefuehrt wird er in `fuehreAus`. Wuerde
    // das Abfangen entfernt, liefe die Registry-Ausfuehrung an — und die muss sagen, was fehlt,
    // statt still nichts zu tun.
    const r = await faehigkeitLesenWerkzeug.ausfuehren(
      { name: 'web-recherche' },
      { wache: { wurzel: '/x', heim: '/x', userDataPfad: '/x' }, graphDb: null },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('fuehreAus')
  })
})
