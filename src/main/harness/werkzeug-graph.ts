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
 * - F3 (Fix-Runde 2): Body field truncated before serialization, result stays valid JSON
 * - F1 (Fix-Runde 3): Error messages redacted with allowlist, not regex blacklist
 * - F2 (Fix-Runde 3): params field in graph_abfragen is type-checked (not string/array)
 * - Critical (Fix-Runde 4): the body-truncation fix from Fix-Runde 3 still fed its output
 *   through a serializer that unconditionally sliced the JSON STRING at MAX_JSON_SIZE. For
 *   any node whose body was between MAX_JSON_SIZE and MAX_BODY_SIZE — i.e. most real
 *   documents in this repo — the string cut landed mid-value and produced invalid JSON.
 *   `serialisiereSicher()` replaces that string-slicing with a size check performed BEFORE
 *   truncation decisions ever touch the serialized text: if it fits, return it whole; if
 *   not, replace the whole payload with a small well-formed object reporting the overrun,
 *   never a partial string. See its doc comment for the full reasoning.
 * - Important (Fix-Runde 4): SAFE_ERROR_PATTERNS in Fix-Runde 3 used /Vorlage/i and
 *   /Parameter/ (case-sensitive) as an allowlist, but neither pattern ever matched a real
 *   message from src/main/graph/{query,search}.ts (which say "Template" and lowercase
 *   "parameter"), and the one message that does say "Vorlage" is produced by the pre-check
 *   in graph_abfragen, before the try/catch that calls isSafeError() at all. The allowlist
 *   was therefore dead code presenting as a safeguard. Patterns now match the actual thrown
 *   messages (verified by grep against query.ts/search.ts).
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

// Body truncation limit: generous (100 KB) because the body is the actual payload the
// model asked for, and most documents in this repo (specs, plans) run 25-180 KB. Truncation
// here should be the rare exception, not the everyday path.
const MAX_BODY_SIZE = 102400 // 100 KB

// Overall serialization ceiling for graph_knoten_holen, checked AFTER body truncation.
// Set well above MAX_BODY_SIZE (100 KB body + 8 KB headroom for uid/path/title/frontmatter)
// so it only fires on pathological metadata bloat, never as the everyday path for an
// ordinary large body that truncateBody() already brought under control.
const MAX_NODE_JSON_SIZE = MAX_BODY_SIZE + 8192 // 108 KB

// Overall serialization ceiling for the three list-returning tools (graph_suchen,
// graph_ausweiten, graph_abfragen). Their payload size scales with limit/depth, which are
// themselves bounded (1..100 / 1..5), but a run of long titles/rows can still exceed this.
const MAX_JSON_SIZE = 8192 // 8 KB

// Known safe error messages that can be passed through (allowlist); everything else is
// abstracted to "[Datenbankfehler]" to avoid leaking schema names (table/column/constraint).
// These two patterns are the actual messages the graph layer can throw and that reach
// fehlgeschlagen() through a tool's try/catch (verified by grep over
// src/main/graph/query.ts and src/main/graph/search.ts):
//   - "Template 'X' requires parameter 'Y'"          (many templates in query.ts)
//   - "Invalid edge_type: Z" / "Invalid edge_type for gate_structural_coverage: Z"
// The unknown-template message from graphQuery() itself ("Unknown query template ...") is
// NOT in this list: graph_abfragen pre-checks with isValidTemplate() before entering the
// try/catch, so that throw is unreachable from this tool and does not need an allowlist entry.
const SAFE_ERROR_PATTERNS = [
  /^Template '.+' requires parameter '.+'$/i,
  /^Invalid edge_type/i,
]

function isSafeError(msg: string): boolean {
  return SAFE_ERROR_PATTERNS.some(p => p.test(msg))
}

