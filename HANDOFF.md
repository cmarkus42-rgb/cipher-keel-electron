# HANDOFF — BT-1a Knowledge-Graph Foundation

Worker: BT-1a
Stand: 2026-06-05
Status: **abgeschlossen**

## Erledigte REQs

| REQ-ID | Titel | Phase |
|--------|-------|-------|
| CK-GRAPH-001 | SQLite-Datenbank als abgeleiteter Index | A |
| CK-GRAPH-002 | sqlite-vec fuer Vektor-Suche integrieren | A |
| CK-GRAPH-003 | Knotentyp anforderung mit Schema | B |
| CK-GRAPH-004 | Knotentyp entscheidung mit Schema | B |
| CK-GRAPH-005 | Knotentyp artefakt mit Schema | B |
| CK-GRAPH-006 | Knotentyp test mit Schema | B |
| CK-GRAPH-007 | Knotentyp note mit Schema | B |
| CK-GRAPH-008 | Knotentyp phase/subsystem mit Schema | B |
| CK-GRAPH-009 | Knotentyp anlass mit Provenienz-Feldern | B |
| CK-GRAPH-010 | github_repo-Knotentyp am Projekt-Root | B |
| CK-GRAPH-011 | Kern-Attribute fuer alle Knotentypen | A/B |
| CK-GRAPH-012 | Idempotente Erstanlage ueber natuerlichen Schluessel | D |
| CK-GRAPH-013 | Schema-Konformitaet auf dem Schreibpfad | D |
| CK-GRAPH-014 | Widerspruchs-Erkennung bei Entscheidungen | D |
| CK-GRAPH-015 | Kantenset mit 7 typisierten Kantentypen | C |
| CK-GRAPH-016 | Zeitmodell mit Status und abgeloest_durch | C |
| CK-GRAPH-017 | Kantentyp-Ableitung aus Knotenpaar | C |
| CK-GRAPH-028 | WAL-Modus und Single-Writer-Queue | A/D |
| CK-GRAPH-038 | Speicher-Schema mit drei Tabellengruppen | A |
| CK-GRAPH-039 | Keine separate semantische Extraktionsschicht (Negativ) | E |
| CK-GRAPH-041 | Erweiterbares Attribut-Schema je Knotentyp | B |
| CK-GRAPH-043 | FTS5-Volltextsuche | A |
| CK-GRAPH-044 | uid-Vergabe-Mechanismus (ULID, deterministisch) | A |
| CK-GRAPH-045 | Backend-Wechsel-Faehigkeit (Abstraktionsschicht) | E |
| CK-GRAPH-046 | Kanten-source-Enum (wikilink/frontmatter/inferred) | A/C |
| CK-GRAPH-047 | Graph ist kein Kommunikationskanal (Negativ) | E |

## Offene REQs (nicht im Scope BT-1a)

- CK-GRAPH-029 — Atomares Vault-Schreiben (BT-1bc)
- CK-GRAPH-030 — Inkrementeller Re-Index und voller Rebuild (BT-1bc)
- CK-GRAPH-031 — Chunking und lokales Embedding-Modell (BT-1bc)
- CK-GRAPH-032 — Token-sparende Performance / Progressive Disclosure
- CK-GRAPH-033..037, 040, 042, 048, 049 — MCP-Tools, Gates, Score-Fusion etc.

## Dateistruktur

```
src/main/graph/
  index.ts          — Barrel-Export (public API)
  db.ts             — SQLite-Setup: WAL, sqlite-vec, FTS5
  schema.ts         — CREATE TABLE: node, edge, vec_chunks, node_fts
  uid.ts            — Deterministischer ULID aus natuerlichem Schluessel
  node-types.ts     — 8 Knotentypen, Kern-Attribute, Schema-Registry
  edge-types.ts     — 7 Kantentypen, Paar-Ableitung, Source-Enum
  writer.ts         — Single-Writer-Queue, Upsert, Validierung, Konflikterkennung
  abstraction.ts    — GraphBackend-Interface, SQLite-Implementierung

tests/graph/
  phase-a.test.ts   — DB, Schema, ULID (21 Tests)
  phase-b.test.ts   — Knotentypen (16 Tests)
  phase-c.test.ts   — Kantentypen (20 Tests)
  phase-d.test.ts   — Schreibpfad (27 Tests)
  phase-e.test.ts   — Abstraktionsschicht, Integration (14 Tests)
```

98 Tests gesamt, alle gruen.

## Dependencies

| Package | Version | Lizenz | Zweck |
|---------|---------|--------|-------|
| better-sqlite3 | ^12.10.0 | MIT | SQLite-Zugriff |
| sqlite-vec | ^0.1.9 | MIT/Apache-2.0 | Vektor-Suche (vec0) |
| vitest | ^4.1.8 | MIT | Test-Runner (dev) |

Lizenz-Korridor CK-NFR-001 eingehalten.

## Bekannte Issues

1. **vec0 chunk_idx ist TEXT statt INTEGER** — sqlite-vec v0.1.9 hat einen Coercion-Bug bei INTEGER-Metadaten-Spalten mit JavaScript-Zahlen. Workaround: chunk_idx als TEXT. Wenn sqlite-vec >=1.0 das fixt, kann auf INTEGER zurueckgestellt werden.

2. **Embedding-Dimension hardcoded 384** — Platzhalter bis das lokale Embedding-Modell gewaehlt wird (CK-GRAPH-031). Aenderbar via `openGraphDb({ embeddingDim })`.

3. **Widerspruchs-Erkennung (CK-GRAPH-014) setzt Konvention voraus** — Entscheidung muss `anforderung_uid` im Frontmatter tragen UND eine `begruendet`-Kante existieren, damit der Conflict-Check greift. Ohne beides: kein Check. Das ist by design (kein LLM-Urteil), aber der nachfolgende Worker sollte sicherstellen, dass die MCP-Tools diese Konvention erzwingen.

4. **Kein Vault-Sync** — Bewusst ausserhalb Scope (BT-1bc). Die DB ist ein reiner In-Memory/File-Index ohne Dateisystem-Watcher.
