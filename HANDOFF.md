# HANDOFF — cipher-keel-electron

## BT-1bc — MCP-Tools + Vault + Advanced Features (2026-06-05, abgeschlossen)

Worker: BT-1bc (aufbauend auf BT-1a)
Stand: 2026-06-05
Status: **abgeschlossen**

### Erledigte REQs

| REQ-ID | Titel | Phase |
|--------|-------|-------|
| CK-GRAPH-018 | graph_search (FTS5 + vec, RRF Score-Fusion) | A |
| CK-GRAPH-019 | graph_get_node (Vollknoten nachladen) | A |
| CK-GRAPH-020 | graph_expand (Nachbarschafts-Expansion, CTE) | A |
| CK-GRAPH-021 | graph_query (10 parametrisierte Templates) | A |
| CK-GRAPH-022 | graph_upsert_node (Wrapper) | A |
| CK-GRAPH-023 | graph_link (Wrapper) | A |
| CK-GRAPH-024 | graph_maintain (hygiene/konsolidierung/verdichtung) | A |
| CK-GRAPH-025 | Vault als Quelle — Frontmatter + Wikilinks | C |
| CK-GRAPH-026 | Inferierte Kanten in Vault zurueckschreiben | C |
| CK-GRAPH-027 | Summary-Knoten als Frontloading-Mechanismus | D |
| CK-GRAPH-029 | Atomares Vault-Schreiben (Temp + rename) | C |
| CK-GRAPH-030 | Inkrementeller Re-Index und voller Rebuild | C |
| CK-GRAPH-031 | Chunking + Embedding-Provider-Interface | D |
| CK-GRAPH-032 | Token-sparende Performance | A/D |
| CK-GRAPH-034 | Loesch-Semantik bei Vault-Datei-Loeschung | C |
| CK-GRAPH-035 | Herkunfts-Kette als traversierbare Graphstruktur | D |
| CK-GRAPH-036 | Rekursive CTEs fuer mehrstufige Traversierung | A |
| CK-GRAPH-037 | MCP-Server (7 Tools, JSON-RPC 2.0) | B |
| CK-GRAPH-040 | Traceability-Gates als informative Graph-Abfragen | D |
| CK-GRAPH-042 | Score-Fusion Volltext und Vektor (RRF) | A |
| CK-GRAPH-048 | Wartungs-Helper-Instanz-Schnittstelle (Interface) | D |
| CK-GRAPH-049 | Sandboxed lesender Query-Fallback mit Logging | A |
| CK-NFR-011 | Token-sparende Architektur (<2000 Tokens/10 Treffer) | A |

### Nicht im Scope (aufgeschoben)

- CK-GRAPH-033 — Reifizierte Kanten (soll, aufgeschoben)

### Neue Dateien

```
src/main/graph/
  search.ts         — graph_search, graph_get_node, graph_expand
  query.ts          — graph_query (10 Templates), graphSandboxedQuery
  maintain.ts       — graph_maintain (hygiene/konsolidierung/verdichtung)
  mcp-server.ts     — MCP-Server (JSON-RPC 2.0, 7 Tools)
  vault.ts          — Vault-Parser, atomares Schreiben, Re-Index, Loesch-Semantik
  chunking.ts       — Chunking, EmbeddingProvider, Summary-Knoten, Herkunfts-Kette

tests/graph/
  phase-f-mcp-tools.test.ts   — MCP-Tool-Funktionen (40 Tests)
  phase-g-mcp-server.test.ts  — MCP-Server JSON-RPC (16 Tests)
  phase-h-vault.test.ts       — Vault-Integration (28 Tests)
  phase-i-advanced.test.ts    — Advanced Features (24 Tests)
```

206 Tests gesamt (98 BT-1a + 108 BT-1bc), alle gruen. Keine neuen Dependencies.

### Architektur-Entscheidungen

- **Score-Fusion:** RRF mit k=60 (Cormack 2009). Degradiert graceful bei nur einem Signal.
- **Query-Templates:** 10 Templates inkl. herkunfts_kette, gate_coverage, reverse_trace.
- **Embedding-Provider:** Pluggable Interface. NoopEmbeddingProvider fuer Tests.
- **Vault-Parser:** Einfacher YAML-Parser (flat KV + Arrays). Wikilink-Regex.

### Bekannte Issues (BT-1bc)

1. **Embedding-Modell noch nicht gewaehlt** — NoopEmbeddingProvider liefert Null-Vektoren.
2. **Verdichtung deklarativ** — graph_maintain verdichtung identifiziert Kandidaten, erzeugt keinen Summary-Text (braucht Helper-Instanz, CK-GRAPH-048).
3. **Vault-Parser vereinfacht** — Kein voller YAML-Parser. Reicht fuer Vault-Frontmatter.
4. **Reifizierte Kanten aufgeschoben** — edge.props JSON-Feld nutzbar fuer leichtgewichtige Reifikation.

---

## BT-3d — Voice-Pipeline Phase A (2026-06-05, Phase A abgeschlossen, B+C offen)

Worker: BT-3d | Stand: 2026-06-05 | Context-Abbruch bei ~75%

### Erledigt: Phase A — Voice-Pipeline (Commit `ccc1fa6`)

**17 neue/geaenderte Dateien, 1874 LOC**

