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

/** Files above this are refused rather than silently truncated. */
const MAX_BYTES = 512 * 1024

function fehlendesFeld(feld: string): WerkzeugErgebnis {
  return { ok: false, meldung: `Das Feld '${feld}' fehlt in der Eingabe.` }
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

    const von = typeof eingabe.vonZeile === 'number' ? eingabe.vonZeile : null
    const bis = typeof eingabe.bisZeile === 'number' ? eingabe.bisZeile : null
    if (von !== null || bis !== null) {
      const zeilen = text.split('\n')
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

    const zeilen: string[] = []
    for (const datei of erlaubteDateien(ktx)) {
      const rel = relative(ktx.wache.wurzel, datei).split('\\').join('/')
      if (pfadRe && !pfadRe.test(rel)) continue
      let inhalt: string
      try { inhalt = readFileSync(datei, 'utf-8') } catch { continue }
      inhalt.split('\n').forEach((z, i) => {
        if (re.test(z)) zeilen.push(`${rel}:${i + 1}: ${z.trim()}`)
      })
      if (zeilen.length > 200) break
    }
    return {
      ok: true,
      inhalt: [{ art: 'text', text: zeilen.length > 0 ? zeilen.join('\n') : 'Keine Treffer.' }],
    }
  },
}

export const DATEI_WERKZEUGE: Werkzeug[] = [dateiLesen, verzeichnisListen, inhaltSuchen]
