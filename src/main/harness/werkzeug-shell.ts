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

import { istPaketbefehl, starte, MAX_ZEITGRENZE_MS, STANDARD_ZEITGRENZE_MS } from './sandkasten'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

// Test-only seam, wie `_testSetzeSuchZeitbudgetMs` in werkzeug-datei.ts: die echte Decke ist
// 15 Minuten, und kein Test soll so lange laufen, um zu beweisen, dass sie greift. Produktionscode
// ruft diese Funktionen nie.
let maxZeitgrenzeMsOverride: number | null = null
export function _testSetzeMaxZeitgrenzeMs(ms: number): void {
  maxZeitgrenzeMsOverride = ms
}
export function _testMaxZeitgrenzeMsZuruecksetzen(): void {
  maxZeitgrenzeMsOverride = null
}

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

    // Gedeckelt, nicht bloss uebernommen: der Wert kommt aus der Modelleingabe, und ohne
    // Obergrenze waere `STANDARD_ZEITGRENZE_MS` an dem einen Werkzeug, das Prozesse startet, eine
    // Empfehlung statt einer Decke — ein `zeitgrenzeMs: 100000000` hielte den Lauf tagelang offen.
    // Das ist keine Kommandopruefung: es sieht `kommando` nicht an.
    const gewuenscht = typeof eingabe.zeitgrenzeMs === 'number' && eingabe.zeitgrenzeMs > 0
      ? eingabe.zeitgrenzeMs
      : STANDARD_ZEITGRENZE_MS
    const zeitgrenze = Math.min(gewuenscht, maxZeitgrenzeMsOverride ?? MAX_ZEITGRENZE_MS)

    const netz = istPaketbefehl(kommando) ? 'offen' : 'zu'
    const r = await starte(kommando, ktx.sandkasten, netz, zeitgrenze)

    // Vor der Fallunterscheidung berechnet, weil er in **jeden** Ausgang gehoert. Vorher hing er
    // nur am Erfolg — und abgeschnitten wird am ehesten der fehlgeschlagene Bau, also genau der
    // Fall, in dem das Modell sonst einen gekuerzten Fehler liest, den echten Fehler vermisst
    // und raet.
    const hinweis = r.abgeschnitten ? '\n(Ausgabe abgeschnitten.)' : ''

    // Named apart, because they mean different things to whoever reads the log: a wall-clock
    // ceiling that ran out, versus a boundary that refused. Conflating them turns a sandbox
    // rejection into a mysterious build error.
    // In allen drei Ausgaengen steht keels Satz **vorn** und die fremde Ausgabe dahinter: eine
    // Abhaengigkeit, die eine Zeile im Stil dieser Meldungen druckt, kann sie damit nicht
    // vortaeuschen — sie kaeme immer danach.
    if (r.zeitueberschreitung) {
      return {
        ok: false,
        meldung: `Abgebrochen: die Zeitgrenze von ${zeitgrenze} ms ist ueberschritten.\n${r.ausgabe}${hinweis}`,
      }
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
        meldung: `Kommando endete mit Rueckgabecode ${String(r.code)}.\n${r.ausgabe}${hinweis}`,
      }
    }

    const netzHinweis = netz === 'offen' ? '\n(Als Paketbefehl erkannt — mit Netzzugang gelaufen.)' : ''
    const notizen = (hinweis + netzHinweis).trimStart()
    return {
      ok: true,
      // `fremd`, not `lokal`: what a build tool prints is not keel's word. A dependency can print
      // whatever it likes into that stream, and it lands in the model's context.
      quelle: 'fremd',
      // Keels eigene Notizen in einem **eigenen** Block, nicht an die fremde Ausgabe geklebt.
      // Sonst faelscht eine Abhaengigkeit, die "(Als Paketbefehl erkannt …)" druckt, eine Aussage
      // ueber den Netzmodus dieses Laufs — dieselbe Faelschungsklasse, deretwegen der Stummel
      // dieses Werkzeugs einzeilig bleiben muss (siehe Modulkopf).
      inhalt: notizen === ''
        ? [{ art: 'text', text: r.ausgabe }]
        : [{ art: 'text', text: r.ausgabe }, { art: 'text', text: notizen }],
    }
  },
}

export const SHELL_WERKZEUGE: Werkzeug[] = [shellAusfuehren]
