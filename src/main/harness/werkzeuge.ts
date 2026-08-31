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
import type { Block, WerkzeugQuelle } from './form'
import type { WerkzeugStummel } from './codec'
import type { WacheKontext } from './pfadwache'
import type { NetzKontext } from './werkzeug-netz'
import type { SandkastenKontext } from './sandkasten'

export interface WerkzeugKontext {
  wache: WacheKontext
  graphDb: Database.Database | null
  /**
   * Netzzugang, wenn der Lauf einen hat. Optional, und die Netz-Werkzeuge antworten ohne ihn
   * **benannt** statt leer.
   *
   * Warum die Konfiguration hier durchgereicht wird und die Werkzeuge sie sich nicht selbst aus
   * dem `configStore` ziehen: siehe `NetzKontext` in werkzeug-netz.ts. Kurz — das Werkzeug bleibt
   * eine reine Funktion ueber seinem Kontext, und die anpassbare Flaeche entsteht an genau einer
   * Stelle.
   */
  netz?: NetzKontext
  /**
   * Der Prozessrand fuer `shell_ausfuehren`. Optional, und das Werkzeug antwortet ohne ihn
   * **benannt** statt zu laufen — dieselbe Regel wie bei `netz`: ein Werkzeug ohne seinen Kontext
   * sagt, was fehlt, statt still etwas anderes zu tun.
   */
  sandkasten?: SandkastenKontext
}

export type WerkzeugErgebnis =
  | {
      ok: true
      inhalt: Block[]
      /**
       * Pflichtangabe, kein optionales Extra: ein neues Werkzeug muss sich entscheiden, ob sein
       * Inhalt fremdbestimmt ist. Vergessen kann man das dann nicht mehr — der Compiler fragt.
       */
      quelle: WerkzeugQuelle
      /**
       * Nur `web_suchen` fuellt das: die URLs der ausgegebenen Treffer, wortgleich. Sie landen in
       * `tool.completed` und sind die einzige Quelle der Herkunftspruefung von `seite_lesen`
       * (werkzeug-netz.ts). Ein eigenes Feld und kein Zurueckparsen des Antworttextes — der Text
       * traegt auch Titel und Auszuege, und die schreibt die Gegenstelle.
       */
      trefferUrls?: string[]
      /**
       * Nur `seite_lesen` fuellt das: Titel und **End**-URL der Seite, die wirklich gelesen wurde.
       * Es landet in `tool.completed` und ist die einzige Quelle der Quellenliste, die der
       * Rechercheur seinem Elternlauf zurueckgibt (rechercheur.ts).
       *
       * Ein eigenes Feld und kein Zurueckparsen des Antworttextes — aus demselben Grund wie bei
       * `trefferUrls`: der Text traegt den fremdbestimmten Seitenrumpf, und wer dort nach URLs
       * sucht, laesst die Gegenstelle die Quellenliste mitschreiben. Und die Quellenliste ist das
       * Einzige, was gegen den vergifteten Befund ueberhaupt noch hilft.
       */
      gelesen?: { titel: string; url: string }
    }
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