| Datei | Beschreibung | REQ |
|-------|-------------|-----|
| `src/main/voice/voice-manager.ts` | Orchestrator (STT + TTS + Router + State) | alle |
| `src/main/voice/voice-state.ts` | State-Machine (7 Zustaende) | CK-VOICE-001 |
| `src/main/voice/stt-engine.ts` | Whisper.cpp + Halluzinations-Filter | CK-VOICE-002 |
| `src/main/voice/stt-router.ts` | Local-only STT-Routing | CK-VOICE-002 |
| `src/main/voice/tts-engine.ts` | Abstract TTSEngine | CK-VOICE-003 |
| `src/main/voice/tts-piper.ts` | Piper via sherpa-onnx-node Worker | CK-VOICE-003 |
| `src/main/voice/tts-macos.ts` | macOS `say` Fallback | CK-VOICE-003 |
| `src/main/voice/voice-input-router.ts` | Voice-Commands + Grid-Nav + Scroll | CK-VOICE-004 |
| `src/main/voice/audio-utils.ts` | pcmToWav, concatenateWavs | — |
| `src/renderer/voice/vad-loader.ts` | Silero VAD (lokale Assets) | CK-VOICE-001 |
| `src/renderer/voice/barge-in-monitor.ts` | Amplitude-Barge-In | — |
| `src/renderer/hooks/useVoiceSession.ts` | React-Hook (Preact→React portiert) | — |
| `src/shared/ipc-channels.ts` | +17 Voice-Channels | CK-INF-009 |
| `src/preload.ts` | voice API exponiert | CK-NFR-004 |
| `src/main/main.ts` | Voice-IPC-Handler + deferred init | — |
| `src/main/config/config-store.ts` | +voice.enabled, +voice.piperVoice | CK-VOICE-009 |
| `src/renderer/components/SessionCell.tsx` | Voice-Dot im PaneHeader | CK-VOICE-008 |

Erfuellte REQs: CK-VOICE-001, 002, 003, 004, 008 + CK-NFR-006

### Offen: Phase B — Voice-Config + Degradation

- **CK-VOICE-009** (z.T. erledigt): `voice.enabled` Config existiert, main.ts prueft es. **Noch fehlend:** Voice-Dot "disabled" im Renderer, kein Mikrofon-Permission-Dialog
- **CK-VOICE-010** (z.T. erledigt): VoiceManager hat try/catch. **Noch fehlend:** getUserMedia rejection handling im Hook, Voice-Dot "unavailable"

Geschaetzter Restaufwand Phase B: ~30 Minuten

### Offen: Phase C — Notes-System

Komplett offen. Quellcode zum Portieren:

| Quelle (cipher-mux-electron) | Ziel | REQ |
|------|------|-----|
| `src/main/notes/note-manager.ts` | `src/main/notes/note-manager.ts` | CK-NOTES-001 |
| `src/main/notes/note-tagging.ts` | `src/main/notes/note-tagging.ts` | CK-NOTES-002 |
| `src/main/notes/tag-repository.ts` | `src/main/notes/tag-repository.ts` | CK-NOTES-002 |
| `src/main/notes/tag-index.ts` | `src/main/notes/tag-index.ts` | CK-NOTES-002 |
| `src/main/notes/note-watcher.ts` | `src/main/notes/note-watcher.ts` | — |
| `src/renderer/hooks/useNotes.ts` | `src/renderer/hooks/useNotes.ts` | — |
| (neu) | `src/renderer/components/NotesCell.tsx` | CK-NOTES-003 |

**Portierungs-Checkliste:**
1. Notes-IPC-Channels in `ipc-channels.ts` (analog zu Voice: ~12 Channels)
2. Notes-API in `preload.ts` (analog zu `voiceApi`)
3. Notes-IPC-Handler in `main.ts`
4. `preact/hooks` → `react`, `cipherMux` → `cipherKeel`
5. CodeMirror 6: `@codemirror/lang-markdown` etc. in package.json
6. ConfigStore: Ollama host/port falls Auto-Tagging Config gebraucht wird

### Bekannte Issues

1. **piper-worker.js fehlt:** Muss aus cipher-mux-electron portiert werden (`src/main/voice/piper-worker.js`)
2. **VAD-Assets fehlen:** `vad-assets/` (Silero ONNX + WASM) muss im Renderer-Build sein
3. **Native Module ABI:** `@fugood/whisper.node` + `sherpa-onnx-node` muessen fuer Electron-ABI gebaut werden
4. **Voice-Dot Pulse-Animation:** CSS `@keyframes pulse` referenziert aber nicht definiert
5. **Keine Runtime-Tests:** TypeScript kompiliert, aber manueller Mikrofon-Test steht aus

### Pflichtlektuere

1. Assignment: `wave-1/assignments/bt-3d-voice-notes.md`
2. CK-VOICE: `refinement/CK-VOICE.md` (009, 010)
3. CK-NOTES: `refinement/CK-NOTES.md` (001, 002, 003)
4. CK-NFR: `refinement/CK-NFR.md` (006, 010)

---

## BT-2b — NanoClawBridge + NanoClawChannelAdapter (2026-06-05, abgeschlossen)

cipher-keel-seitige NanoClaw-Integration: Bridge (Unix-Domain-Socket-Client,
JSON-Lines, Reconnect 3x exponential Backoff), NanoClawChannelAdapter (AgentAdapter-
Peer, Tier-2), IPC-Handler in main.ts. 32 neue Tests, 130 gesamt, alle gruen.
Detaillierter Bericht: `wave-1/bt-2b-handoff.md`

---

## BT-1a — Knowledge-Graph Foundation (2026-06-05, abgeschlossen)

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
