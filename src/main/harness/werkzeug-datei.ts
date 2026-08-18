/**
 * werkzeug-datei — reading, listing, searching. In-process, never through a shell.
 *
 * A `grep` via execFile would be convenient and would give up exactly the boundary that
 * justifies this stretch having no sandbox: the moment a command is assembled, checking its
 * arguments is theatre again.
 *
 * Every path passes pfadwache first. A rejection becomes a tool result with fehler: true — the
 * run continues, and the model learns why. A model that reaches too far should find out, not die.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pruefePfad } from './pfadwache'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

/** Files above this are refused rather than silently truncated. Same cap for reading and searching. */
const MAX_BYTES = 512 * 1024

/**
 * A regex source above this length is refused before it is ever compiled. Long enough for any
 * realistic search term, short enough to keep the cost of even a naive per-character construction
 * bounded — this does not stop catastrophic backtracking by itself, the time budget below does.
 */
const MAX_MUSTER_LAENGE = 200

/**
 * Wall-clock budget for one inhalt_suchen call, checked between files and between lines — never
 * relied upon alone: a single catastrophically slow regex.test() on one line can still run past
 * this budget, because the check only runs *between* evaluations, not inside one. That is a limit
 * of any check built this way, not a bug to "fix" here.
 */
const STANDARD_ZEITBUDGET_MS = 5000
let suchZeitbudgetMs = STANDARD_ZEITBUDGET_MS

/** Test-only seam so tests can trip the budget deterministically, without sleeping or building a
 *  real catastrophic pattern. Production code never calls this. */
export function _testSetzeSuchZeitbudgetMs(ms: number): void {
  suchZeitbudgetMs = ms
}
export function _testSuchZeitbudgetZuruecksetzen(): void {
  suchZeitbudgetMs = STANDARD_ZEITBUDGET_MS
}

function budgetUeberschritten(start: number): boolean {
  return Date.now() - start > suchZeitbudgetMs
}

function fehlendesFeld(feld: string): WerkzeugErgebnis {
  return { ok: false, meldung: `Das Feld '${feld}' fehlt in der Eingabe.` }
}

/**
 * Validates a single line-range bound: absent is fine (means "not given"), but a present value
 * that is not an integer >= 1 is named and rejected rather than silently reinterpreted — a
 * negative slice index (vonZeile: 0 becomes -1) would otherwise count from the end of the file.
 */
function zeilenGrenzePruefen(
  wert: unknown,
  feld: string,
): { ok: true; wert: number | null } | { ok: false; meldung: string } {
  if (wert === undefined) return { ok: true, wert: null }
  if (typeof wert !== 'number' || !Number.isInteger(wert) || wert < 1) {
    return { ok: false, meldung: `'${feld}' muss eine ganze Zahl ab 1 sein.` }
  }
  return { ok: true, wert }
}

