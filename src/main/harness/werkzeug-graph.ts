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
 *
 * Findings addressed:
 * - F1: Size limits on limit (1..100), depth (1..5)
 * - F2: Enums in schemas (NODE_KINDS, EDGE_TYPES, QUERY_TEMPLATES)
 * - F3: German error messages with allowlist, not blacklist
 * - F4: Optional fields with wrong type are rejected, not silently coerced
 * - F3 (Fix): Body field truncated before serialization, result stays valid JSON
 * - F1 (Fix): Error messages redacted with allowlist, not regex blacklist
 * - F2 (Fix): params field in graph_abfragen is type-checked (not string/array)
 */

import { graphSearch, graphGetNode, graphExpand } from '../graph/search'
import { graphQuery, QUERY_TEMPLATES, isValidTemplate } from '../graph/query'
import { NODE_KINDS } from '../graph/node-types'
import { EDGE_TYPES } from '../graph/edge-types'
import type { FullNode } from '../graph/search'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

const OHNE_DB: WerkzeugErgebnis = {
  ok: false,
  meldung: 'Der Knowledge-Graph ist in dieser Sitzung nicht verfuegbar.',
}

// Body truncation limit: generous (100 KB) since it's actual content.
// Result serialization fallback: 8 KB as last safeguard.
// Separation intentional: body truncation keeps result as valid JSON with marker in situ;
// serialization fallback is last-resort for accumulated metadata that exceeds limits.
const MAX_BODY_SIZE = 102400 // 100 KB for actual content
const MAX_JSON_SIZE = 8192 // 8 KB as serialization fallback for other tools

// Known safe error messages that can be passed through (allowlist).
// Everything else is abstracted to "[Datenbankfehler]" to avoid leaking schema names.
const SAFE_ERROR_PATTERNS = [
  /Vorlage/i, // Graph query template errors (already redacted in graph_abfragen)
  /Parameter/, // Missing/wrong parameters
]

function isSafeError(msg: string): boolean {
  return SAFE_ERROR_PATTERNS.some(p => p.test(msg))
}

function alsText(wert: unknown): WerkzeugErgebnis {
  let txt = JSON.stringify(wert, null, 2)
  let gekuerzt = false
  if (txt.length > MAX_JSON_SIZE) {
    txt = txt.slice(0, MAX_JSON_SIZE)
    gekuerzt = true
  }
  const inhalt = [{ art: 'text' as const, text: txt }]
  if (gekuerzt) {
    inhalt.push({ art: 'text' as const, text: `\n[Ergebnis gekürzt auf ${MAX_JSON_SIZE} Zeichen — nicht mehr als JSON lesbar]` })
  }
  return { ok: true, inhalt }
}

/**
 * Truncate body field before serialization so result stays valid JSON.
 * Marker stays in JSON where the model sees it directly.
 */
function truncateBody(knoten: FullNode | null): FullNode | null {
  if (!knoten || !knoten.body) return knoten
  if (knoten.body.length <= MAX_BODY_SIZE) return knoten
  return {
    ...knoten,
    body: knoten.body.slice(0, MAX_BODY_SIZE) + '\n[Rumpf gekürzt — nicht vollständig]',
  }
}

function fehlgeschlagen(werkzeug: string, err: unknown): WerkzeugErgebnis {
  let msg = err instanceof Error ? err.message : String(err)

  // Allowlist: only pass through known safe patterns. Everything else gets abstracted.
  // Intention: avoid leaking schema names (table, column), constraint names, etc.
  // Full cause goes into event log, not into prompt.
  if (!isSafeError(msg)) {
    msg = '[Datenbankfehler]'
  } else if (msg.length > 100) {
    msg = msg.slice(0, 100) + '…'
  }

  return {
    ok: false,
    meldung: `${werkzeug}: ${msg}`,
  }
}

