/**
 * werkzeuge — the registry, the stub list, and the deferred loading of schemas.
 *
 * Stubs in the stable prefix, schemas appended to the history. Never the other way round: a
 * schema written into the prefix invalidates the cache on every load and breaks exactly what
 * the mechanism exists for (M8 section 3.5).
 *
 * The registry also carries the meta tool. Fetching a schema explicitly beats letting the model
 * call a tool it has not seen the schema of: both cost one round of latency, but the second also
 * burns a call built on a guessed shape and teaches the model a wrong form first.
 */

import type Database from 'better-sqlite3'
import type { Block } from './form'
import type { WerkzeugStummel } from './codec'
import type { WacheKontext } from './pfadwache'

export interface WerkzeugKontext {
  wache: WacheKontext
  graphDb: Database.Database | null
}

export type WerkzeugErgebnis =
  | { ok: true; inhalt: Block[] }
  | { ok: false; meldung: string }

// `Omit<..., 'schema'>` rather than a plain `extends`: WerkzeugStummel's `schema` is an optional
// property, Werkzeug's is a required method, and TypeScript rejects that override directly.
export interface Werkzeug extends Omit<WerkzeugStummel, 'schema'> {
  schema(): Record<string, unknown>
  ausfuehren(eingabe: Record<string, unknown>, ktx: WerkzeugKontext): Promise<WerkzeugErgebnis>
}

export const META_WERKZEUG_NAME = 'werkzeug_schema'

export class WerkzeugRegistry {
  constructor(private readonly werkzeuge: Werkzeug[]) {}

  alle(): Werkzeug[] {
    return this.werkzeuge
  }

  finde(name: string): Werkzeug | null {
    return this.werkzeuge.find(w => w.name === name) ?? null
  }

  schemaVon(name: string): Record<string, unknown> | null {
    return this.finde(name)?.schema() ?? null
  }

  /**
   * What goes into the stable prefix. With deferred loading: name and one line, plus the meta
   * tool whose own schema is small enough to always ship. Without it: every schema up front,
   * and no meta tool — it would have nothing to do.
   */
  stummel(aufgeschoben: boolean): WerkzeugStummel[] {
    if (!aufgeschoben) {
      return this.werkzeuge.map(w => ({ name: w.name, beschreibung: w.beschreibung, schema: w.schema() }))
    }
    return [
      ...this.werkzeuge.map(w => ({ name: w.name, beschreibung: w.beschreibung })),
      // Exception, not an oversight: the meta tool is the *only* way to fetch a schema, so it
      // must carry its own from the start — otherwise the model would have to guess the call
      // that is meant to end guessing.
      {
        name: META_WERKZEUG_NAME,
        beschreibung:
          'Holt das vollstaendige Eingabeschema eines Werkzeugs. Rufe es, bevor du ein Werkzeug ' +
          'zum ersten Mal benutzt.',
        schema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Name des Werkzeugs' } },
          required: ['name'],
        },
      },
    ]
  }
}
