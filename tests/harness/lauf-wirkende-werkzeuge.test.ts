import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starteLauf, lesen, WerkzeugRegistry } from '../../src/main/harness'
import { SCHREIB_WERKZEUGE } from '../../src/main/harness/werkzeug-schreiben'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import { effekteOhneEntscheidung } from '../../src/main/harness/tor'
import { effekteOhneIntent } from '../../src/main/harness/intent-vor-effekt'
import type { Werkzeug } from '../../src/main/harness/werkzeuge'
import { execFileAsync } from '../../src/main/util/exec-util'
import { baueUmgebung } from './lauf.test-helfer'

/** Die Angabe ist Pflicht in `ModelAntwort`; ihr Inhalt spielt hier keine Rolle. */
const NUTZUNG = { eingabeToken: 100, ausgabeToken: 10, roh: null }
const BUDGETS = { runden: 4, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 }

let heim: string
let wurzel: string

// Diese Suite faehrt wirkende Werkzeuge (SCHREIB_WERKZEUGE, und ein Doppel unter dem Namen
// 'datei_schreiben') durch `starteLauf` — seit Task 8 ist ein sauberes Git-Repo an der Wurzel die
// Startvorbedingung dafuer (siehe pruefeArbeitsbaum in lauf.ts). Ein leerer Commit reicht: es geht
// nur um einen Ausgangsstand, auf den 'git diff' / 'git checkout' zurueckkoennen, nicht um Inhalt.
beforeEach(async () => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-lw-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  await execFileAsync('git', ['init', '-q', wurzel])
  await execFileAsync('git', ['-C', wurzel, 'config', 'user.email', 'test@test.invalid'])
  await execFileAsync('git', ['-C', wurzel, 'config', 'user.name', 'Test'])
  await execFileAsync('git', ['-C', wurzel, 'commit', '-q', '--allow-empty', '-m', 'leer'])
})
afterEach(() => rmSync(heim, { recursive: true, force: true }))

describe('Die Kette Intent -> Entscheidung -> Wirkung', () => {
  it('ein erlaubter Schreibaufruf schreibt alle drei Ereignisse, in dieser Reihenfolge', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: 'neu.ts', inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' }, usage: NUTZUNG },
        { bloecke: [{ art: 'text', text: 'fertig' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' }, usage: NUTZUNG },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: BUDGETS }, u)

    const arten = lesen(u.db, laufId).filter(e => String(e.nutzlast.aufrufId) === 'a1').map(e => e.art)
    expect(arten).toEqual(['tool.intent', 'tool.entschieden', 'tool.completed'])
    expect(readFileSync(join(wurzel, 'neu.ts'), 'utf-8')).toBe('x')
  })

  it('ein abgelehnter Schreibaufruf steht mit Grund im Protokoll und schreibt nichts', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: '/etc/hosts', inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' }, usage: NUTZUNG },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' }, usage: NUTZUNG },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: BUDGETS }, u)

    const ereignisse = lesen(u.db, laufId)
    const entschieden = ereignisse.find(e => e.art === 'tool.entschieden')!
    expect(entschieden.nutzlast.erlaubt).toBe(false)
    expect(String(entschieden.nutzlast.grund)).toContain('ausserhalb der Wurzel')

    // Ein Nein ist ein Werkzeugfehler, kein Laufende: das Modell erfaehrt den Grund.
    const gescheitert = ereignisse.find(e => e.art === 'tool.failed')!
    expect(String(gescheitert.nutzlast.meldung)).toContain('ausserhalb der Wurzel')
    expect(ereignisse.some(e => e.art === 'tool.completed')).toBe(false)
  })

  /**
   * Ein wirkendes Werkzeug, das der Entscheidung vertraut und den Pfad nicht noch einmal prueft.
   * Es zaehlt bloss, ob es ueberhaupt betreten wurde.
   *
   * Warum ein Doppel und nicht das echte `datei_schreiben`: werkzeug-schreiben.ts ruft pfadwache
   * selbst noch einmal (Tiefenverteidigung, sein Modulkopf sagt es) und lehnt einen Pfad
   * ausserhalb der Wurzel mit **wortgleicher** Meldung ab. Ueber dem echten Werkzeug sieht ein
   * angehaltener Aufruf im Protokoll deshalb genauso aus wie ein durchgelassener, der am Werkzeug
   * scheitert — gemessen am 2026-08-30: die Abbruchzeile im Tor zu streichen faerbte keinen
   * einzigen Test ueber den echten Werkzeugen rot, den Test hier darunter schon. Dieses Doppel
   * ist die einzige Stelle, an der die beiden Wege auseinandergehen.
   *
   * Der Name muss einer der drei wirkenden sein, sonst greift das Tor gar nicht erst (tor.ts).
   */
  function vertrauendesWerkzeug(): { werkzeug: Werkzeug; laeufe: () => number } {
    let laeufe = 0
    return {
      laeufe: () => laeufe,
      werkzeug: {
        name: 'datei_schreiben',
        beschreibung: 'Testdoppel: prueft nichts nach, zaehlt nur, ob es betreten wurde.',
        schema: () => ({ type: 'object', properties: {}, required: [] }),
        async ausfuehren() {
          laeufe += 1
          return { ok: true, quelle: 'lokal', inhalt: [{ art: 'text', text: 'betreten' }] }
        },
      },
    }
  }

  async function laufMitDoppel(pfad: string): Promise<{ erlaubt: unknown; laeufe: number }> {
    const doppel = vertrauendesWerkzeug()
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([doppel.werkzeug]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad, inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' }, usage: NUTZUNG },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' }, usage: NUTZUNG },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: BUDGETS }, u)
    const entschieden = lesen(u.db, laufId).find(e => e.art === 'tool.entschieden')
    return { erlaubt: entschieden?.nutzlast.erlaubt, laeufe: doppel.laeufe() }
  }

  it('ein Nein haelt die Wirkung an, ein Ja laesst sie durch — am selben Werkzeug gemessen', async () => {
    const abgelehnt = await laufMitDoppel('/etc/hosts')
    expect(abgelehnt.erlaubt).toBe(false)
    expect(abgelehnt.laeufe).toBe(0)

    // Die Gegenprobe im selben Test, nicht daneben: ohne sie hiesse `laeufe === 0` bloss, dass
    // das Doppel gar nicht verdrahtet ist, und der Test bestuende auch dann, wenn das Tor nie
    // etwas anhielte.
    const erlaubt = await laufMitDoppel('drin.ts')
    expect(erlaubt.erlaubt).toBe(true)
    expect(erlaubt.laeufe).toBe(1)
  })

  it('ein lesendes Werkzeug bekommt keine Entscheidung', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...DATEI_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'verzeichnis_listen', eingabe: { muster: '**/*' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' }, usage: NUTZUNG },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' }, usage: NUTZUNG },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'liste', modellId: u.eintrag.id, wurzel, budgets: BUDGETS }, u)
    // Nicht bloss die Abwesenheit: ohne den erfolgreichen Aufruf daneben bestuende die Zeile auch,
    // wenn das Werkzeug nie gelaufen waere.
    const ereignisse = lesen(u.db, laufId)
    expect(ereignisse.some(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'a1')).toBe(true)
    expect(ereignisse.some(e => e.art === 'tool.entschieden')).toBe(false)
  })
})