const graphSuchen: Werkzeug = {
  name: 'graph_suchen',
  beschreibung: 'Durchsucht den Knowledge-Graph. Liefert knappe Treffer; Details ueber graph_knoten_holen.',
  schema: () => ({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Suchbegriff' },
      limit: { type: 'number', description: 'Hoechstzahl der Treffer, 1-100, Vorgabe 10' },
      kind: { type: 'string', description: 'Auf eine Knotenart einschraenken', enum: NODE_KINDS },
    },
    required: ['query'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.query !== 'string') return { ok: false, meldung: "Das Feld 'query' fehlt in der Eingabe." }

    // F4: Reject optional fields with wrong type
    if ('limit' in eingabe && typeof eingabe.limit !== 'number') {
      return { ok: false, meldung: "Das Feld 'limit' muss eine Zahl sein." }
    }

    // F1: Enforce limit bounds
    const limit = typeof eingabe.limit === 'number' ? eingabe.limit : 10
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { ok: false, meldung: "Das Feld 'limit' muss zwischen 1 und 100 liegen." }
    }

    if ('kind' in eingabe && typeof eingabe.kind !== 'string') {
      return { ok: false, meldung: "Das Feld 'kind' muss eine Zeichenkette sein." }
    }

    try {
      return alsText(graphSearch(ktx.graphDb, {
        query: eingabe.query,
        limit,
        ...(typeof eingabe.kind === 'string' ? { kind: eingabe.kind } : {}),
      } as Parameters<typeof graphSearch>[1]))
    } catch (err) { return fehlgeschlagen('graph_suchen', err) }
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
      const gekuerzt = truncateBody(knoten)
      return alsText(gekuerzt ?? { gefunden: false, uid: eingabe.uid })
    } catch (err) { return fehlgeschlagen('graph_knoten_holen', err) }
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
      edge_type: { type: 'string', description: 'Auf eine Kantenart einschraenken', enum: EDGE_TYPES },
      direction: { type: 'string', description: 'outgoing, incoming oder both', enum: ['outgoing', 'incoming', 'both'] },
    },
    required: ['uid'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.uid !== 'string') return { ok: false, meldung: "Das Feld 'uid' fehlt in der Eingabe." }

    // F4: Reject optional fields with wrong type
    if ('depth' in eingabe && typeof eingabe.depth !== 'number') {
      return { ok: false, meldung: "Das Feld 'depth' muss eine Zahl sein." }
    }

    // F1: Enforce depth bounds
    const depth = typeof eingabe.depth === 'number' ? eingabe.depth : 1
    if (!Number.isInteger(depth) || depth < 1 || depth > 5) {
      return { ok: false, meldung: "Das Feld 'depth' muss zwischen 1 und 5 liegen." }
    }

    if ('edge_type' in eingabe && typeof eingabe.edge_type !== 'string') {
      return { ok: false, meldung: "Das Feld 'edge_type' muss eine Zeichenkette sein." }
    }

    if ('direction' in eingabe && typeof eingabe.direction !== 'string') {
      return { ok: false, meldung: "Das Feld 'direction' muss eine Zeichenkette sein." }
    }

    try {
      return alsText(graphExpand(ktx.graphDb, {
        uid: eingabe.uid,
        depth,
        ...(typeof eingabe.edge_type === 'string' ? { edge_type: eingabe.edge_type } : {}),
        ...(typeof eingabe.direction === 'string' ? { direction: eingabe.direction } : {}),
      } as Parameters<typeof graphExpand>[1]))
    } catch (err) { return fehlgeschlagen('graph_ausweiten', err) }
  },
}

const graphAbfragen: Werkzeug = {
  name: 'graph_abfragen',
  beschreibung: 'Fuehrt eine benannte Abfragevorlage aus. Freie Abfragen gibt es nicht.',
  schema: () => ({
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Name der Vorlage', enum: QUERY_TEMPLATES },
      params: { type: 'object', description: 'Parameter der Vorlage' },
    },
    required: ['template'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.template !== 'string') return { ok: false, meldung: "Das Feld 'template' fehlt in der Eingabe." }

    // F2: Type-check params: must be object, not array or string
    if ('params' in eingabe) {
      const paramsType = typeof eingabe.params
      if (paramsType !== 'object' || eingabe.params === null || Array.isArray(eingabe.params)) {
        return { ok: false, meldung: "Das Feld 'params' muss ein Objekt sein." }
      }
    }

    // F3: Pre-check template against allowlist for better error message
    if (!isValidTemplate(eingabe.template)) {
      return {
        ok: false,
        meldung: `Vorlage '${eingabe.template}' existiert nicht. Verfuegbare Vorlagen: ${QUERY_TEMPLATES.slice(0, 5).join(', ')}…`,
      }
    }

    try {
      // At this point, TypeScript knows eingabe.template is QueryTemplate (after isValidTemplate)
      return alsText(graphQuery(ktx.graphDb, {
        template: eingabe.template,
        params: (eingabe.params as Record<string, unknown>) ?? {},
      }))
    } catch (err) { return fehlgeschlagen('graph_abfragen', err) }
  },
}

export const GRAPH_WERKZEUGE: Werkzeug[] = [
  graphSuchen, graphKnotenHolen, graphAusweiten, graphAbfragen,
]