/**
 * Serialize a value to JSON text, guaranteed to remain valid JSON regardless of size.
 *
 * F1 (Critical, Fix-Runde 4): the previous implementation truncated the SERIALIZED STRING
 * at a fixed character count once it exceeded the limit. Cutting a string at an arbitrary
 * offset is never safe when you don't control where the cut falls — for a 40 KB body it
 * landed mid-string, well before the (never-reached) "[Rumpf gekürzt]" marker, and
 * JSON.parse failed with "Unterminated string in JSON at position 8192". Field-level
 * truncation (see truncateBody()) has to happen BEFORE this function runs, not after.
 *
 * Here, the rule is binary: if the fully-serialized text fits within maxSize, return it
 * whole. If it doesn't, do not slice it — replace the ENTIRE payload with a small,
 * well-formed object that reports the overrun instead of the data. This keeps "always valid
 * JSON" an unconditional guarantee. The cost is that an oversized result carries no partial
 * data on that call; the trade-off is deliberate over the alternative (truncating the
 * array/rows field and re-serializing), because the three list-returning tools have three
 * different shapes (SearchHit[], ExpandResult.neighbors, QueryResult.rows) and a single
 * shape-aware truncator would have to know all three — whereas a uniform "here's what
 * happened, narrow your request" message works for all of them and is honest about the
 * fact that the model is not seeing partial, arbitrarily-cut-off data.
 */
function serialisiereSicher(wert: unknown, maxSize: number, werkzeug: string): WerkzeugErgebnis {
  const txt = JSON.stringify(wert, null, 2)
  if (txt.length <= maxSize) {
    return { ok: true, quelle: 'lokal', inhalt: [{ art: 'text', text: txt }] }
  }
  const ersatz = {
    gekuerzt: true,
    werkzeug,
    hinweis:
      `Ergebnis von ${werkzeug} ueberschreitet ${maxSize} Zeichen (${txt.length} tatsaechlich) ` +
      'und wurde durch diese Meldung ersetzt, um gueltiges JSON zu garantieren. ' +
      'Bitte enger fassen (kleineres limit/depth oder praeziserer Suchbegriff/uid).',
  }
  return { ok: true, quelle: 'lokal', inhalt: [{ art: 'text', text: JSON.stringify(ersatz, null, 2) }] }
}

/**
 * Truncate the body field IN THE OBJECT, before serialisiereSicher() ever turns it into
 * text. This is what keeps the result valid JSON: the cut happens on a known field
 * boundary, with the marker appended as normal string content, not on the serialized
 * output where a cut can land anywhere (including mid-string).
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
  // NOTE: the full cause is NOT preserved anywhere once it fails isSafeError() here — it is
  // simply discarded. WerkzeugKontext (see werkzeuge.ts) carries no logging handle, so this
  // tool layer has no channel to record the original error for later inspection. That is a
  // real gap: an operator debugging "[Datenbankfehler]" reports has nothing to go on. Wiring
  // a log sink through WerkzeugKontext is future work (deliberately out of scope here — see
  // header comment on why the interface itself is not touched in this pass).
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
      return serialisiereSicher(graphSearch(ktx.graphDb, {
        query: eingabe.query,
        limit,
        ...(typeof eingabe.kind === 'string' ? { kind: eingabe.kind } : {}),
      } as Parameters<typeof graphSearch>[1]), MAX_JSON_SIZE, 'graph_suchen')
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
      return serialisiereSicher(gekuerzt ?? { gefunden: false, uid: eingabe.uid }, MAX_NODE_JSON_SIZE, 'graph_knoten_holen')
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
      return serialisiereSicher(graphExpand(ktx.graphDb, {
        uid: eingabe.uid,
        depth,
        ...(typeof eingabe.edge_type === 'string' ? { edge_type: eingabe.edge_type } : {}),
        ...(typeof eingabe.direction === 'string' ? { direction: eingabe.direction } : {}),
      } as Parameters<typeof graphExpand>[1]), MAX_JSON_SIZE, 'graph_ausweiten')
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
      return serialisiereSicher(graphQuery(ktx.graphDb, {
        template: eingabe.template,
        params: (eingabe.params as Record<string, unknown>) ?? {},
      }), MAX_JSON_SIZE, 'graph_abfragen')
    } catch (err) { return fehlgeschlagen('graph_abfragen', err) }
  },
}

export const GRAPH_WERKZEUGE: Werkzeug[] = [
  graphSuchen, graphKnotenHolen, graphAusweiten, graphAbfragen,
]
