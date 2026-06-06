/**
 * writer.ts — Single-Writer-Queue with idempotent upsert, schema validation,
 *             and conflict detection.
 *
 * CK-GRAPH-028: All writes through a Single-Writer-Queue (serialized in Electron main).
 * CK-GRAPH-012: Idempotent creation via natural key.
 * CK-GRAPH-013: Schema conformity on the write path — errors name what's wrong.
 * CK-GRAPH-014: Conflict detection for entscheidung nodes.
 */

import type Database from 'better-sqlite3'
import { deterministicUlid, naturalKey as deriveNaturalKey } from './uid'
import {
  isValidKind,
  isValidStatus,
  isValidDokumentTyp,
  DOKUMENT_TYPEN,
  isValidFrageKnotenStatus,
  FRAGE_KNOTEN_STATUSES,
  REQUIRED_FRONTMATTER_FIELDS,
  type NodeKind,
  type NodeStatus
} from './node-types'
import {
  isValidEdgeType,
  isValidEdgeSource,
  deriveEdgeType,
  validateEdgeForPair,
  type EdgeType,
  type EdgeSource
} from './edge-types'

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class SchemaError extends Error {
  constructor(message: string) { super(message); this.name = 'SchemaError' }
}

export class ConflictError extends Error {
  public existingUid: string
  constructor(message: string, existingUid: string) {
    super(message)
    this.name = 'ConflictError'
    this.existingUid = existingUid
  }
}

// ---------------------------------------------------------------------------
// Write queue type (CK-GRAPH-028)
// ---------------------------------------------------------------------------

type QueuedOp = () => void

// ---------------------------------------------------------------------------
// Node upsert input
// ---------------------------------------------------------------------------

export interface UpsertNodeInput {
  kind: string
  title: string
  path?: string
  status?: string
  body?: string
  content_hash?: string
  frontmatter?: Record<string, unknown>
  // For natural key derivation
  url?: string           // github_repo
  session?: string       // anlass
  zeitpunkt?: string     // anlass
}

export interface UpsertNodeResult {
  uid: string
  created: boolean
}

// ---------------------------------------------------------------------------
// Edge link input
// ---------------------------------------------------------------------------

export interface LinkEdgeInput {
  src: string            // source node uid
  dst: string            // destination node uid
  type?: string          // edge type — if omitted, derived from pair
  source?: string        // wikilink | frontmatter | inferred
  props?: Record<string, unknown>
}

export interface LinkEdgeResult {
  id: number
  type: EdgeType
  created: boolean
}

// ---------------------------------------------------------------------------
// GraphWriter
// ---------------------------------------------------------------------------

export class GraphWriter {
  private db: Database.Database
  private writeQueue: QueuedOp[] = []
  private draining = false

  constructor(db: Database.Database) {
    this.db = db
  }

  private enqueue(op: QueuedOp): void {
    this.writeQueue.push(op)
    if (!this.draining) this.drain()
  }

  private drain(): void {
    this.draining = true
    try {
      while (this.writeQueue.length > 0) {
        const op = this.writeQueue.shift()!
        op()
      }
    } finally {
      this.draining = false
    }
  }

