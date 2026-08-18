/**
 * werkzeug-graph — the four reading graph operations, as a second rendering over one source.
 *
 * These call the same functions the MCP server calls, not the server itself. An MCP client for
 * foreign servers is explicitly not v1 (M8 section 13), and for our own server it would be a
 * detour across a process boundary that does not exist. The guard test in
 * tests/harness/werkzeug-graph.test.ts holds both renderings to the same four operations.
 *
 * Writing operations — graph_upsert_node, graph_link, graph_maintain — are deliberately absent.
 * They belong to the stretch that brings the sandbox.
 */

import { graphSearch, graphGetNode, graphExpand } from '../graph/search'
import { graphQuery } from '../graph/query'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

const OHNE_DB: WerkzeugErgebnis = {
  ok: false,
  meldung: 'Der Knowledge-Graph ist in dieser Sitzung nicht verfuegbar.',
}

function alsText(wert: unknown): WerkzeugErgebnis {
  return { ok: true, inhalt: [{ art: 'text', text: JSON.stringify(wert, null, 2) }] }
}

function fehlgeschlagen(err: unknown): WerkzeugErgebnis {
  return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
}

const graphSuchen: Werkzeug = {
  name: 'graph_suchen',
  beschreibung: 'Durchsucht den Knowledge-Graph. Liefert knappe Treffer; Details ueber graph_knoten_holen.',
  schema: () => ({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Suchbegriff' },
      limit: { type: 'number', description: 'Hoechstzahl der Treffer, Vorgabe 10' },
      kind: { type: 'string', description: 'Auf eine Knotenart einschraenken' },
    },
    required: ['query'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.query !== 'string') return { ok: false, meldung: "Das Feld 'query' fehlt in der Eingabe." }
    try {
      return alsText(graphSearch(ktx.graphDb, {
        query: eingabe.query,
        limit: typeof eingabe.limit === 'number' ? eingabe.limit : 10,
        ...(typeof eingabe.kind === 'string' ? { kind: eingabe.kind } : {}),
      } as Parameters<typeof graphSearch>[1]))
    } catch (err) { return fehlgeschlagen(err) }
  },
}

const graphKnotenHolen: Werkzeug = {
  name: 'graph_knoten_holen',
  beschreibung: 'Laedt einen vollstaendigen Knoten samt Rumpf und Frontmatter ueber seine uid.',
  schema: () => ({
    type: 'object',
    properties: { uid: { type: 'string', description: 'uid des Knotens' } },
    required: ['uid'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.uid !== 'string') return { ok: false, meldung: "Das Feld 'uid' fehlt in der Eingabe." }
    try {
      const knoten = graphGetNode(ktx.graphDb, eingabe.uid)
      // A missing node is a fact, not a failure — the model should be able to act on it.
      return alsText(knoten ?? { gefunden: false, uid: eingabe.uid })
    } catch (err) { return fehlgeschlagen(err) }
  },
}

const graphAusweiten: Werkzeug = {
  name: 'graph_ausweiten',
  beschreibung: 'Weitet die Nachbarschaft eines Knotens aus, optional nach Kantenart und Richtung.',
  schema: () => ({
    type: 'object',
    properties: {
      uid: { type: 'string', description: 'uid des Mittelpunkts' },
      depth: { type: 'number', description: 'Tiefe 1 bis 5, Vorgabe 1' },
      edge_type: { type: 'string', description: 'Auf eine Kantenart einschraenken' },
      direction: { type: 'string', description: 'outgoing, incoming oder both' },
    },
    required: ['uid'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.uid !== 'string') return { ok: false, meldung: "Das Feld 'uid' fehlt in der Eingabe." }
    try {
      return alsText(graphExpand(ktx.graphDb, {
        uid: eingabe.uid,
        depth: typeof eingabe.depth === 'number' ? eingabe.depth : 1,
        ...(typeof eingabe.edge_type === 'string' ? { edge_type: eingabe.edge_type } : {}),
        ...(typeof eingabe.direction === 'string' ? { direction: eingabe.direction } : {}),
      } as Parameters<typeof graphExpand>[1]))
    } catch (err) { return fehlgeschlagen(err) }
  },
}

const graphAbfragen: Werkzeug = {
  name: 'graph_abfragen',
  beschreibung: 'Fuehrt eine benannte Abfragevorlage aus. Freie Abfragen gibt es nicht.',
  schema: () => ({
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Name der Vorlage' },
      params: { type: 'object', description: 'Parameter der Vorlage' },
    },
    required: ['template'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.template !== 'string') return { ok: false, meldung: "Das Feld 'template' fehlt in der Eingabe." }
    try {
      return alsText(graphQuery(ktx.graphDb, {
        template: eingabe.template,
        params: (eingabe.params as Record<string, unknown>) ?? {},
      } as Parameters<typeof graphQuery>[1]))
    } catch (err) { return fehlgeschlagen(err) }
  },
}

export const GRAPH_WERKZEUGE: Werkzeug[] = [
  graphSuchen, graphKnotenHolen, graphAusweiten, graphAbfragen,
]
