/**
 * form — the canonical message form. Everything the harness translates passes through here.
 *
 * Six block types from day one. What is not retrofittable is the *union*, not the individual
 * case: if it is designed text-only, every codec, every event and every log line assumes text
 * later, and multimodality becomes a rebuild rather than an addition (M8 section 3.3).
 *
 * The shape follows Anthropic's because it maps losslessly onto OpenAI and Gemini; the
 * reverse direction loses information.
 */

/**
 * Woher der Inhalt eines Werkzeugergebnisses stammt. `netz` heisst: fremdbestimmt, von einer
 * Gegenstelle, die niemand von uns kontrolliert. `lokal` heisst: aus dieser Maschine.
 *
 * Das steht im Ereignisschema und in der Nachrichtenform, seit es das erste Netz-Werkzeug gibt,
 * und nicht spaeter: nachtraeglich hiesse, das Schema zu aendern und jedes persistierte Protokoll
 * neu zu deuten — und die Deutung waere ein Raten darueber, was ein Werkzeugname vor Monaten
 * bedeutet hat.
 *
 * `fremd` heisst: auf dieser Maschine erzeugt, aber von Code, den wir nicht kontrollieren — die
 * Ausgabe eines Build-Werkzeugs. Ein eigener Wert und kein `netz`, weil ein Protokolleintrag sonst
 * behauptete, ein `npm ci` sei von einer Gegenstelle gekommen; und kein `lokal`, weil das
 * verschwiege, dass ein Paket in diesen Text schreiben kann und er im Modellkontext landet.
 *
 * **Die Angabe gilt nur dem Erfolgsfall, und das ist eine Luecke, keine Feinheit.** Scheitert ein
 * Kommando, gehen die Bytes des Kindes in `meldung` eines `WerkzeugErgebnis` — und das Feld hat
 * kein `quelle` daneben. Die fremde Ausgabe eines fehlgeschlagenen Baus kommt also ohne diese
 * Kennzeichnung im Modellkontext an, obwohl sie dieselbe Herkunft hat. Was dagegen haelt, ist
 * keine Typangabe, sondern die Reihenfolge: `werkzeug-shell.ts` stellt in jedem Fehlerausgang
 * keels eigenen Satz **vor** die fremde Ausgabe, damit eine Abhaengigkeit, die eine Zeile in
 * diesem Stil druckt, sie nicht vortaeuschen kann — sie kaeme immer danach.
 */
export type WerkzeugQuelle = 'netz' | 'lokal' | 'fremd'

export type Block =
  | { art: 'text';              text: string }
  | { art: 'denken';            text: string; signatur?: string }
  | { art: 'bild';              medientyp: string; daten: string }
  | { art: 'dokument';          medientyp: string; name: string; daten: string }
  | { art: 'werkzeug-aufruf';   id: string; name: string; eingabe: Record<string, unknown> }
  | {
      art: 'werkzeug-ergebnis'; aufrufId: string; inhalt: Block[]; fehler: boolean
      /**
       * Optional, weil ein Protokoll aus der Zeit vor dieser Angabe sie nicht hat. `projektion.ts`
       * erfindet dann nichts und laesst das Feld weg — ein geratenes `'lokal'` waere eine Auskunft
       * ueber alte Laeufe, die niemand geprueft hat.
       */
      quelle?: WerkzeugQuelle
    }

export interface Nachricht {
  rolle: 'nutzer' | 'modell'
  bloecke: Block[]
}

/** Normalised across providers, with the provider's own word kept beside it. */
export interface ModelAntwort {
  bloecke: Block[]
  stopGrund: { normalisiert: 'ende' | 'laenge' | 'werkzeug' | 'anderes'; roh: string }
  usage: { eingabeToken: number; ausgabeToken: number; roh: unknown }
}

export function nurText(bloecke: Block[]): string {
  return bloecke.filter(b => b.art === 'text').map(b => (b as { text: string }).text).join('\n')
}

export function werkzeugAufrufe(bloecke: Block[]): Array<Extract<Block, { art: 'werkzeug-aufruf' }>> {
  return bloecke.filter(b => b.art === 'werkzeug-aufruf') as Array<Extract<Block, { art: 'werkzeug-aufruf' }>>
}