  /**
   * Idempotent node upsert (CK-GRAPH-012, CK-GRAPH-013, CK-GRAPH-014).
   *
   * 1. Validate kind and required fields (CK-GRAPH-013).
   * 2. Derive natural key and deterministic uid (CK-GRAPH-012, CK-GRAPH-044).
   * 3. Check for existing node with same natural key → return existing uid.
   * 4. For entscheidung: conflict detection (CK-GRAPH-014).
   * 5. Insert node.
   */
  upsertNode(input: UpsertNodeInput): UpsertNodeResult {
    // --- Schema validation (CK-GRAPH-013) ---
    if (!isValidKind(input.kind)) {
      throw new SchemaError(`Unknown node kind '${input.kind}'. Valid kinds: anforderung, entscheidung, artefakt, test, note, phase_subsystem, anlass, github_repo`)
    }

    if (!input.title || input.title.trim() === '') {
      throw new SchemaError(`Missing required field 'title' for kind '${input.kind}'`)
    }

    const kind = input.kind as NodeKind
    const status = (input.status ?? 'aktiv') as string
    if (!isValidStatus(status)) {
      throw new SchemaError(`Invalid status '${status}'. Valid: aktiv, abgeloest, verworfen`)
    }

    // Validate required frontmatter fields
    const fm = input.frontmatter ?? {}
    const required = REQUIRED_FRONTMATTER_FIELDS[kind]
    const missing = required.filter(f => !(f in fm) || fm[f] === undefined || fm[f] === '')
    if (missing.length > 0) {
      throw new SchemaError(`Missing required frontmatter fields for '${kind}': ${missing.join(', ')}`)
    }

    // Validate dokumentTyp value for uebergabedokument (CK-P1-001)
    if (kind === 'uebergabedokument') {
      const dokumentTyp = fm.dokumentTyp as string | undefined
      if (!dokumentTyp || !isValidDokumentTyp(dokumentTyp)) {
        throw new SchemaError(
          `Invalid dokumentTyp '${dokumentTyp}' for kind 'uebergabedokument'. ` +
          `Valid values: ${DOKUMENT_TYPEN.join(', ')}`
        )
      }
    }

    // Validate frage_knoten.status in frontmatter (offen | beantwortet)
    if (kind === 'frage_knoten') {
      const fkStatus = fm.status as string | undefined
      if (!fkStatus || !isValidFrageKnotenStatus(fkStatus)) {
        throw new SchemaError(
          `Invalid frage_knoten status '${fkStatus}' in frontmatter. ` +
          `Valid values: ${FRAGE_KNOTEN_STATUSES.join(', ')}`
        )
      }
    }

    // --- Natural key + deterministic uid (CK-GRAPH-012, CK-GRAPH-044) ---
    const nk = deriveNaturalKey(kind, {
      path: input.path,
      url: fm.url as string | undefined,
      session: fm.session as string ?? input.session,
      zeitpunkt: fm.zeitpunkt as string ?? input.zeitpunkt
    })
    const uid = deterministicUlid(nk)

    // --- Idempotent check ---
    let result!: UpsertNodeResult
    this.enqueue(() => {
      const existing = this.db.prepare('SELECT uid FROM node WHERE natural_key = ?').get(nk) as { uid: string } | undefined
      if (existing) {
        // Update mutable fields on re-upsert
        this.db.prepare(`
          UPDATE node SET title = ?, status = ?, frontmatter = ?, body = ?, content_hash = ?, path = ?, abgeloest = ?
          WHERE uid = ?
        `).run(
          input.title,
          status,
          JSON.stringify(fm),
          input.body ?? '',
          input.content_hash ?? '',
          input.path ?? null,
          status === 'abgeloest' ? new Date().toISOString() : null,
          existing.uid
        )
        // Sync FTS
        this.db.prepare('DELETE FROM node_fts WHERE uid = ?').run(existing.uid)
        this.db.prepare('INSERT INTO node_fts (uid, title, body) VALUES (?, ?, ?)').run(existing.uid, input.title, input.body ?? '')
        result = { uid: existing.uid, created: false }
        return
      }

      // --- Conflict detection for entscheidung (CK-GRAPH-014) ---
      if (kind === 'entscheidung') {
        this.checkEntscheidungConflict(input)
      }

      // --- Insert ---
      const now = new Date().toISOString()
      this.db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt, abgeloest, natural_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid, kind, input.path ?? null, input.title, status,
        JSON.stringify(fm), input.body ?? '', input.content_hash ?? '',
        now, null, nk
      )
      // Sync FTS
      this.db.prepare('INSERT INTO node_fts (uid, title, body) VALUES (?, ?, ?)').run(uid, input.title, input.body ?? '')
      result = { uid, created: true }
    })

