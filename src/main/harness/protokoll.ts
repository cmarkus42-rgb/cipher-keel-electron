/**
 * protokoll — the append-only event log, and the only place the harness touches SQLite.
 *
 * Its own file rather than a table in graph.db: CK-GRAPH-001 calls that database a derived
 * index, discardable and rebuildable from the vault. A log that a run is resumed from is the
 * opposite of a discardable derivation.
 *
 * The triggers are the enforcement, the test is only the proof. A guard test that greps the
 * source for UPDATE checks a spelling; a database that refuses one checks the thing.
 */

import Database from 'better-sqlite3'
import type { Ereignis, EreignisArt } from './ereignisse'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ereignisse (
  lauf_id  TEXT    NOT NULL,
  seq      INTEGER NOT NULL,
  ts       TEXT    NOT NULL,
  art      TEXT    NOT NULL,
  nutzlast TEXT    NOT NULL,
  PRIMARY KEY (lauf_id, seq)
);

CREATE TRIGGER IF NOT EXISTS ereignisse_kein_update BEFORE UPDATE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'Ereignisse sind append-only'); END;

CREATE TRIGGER IF NOT EXISTS ereignisse_kein_delete BEFORE DELETE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'Ereignisse sind append-only'); END;
`

export function oeffneHarnessDb(pfad: string, nativeBinding?: string): Database.Database {
  const db = nativeBinding
    ? new Database(pfad, { nativeBinding })
    : new Database(pfad)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function anhaengen(
  db: Database.Database,
  laufId: string,
  art: EreignisArt,
  nutzlast: Record<string, unknown>,
): Ereignis {
  const ts = new Date().toISOString()
  const text = JSON.stringify(nutzlast)
  // seq inside the transaction: better-sqlite3 is synchronous and the main process is
  // single-threaded, so nothing can interleave between the read and the write.
  const schreibe = db.transaction((): number => {
    const row = db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS naechste FROM ereignisse WHERE lauf_id = ?')
      .get(laufId) as { naechste: number }
    db.prepare(
      'INSERT INTO ereignisse (lauf_id, seq, ts, art, nutzlast) VALUES (?, ?, ?, ?, ?)',
    ).run(laufId, row.naechste, ts, art, text)
    return row.naechste
  })
  const seq = schreibe()
  return { laufId, seq, ts, art, nutzlast }
}

export function lesen(db: Database.Database, laufId: string): Ereignis[] {
  const rows = db
    .prepare('SELECT lauf_id, seq, ts, art, nutzlast FROM ereignisse WHERE lauf_id = ? ORDER BY seq')
    .all(laufId) as Array<{ lauf_id: string; seq: number; ts: string; art: string; nutzlast: string }>
  return rows.map(r => ({
    laufId: r.lauf_id,
    seq: r.seq,
    ts: r.ts,
    art: r.art as EreignisArt,
    nutzlast: JSON.parse(r.nutzlast) as Record<string, unknown>,
  }))
}

/** Runs in the order they began. The list is a projection too — there is no run table. */
export function laufIds(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT lauf_id, MIN(ts) AS beginn FROM ereignisse WHERE art = 'run.started' " +
      'GROUP BY lauf_id ORDER BY beginn, lauf_id',
    )
    .all() as Array<{ lauf_id: string }>
  return rows.map(r => r.lauf_id)
}
