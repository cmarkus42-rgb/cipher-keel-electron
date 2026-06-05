/**
 * versioning.ts — Dokumenten-Versionierung fuer Testing-Fixing-Loops.
 *
 * CK-P1-006: Bei mehrfachen Testing-Fixing-Loops entstehen versionierte
 * Dokument-Knoten im Graph. abgeloest_durch-Kante verbindet Vorgaenger mit
 * Nachfolger. Adressat bleibt stabil ueber alle Generationen.
 */

import type Database from 'better-sqlite3'
import { freshUlid } from '../graph/uid'

// ---------------------------------------------------------------------------
// UebergabeDokument
// ---------------------------------------------------------------------------

export interface UebergabeDokument {
  /** ULID des Knoten-Eintrags im Knowledge Graph (M1). */
  'graph-knoten-id': string
  /** Einer der sieben kanonischen Dokumenttypen (CK-P1-001). */
  'dokument-typ': string
  /** Semantische Version im Format MAJOR.MINOR (z.B. "1.0", "1.1"). */
  version: string
  /** Empfaenger-Entitaet — bleibt stabil ueber alle Generationen (CK-P1-006). */
  adressat: string
  /** Lebenszyklus-Status des Dokuments. */
  status: 'entwurf' | 'freigegeben' | 'abgeloest'
  /** Graph-Knoten-ID des Vorgaengers (leer bei erstmaliger Anlage). */
  'vorgaenger-dokument'?: string
  /** Weitere Frontmatter-Felder. */
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Erhoet die Minor-Version um 1 (z.B. "1.0" → "1.1", "2.3" → "2.4").
 */
function bumpMinorVersion(version: string): string {
  const dotIndex = version.lastIndexOf('.')
  if (dotIndex === -1) return `${version}.1`
  const major = version.slice(0, dotIndex)
  const minor = parseInt(version.slice(dotIndex + 1), 10)
  return `${major}.${isNaN(minor) ? 1 : minor + 1}`
}

// ---------------------------------------------------------------------------
// createNextVersion
// ---------------------------------------------------------------------------

/**
 * Erzeugt eine neue Dokumentgeneration fuer einen Testing-Fixing-Loop.
 *
 * Regeln (CK-P1-006):
 *   - Neue graph-knoten-id (frische ULID)
 *   - Version um Minor erhoeht
 *   - vorgaenger-dokument verweist auf Vorgaenger-graph-knoten-id
 *   - adressat bleibt identisch
 *   - status startet als 'entwurf'
 *
 * Hinweis: Die abgeloest_durch-Kante im Graph muss separat per GraphWriter
 * angelegt werden (src=currentDoc['graph-knoten-id'], dst=neues Dokument).
 */
export function createNextVersion(currentDoc: UebergabeDokument): UebergabeDokument {
  return {
    ...currentDoc,
    'graph-knoten-id': freshUlid(),
    version: bumpMinorVersion(currentDoc.version),
    'vorgaenger-dokument': currentDoc['graph-knoten-id'],
    adressat: currentDoc.adressat,   // explizit stabil halten
    status: 'entwurf'
  }
}

// ---------------------------------------------------------------------------
// getVersionChain
// ---------------------------------------------------------------------------

/**
 * Traversiert die abgeloest_durch-Kanten im Graph vorwaerts und gibt die
 * geordnete Kette aller Knoten-IDs zurueck, beginnend bei dokumentId.
 *
 * Beispiel: getVersionChain(db, uid_v1_0) → [uid_v1_0, uid_v1_1]
 *
 * Die Traversal folgt ausschliesslich abgeloest_durch-Kanten (src → dst).
 * Zyklen werden durch ein Visited-Set verhindert.
 */
export function getVersionChain(graphDb: Database.Database, dokumentId: string): string[] {
  const chain: string[] = [dokumentId]
  const visited = new Set<string>([dokumentId])
  let current = dokumentId

  const stmt = graphDb.prepare(
    `SELECT dst FROM edge WHERE src = ? AND type = 'abgeloest_durch' LIMIT 1`
  )

  for (;;) {
    const row = stmt.get(current) as { dst: string } | undefined
    if (!row || visited.has(row.dst)) break
    chain.push(row.dst)
    visited.add(row.dst)
    current = row.dst
  }

  return chain
}
