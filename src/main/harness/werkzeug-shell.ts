/**
 * werkzeug-shell — the one tool that starts a process.
 *
 * Nothing here parses the command, and there is no positive list of allowed commands. Against a
 * shell a string check is theatre (`$(...)`, a rewritten npm script), and the boundary is the
 * sandbox. The list in sandkasten.ts decides only *which of the two profiles* a command runs
 * under, never *whether* it runs.
 *
 * Its stub is one line, and that is not cosmetics: faehigkeiten.ts already warns by name that a
 * multi-line description can smuggle a made-up `shell_ausfuehren` entry into the stable prefix,
 * indistinguishable from keel's own list. Actually having the tool makes that warning sharper,
 * not smaller.
 */

import { istPaketbefehl, starte, STANDARD_ZEITGRENZE_MS } from './sandkasten'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

const shellAusfuehren: Werkzeug = {
  name: 'shell_ausfuehren',
  beschreibung: 'Fuehrt ein Kommando im Projektverzeichnis aus, in einem Sandkasten ohne Netz (Paketbefehle ausgenommen).',
  schema: () => ({
    type: 'object',
    properties: {
      kommando: { type: 'string', description: 'Das Kommando, wie in einer Shell getippt' },
      zeitgrenzeMs: { type: 'number', description: 'Zeitgrenze in Millisekunden' },
    },
    required: ['kommando'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext): Promise<WerkzeugErgebnis> {
    const kommando = eingabe.kommando
    if (typeof kommando !== 'string' || kommando === '') {
      return { ok: false, meldung: `Das Feld 'kommando' fehlt in der Eingabe.` }
    }
    if (!ktx.sandkasten) {
      return { ok: false, meldung: 'Fuer diesen Lauf ist kein Sandkasten eingerichtet — es wird nichts ausgefuehrt.' }
    }

    const zeitgrenze = typeof eingabe.zeitgrenzeMs === 'number' && eingabe.zeitgrenzeMs > 0
      ? eingabe.zeitgrenzeMs
      : STANDARD_ZEITGRENZE_MS

    const netz = istPaketbefehl(kommando) ? 'offen' : 'zu'
    const r = await starte(kommando, ktx.sandkasten, netz, zeitgrenze)

    // Named apart, because they mean different things to whoever reads the log: a wall-clock
    // ceiling that ran out, versus a boundary that refused. Conflating them turns a sandbox
    // rejection into a mysterious build error.
    if (r.zeitueberschreitung) {
      return { ok: false, meldung: `Abgebrochen: die Zeitgrenze von ${zeitgrenze} ms ist ueberschritten.` }
    }
    // Ein Spawn-Fehler liefert ebenfalls `code: null` — ohne eigenen Zweig kaeme er als
    // "Rueckgabecode null" heraus, und ein Modell suchte den Fehler in seinem Kommando statt im
    // Sandkasten, der gar nicht erst startete. Drei Ausgaenge, drei Texte.
    if (r.code === null) {
      return { ok: false, meldung: `Der Sandkasten liess sich nicht starten: ${r.ausgabe}` }
    }
    if (r.code !== 0) {
      return {
        ok: false,
        meldung: `Kommando endete mit Rueckgabecode ${String(r.code)}.\n${r.ausgabe}`,
      }
    }

    const hinweis = r.abgeschnitten ? '\n(Ausgabe abgeschnitten.)' : ''
    const netzHinweis = netz === 'offen' ? '\n(Als Paketbefehl erkannt — mit Netzzugang gelaufen.)' : ''
    return {
      ok: true,
      // `fremd`, not `lokal`: what a build tool prints is not keel's word. A dependency can print
      // whatever it likes into that stream, and it lands in the model's context.
      quelle: 'fremd',
      inhalt: [{ art: 'text', text: r.ausgabe + hinweis + netzHinweis }],
    }
  },
}

export const SHELL_WERKZEUGE: Werkzeug[] = [shellAusfuehren]