function musterZuRegex(muster: string): RegExp {
  // Minimal glob: ** crosses directories, * does not, everything else is literal.
  const teile = muster.split(/(\*\*\/|\*\*|\*|\?)/).filter(t => t !== '')
  const gebaut = teile.map(t => {
    if (t === '**/') return '(?:.*/)?'
    if (t === '**') return '.*'
    if (t === '*') return '[^/]*'
    if (t === '?') return '[^/]'
    return t.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return new RegExp(`^${gebaut}$`)
}

function erlaubteDateien(ktx: WerkzeugKontext): string[] {
  const eintraege = readdirSync(ktx.wache.wurzel, { recursive: true, encoding: 'utf-8' })
  const raus: string[] = []
  for (const e of eintraege) {
    const voll = join(ktx.wache.wurzel, e)
    // The guard decides membership, not a second list here — one rule, one place.
    if (!pruefePfad(voll, ktx.wache).ok) continue
    try {
      if (statSync(voll).isFile()) raus.push(voll)
    } catch { /* vanished between listing and stat — not this tool's problem */ }
  }
  return raus.sort()
}

const dateiLesen: Werkzeug = {
  name: 'datei_lesen',
  beschreibung: 'Liest eine Datei aus der Projektwurzel, optional nur einen Zeilenbereich.',
  schema: () => ({
    type: 'object',
    properties: {
      pfad: { type: 'string', description: 'Pfad zur Datei' },
      vonZeile: { type: 'number', description: 'Erste Zeile, 1-basiert' },
      bisZeile: { type: 'number', description: 'Letzte Zeile, 1-basiert' },
    },
    required: ['pfad'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.pfad
    if (typeof roh !== 'string' || roh === '') return fehlendesFeld('pfad')

    const vonPruef = zeilenGrenzePruefen(eingabe.vonZeile, 'vonZeile')
    if (!vonPruef.ok) return { ok: false, meldung: vonPruef.meldung }
    const bisPruef = zeilenGrenzePruefen(eingabe.bisZeile, 'bisZeile')
    if (!bisPruef.ok) return { ok: false, meldung: bisPruef.meldung }
    const von = vonPruef.wert
    const bis = bisPruef.wert
    if (von !== null && bis !== null && bis < von) {
      return { ok: false, meldung: `'bisZeile' (${bis}) darf nicht kleiner sein als 'vonZeile' (${von}).` }
    }

    const wache = pruefePfad(roh, ktx.wache)
    if (!wache.ok) return { ok: false, meldung: wache.grund }

    let text: string
    try {
      if (statSync(wache.pfad).size > MAX_BYTES) {
        return { ok: false, meldung: `Datei ist groesser als ${MAX_BYTES} Bytes — nenne einen Zeilenbereich.` }
      }
      text = readFileSync(wache.pfad, 'utf-8')
    } catch {
      return { ok: false, meldung: `Datei nicht lesbar: ${relative(ktx.wache.wurzel, wache.pfad)}` }
    }

    if (von !== null || bis !== null) {
      const zeilen = text.split('\n')
      // A range past the end of the file is harmless and gets clamped — slice() already does
      // that on its own; only a negative or inverted range needed rejecting above.
      text = zeilen.slice((von ?? 1) - 1, bis ?? zeilen.length).join('\n')
    }
    return { ok: true, inhalt: [{ art: 'text', text }] }
  },
}

const verzeichnisListen: Werkzeug = {
  name: 'verzeichnis_listen',
  beschreibung: 'Listet Dateien der Projektwurzel nach einem Glob-Muster, etwa `src/**/*.ts`.',
  schema: () => ({
    type: 'object',
    properties: { muster: { type: 'string', description: 'Glob-Muster, relativ zur Wurzel' } },
    required: ['muster'],
  }),
  async ausfuehren(eingabe, ktx) {
    const muster = eingabe.muster
    if (typeof muster !== 'string' || muster === '') return fehlendesFeld('muster')

    let re: RegExp
    try { re = musterZuRegex(muster) }
    catch { return { ok: false, meldung: `Muster '${muster}' ist nicht auswertbar.` } }

    const treffer = erlaubteDateien(ktx)
      .map(p => relative(ktx.wache.wurzel, p))
      .filter(p => re.test(p.split('\\').join('/')))
    return {
      ok: true,
      inhalt: [{ art: 'text', text: treffer.length > 0 ? treffer.join('\n') : 'Keine Treffer.' }],
    }
  },
}

const inhaltSuchen: Werkzeug = {
  name: 'inhalt_suchen',
  beschreibung: 'Sucht per regulaerem Ausdruck in den Dateien der Projektwurzel.',
  schema: () => ({
    type: 'object',
    properties: {
      regex: { type: 'string', description: 'Regulaerer Ausdruck' },
      pfadFilter: { type: 'string', description: 'Glob-Muster, das die Dateiauswahl einschraenkt' },
    },
    required: ['regex'],
  }),
  async ausfuehren(eingabe, ktx) {
    const muster = eingabe.regex
    if (typeof muster !== 'string' || muster === '') return fehlendesFeld('regex')
    if (muster.length > MAX_MUSTER_LAENGE) {
      return { ok: false, meldung: `Regulaerer Ausdruck ist laenger als ${MAX_MUSTER_LAENGE} Zeichen.` }
    }

    let re: RegExp
    try { re = new RegExp(muster) }
    catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, meldung: `Regulaerer Ausdruck ist unbrauchbar: ${m}` }
    }

    let pfadRe: RegExp | null = null
    if (typeof eingabe.pfadFilter === 'string' && eingabe.pfadFilter !== '') {
      pfadRe = musterZuRegex(eingabe.pfadFilter)
    }

    const start = Date.now()
    const zeilen: string[] = []
    let uebersprungen = 0

    dateiSchleife: for (const datei of erlaubteDateien(ktx)) {
      if (budgetUeberschritten(start)) {
        return { ok: false, meldung: `Suche abgebrochen: Zeitbudget von ${suchZeitbudgetMs} ms ueberschritten.` }
      }
      const rel = relative(ktx.wache.wurzel, datei).split('\\').join('/')
      if (pfadRe && !pfadRe.test(rel)) continue

      // Same cap as datei_lesen: skip rather than block the whole run on one oversized file —
      // a stray log or a binary blob in the tree should not stall the search for everything else.
      let groesse: number
      try { groesse = statSync(datei).size } catch { continue }
      if (groesse > MAX_BYTES) { uebersprungen += 1; continue }

      let inhalt: string
      try { inhalt = readFileSync(datei, 'utf-8') } catch { continue }
      const inhaltsZeilen = inhalt.split('\n')
      for (let i = 0; i < inhaltsZeilen.length; i += 1) {
        // Checked per line, not just per file: one very long line (a minified bundle, a base64
        // blob) can burn the whole budget on its own, between two file-level checks.
        if (budgetUeberschritten(start)) {
          return { ok: false, meldung: `Suche abgebrochen: Zeitbudget von ${suchZeitbudgetMs} ms ueberschritten.` }
        }
        if (re.test(inhaltsZeilen[i])) zeilen.push(`${rel}:${i + 1}: ${inhaltsZeilen[i].trim()}`)
      }
      if (zeilen.length > 200) break dateiSchleife
    }

    const kernText = zeilen.length > 0 ? zeilen.join('\n') : 'Keine Treffer.'
    const hinweis = uebersprungen > 0
      ? `\n(${uebersprungen} Datei(en) uebersprungen: groesser als ${MAX_BYTES} Bytes)`
      : ''
    return { ok: true, inhalt: [{ art: 'text', text: kernText + hinweis }] }
  },
}

export const DATEI_WERKZEUGE: Werkzeug[] = [dateiLesen, verzeichnisListen, inhaltSuchen]
