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

export type Block =
  | { art: 'text';              text: string }
  | { art: 'denken';            text: string; signatur?: string }
  | { art: 'bild';              medientyp: string; daten: string }
  | { art: 'dokument';          medientyp: string; name: string; daten: string }
  | { art: 'werkzeug-aufruf';   id: string; name: string; eingabe: Record<string, unknown> }
  | { art: 'werkzeug-ergebnis'; aufrufId: string; inhalt: Block[]; fehler: boolean }

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
