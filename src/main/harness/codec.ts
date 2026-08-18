/**
 * codec — two functions and no state.
 *
 * A codec never sees loop state, budgets or tool *execution*; the type signature makes it
 * impossible. It receives the tool list only in order to write it into the wire form. That is
 * why the text mode will later be another codec rather than a second path: there is no path,
 * there is a translation (M8 section 3.3).
 */

import type { Faehigkeiten } from '../model/entry'
import type { ModelAntwort, Nachricht } from './form'

export interface WerkzeugStummel {
  name: string
  /** One line. Stands in the stable prefix. German — the model reads it. */
  beschreibung: string
  /** Only sent when deferred loading is off; otherwise fetched via werkzeug_schema. */
  schema?: Record<string, unknown>
}

export interface Codec {
  name: 'anthropic' | 'openai-chat'
  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown
  fromWire(antwort: unknown): ModelAntwort
}

/**
 * Raised when a capability row says the model cannot carry a block type that the order does
 * carry. Never silently dropped: a missing image changes the answer without saying so.
 */
export class CodecKannNicht extends Error {
  constructor(blockArt: string, feld: string, f: Faehigkeiten) {
    super(
      `Das Modell nimmt keine Bloecke der Art '${blockArt}' — die Faehigkeitszeile sagt ` +
      `${feld}: false (Quelle: ${f.quelle}). Der Auftrag traegt einen solchen Block.`,
    )
    this.name = 'CodecKannNicht'
  }
}