    return result
  }

  /**
   * Create an edge between two nodes (CK-GRAPH-015, CK-GRAPH-017).
   *
   * If type is omitted, it's derived from the node-type pair.
   * Validates referential integrity and edge-type/pair conformity.
   */
  linkEdge(input: LinkEdgeInput): LinkEdgeResult {
    // --- Resolve node kinds ---
    const srcNode = this.db.prepare('SELECT uid, kind FROM node WHERE uid = ?').get(input.src) as { uid: string; kind: string } | undefined
    if (!srcNode) throw new SchemaError(`Source node '${input.src}' does not exist`)

    const dstNode = this.db.prepare('SELECT uid, kind FROM node WHERE uid = ?').get(input.dst) as { uid: string; kind: string } | undefined
    if (!dstNode) throw new SchemaError(`Destination node '${input.dst}' does not exist`)

    const srcKind = srcNode.kind as NodeKind
    const dstKind = dstNode.kind as NodeKind

    // --- Derive or validate edge type (CK-GRAPH-017) ---
    let edgeType: EdgeType
    if (input.type) {
      if (!isValidEdgeType(input.type)) {
        throw new SchemaError(`Unknown edge type '${input.type}'. Valid: ${['verweist_auf', 'verfeinert', 'begruendet', 'setzt_um', 'verifiziert', 'erzeugt_von', 'abgeloest_durch', 'phaseninput_fuer', 'behebt', 'referenziert', 'prueft'].join(', ')}`)
      }
      edgeType = input.type as EdgeType
      const validationErr = validateEdgeForPair(edgeType, srcKind, dstKind)
      if (validationErr) throw new SchemaError(validationErr)
    } else {
      edgeType = deriveEdgeType(srcKind, dstKind)
    }

    // --- Validate source ---
    const edgeSource = (input.source ?? 'frontmatter') as string
    if (!isValidEdgeSource(edgeSource)) {
      throw new SchemaError(`Invalid edge source '${edgeSource}'. Valid: wikilink, frontmatter, inferred`)
    }

    // --- Insert (idempotent via UNIQUE(src, dst, type)) ---
    let result!: LinkEdgeResult
    this.enqueue(() => {
      const existing = this.db.prepare(
        'SELECT id FROM edge WHERE src = ? AND dst = ? AND type = ?'
      ).get(input.src, input.dst, edgeType) as { id: number } | undefined

      if (existing) {
        result = { id: existing.id, type: edgeType, created: false }
        return
      }

      const now = new Date().toISOString()
      const info = this.db.prepare(`
        INSERT INTO edge (src, dst, type, source, props, erstellt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.src, input.dst, edgeType, edgeSource,
        JSON.stringify(input.props ?? {}), now
      )
      result = { id: Number(info.lastInsertRowid), type: edgeType, created: true }
    })

    return result
  }

  /**
   * Delete a node and all related edges, FTS entries, and vec_chunks.
   * All cleanup in a single transaction.
   */
  deleteNode(uid: string): { deleted: boolean } {
    let result!: { deleted: boolean }
    this.enqueue(() => {
      const existing = this.db.prepare('SELECT uid FROM node WHERE uid = ?').get(uid) as { uid: string } | undefined
      if (!existing) {
        result = { deleted: false }
        return
      }

      const tx = this.db.transaction(() => {
        // Remove edges where this node is src or dst
        this.db.prepare('DELETE FROM edge WHERE src = ? OR dst = ?').run(uid, uid)

        // Remove FTS entry (virtual table — wrap in try/catch)
        try {
          this.db.prepare('DELETE FROM node_fts WHERE uid = ?').run(uid)
        } catch { /* FTS table may not exist */ }

        // Remove vec_chunks (virtual table — wrap in try/catch)
        try {
          this.db.prepare('DELETE FROM vec_chunks WHERE node_uid = ?').run(uid)
        } catch { /* vec table may not exist */ }

        // Remove the node itself
        this.db.prepare('DELETE FROM node WHERE uid = ?').run(uid)
      })
      tx()

      result = { deleted: true }
    })
    return result
  }

  // ---------------------------------------------------------------------------
  // Conflict detection (CK-GRAPH-014)
  // ---------------------------------------------------------------------------

  /**
   * Check if an active entscheidung already exists for the same anforderung.
   * If so, throw ConflictError demanding an explicit abgeloest_durch edge.
   */
  private checkEntscheidungConflict(input: UpsertNodeInput): void {
    // Find anforderung that this entscheidung addresses.
    // Convention: frontmatter.anforderung_uid links to the target anforderung.
    const fm = input.frontmatter ?? {}
    const anforderungUid = fm.anforderung_uid as string | undefined
    if (!anforderungUid) return // No linked anforderung — no conflict possible

    // Find existing active entscheidung nodes that address the same anforderung
    const existing = this.db.prepare(`
      SELECT n.uid, n.title FROM node n
      JOIN edge e ON e.src = n.uid
      WHERE n.kind = 'entscheidung'
        AND n.status = 'aktiv'
        AND e.dst = ?
        AND e.type = 'begruendet'
    `).all(anforderungUid) as { uid: string; title: string }[]

    if (existing.length > 0) {
      const ex = existing[0]
      throw new ConflictError(
        `Active entscheidung '${ex.title}' (${ex.uid}) already exists for anforderung '${anforderungUid}'. ` +
        `Set status='abgeloest' on the old entscheidung and create an 'abgeloest_durch' edge, ` +
        `or use a different anforderung_uid.`,
        ex.uid
      )
    }
  }
}