describe('Single-Writer', () => {
  it('ein Zug mit einem wirkenden Aufruf laeuft sequenziell, in Blockreihenfolge', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [
          { art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: 'x.ts', inhalt: 'eins' } },
          { art: 'werkzeug-aufruf', id: 'a2', name: 'datei_lesen', eingabe: { pfad: 'x.ts' } },
        ], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' }, usage: NUTZUNG },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' }, usage: NUTZUNG },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'beides', modellId: u.eintrag.id, wurzel, budgets: BUDGETS }, u)

    const ereignisse = lesen(u.db, laufId)
    const iA1 = ereignisse.findIndex(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'a1')
    const iA2 = ereignisse.findIndex(e => e.art === 'tool.intent' && e.nutzlast.aufrufId === 'a2')
    // Beide muessen ueberhaupt vorkommen: zwei -1 waeren sonst gleich und die Zeile darunter
    // bestuende ohne einen einzigen ausgefuehrten Aufruf.
    expect(iA1).toBeGreaterThanOrEqual(0)
    expect(iA2).toBeGreaterThanOrEqual(0)
    // Der Lesevorgang beginnt erst, nachdem der Schreibvorgang fertig ist — sonst haengt es vom
    // Zeitpunkt ab, ob er Altes oder Neues sieht, und das Protokoll saehe in beiden Faellen
    // gleich aus.
    expect(iA1).toBeLessThan(iA2)

    const gelesen = ereignisse.find(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'a2')!
    expect(JSON.stringify(gelesen.nutzlast.inhalt)).toContain('eins')
  })
})

describe('Waechter ueber einem echten Lauf', () => {
  it('ein Lauf mit einem Schreibaufruf verletzt weder Intent- noch Entscheidungsregel', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: 'p.ts', inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' }, usage: NUTZUNG },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' }, usage: NUTZUNG },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: BUDGETS }, u)
    const ereignisse = lesen(u.db, laufId)
    // Ohne diese Zeile bestuenden beide Waechter auch ueber einem Protokoll ganz ohne Wirkung.
    expect(ereignisse.some(e => e.art === 'tool.completed' && e.nutzlast.name === 'datei_schreiben')).toBe(true)
    expect(effekteOhneIntent(ereignisse)).toEqual([])
    expect(effekteOhneEntscheidung(ereignisse)).toEqual([])
  })
})
