# Design Spec: Phase 5 — Stabilisierung

**Datum:** 2026-06-06
**Quellen:** `refinement/CK-PROC.md` (4 REQs), `refinement/CK-GH.md` (2 REQs), `refinement/CK-P3A.md` (1 REQ), `refinement/CK-NOTES.md` (3 REQs), `refinement/CK-UI.md` (3 REQs), Phase-4-Audit-Findings (2 Fixes)
**Projekt:** `<repo-root>/`
**Vorgaenger:** Phase 4 (Commit `11575e2`, 1329 Tests, 247 REQs)

---

## Scope

15 REQs + 2 Audit-Fixes in zwei Wellen:

| Wave | Worker | Tasks | Inhalt |
|------|--------|-------|--------|
| 1 | 1 seq + 1 par | T1-T8 | Audit-Fixes, PROC (4), GH (2) |
| 2 | 3 par | T9-T15 | Scaffolding (1), Notes (3), UI (3) |

**Separat (Phase 6):** CK-COST (13 REQs) + CK-UI-016..019 (4 REQs)

---

## Design-Entscheidungen

### DE-5: orchestrierung als formales PresetRahmen-Feld

Das Audit hat festgestellt, dass `orchestrierung` in der Spec definiert ist, aber nicht als formales Feld im `PresetRahmen` Interface existiert. Wird als optionales `boolean`-Feld ergaenzt. Default: `false`. Validation: wenn vorhanden, muss boolean sein. Bestehende Presets (SE, Workshop, Architect, CF) werden aktualisiert.

### DE-6: Plausibilitaets-Inferenz via NanoClaw-Bridge

PROC-006 nutzt die bestehende NanoClaw-Bridge (`src/main/nanoclaw/`) fuer lokale Inferenz via Ollama. Kein neuer Adapter — die Bridge existiert. Das Ergebnis wird im bestehenden `plausibilitaet`-Feld des `gate_befund`-Knotens gespeichert (`traegt` / `fraglich` / `null`). Optional deaktivierbar wenn kein lokales Modell verfuegbar.

### DE-7: Scaffolding als Modul, nicht als SKILL.md

CK-P3A-010 spezifiziert "eigenstaendiger Skill". In der aktuellen Architektur gibt es keine `skills/`-Infrastruktur fuer harness-uebergreifende Skills. Pragmatischer Ansatz: Scaffolding als TypeScript-Modul unter `src/main/skills/scaffolding.ts` das von Presets aufgerufen werden kann. SKILL.md-Referenz-Integration wenn die Skills-Infrastruktur in einer spaeteren Phase kommt.

### DE-8: Vault-Index als Note-Knoten

Der Vault-Index (`index.md`) wird als `note`-Knoten im Graph mit `notetyp: 'vault-index'` gespeichert. Er ist ueber die bestehende `vault_index`-Query abrufbar. Aktualisierung erfolgt event-getrieben (Note-Create/Delete) und via Dateisystem-Watcher fuer externe Aenderungen (Obsidian).

---

## Wave 1: Backend-Erweiterungen

### T1: Audit-Fix — project_uid Query-Parameter verdrahten

**Dateien:**
- Modify: `src/main/graph/query.ts`
- Test: `tests/graph/phase5-query-fixes.test.ts`

**Aenderung:** Die Queries `adr_list` und `architect_summary` akzeptieren `project_uid` als optionalen Parameter, nutzen ihn aber nicht. Fix: Wenn `project_uid` gesetzt, filtere ueber Edge-Join (`traegt_phase` oder `subsystem_von`) auf den Projekt-Scope. Bei Single-Project-KG (aktueller Stand) aendert sich das Verhalten nicht — der Filter greift nur wenn mehrere Projekte im Graph koexistieren.

### T2: Audit-Fix — orchestrierung in PresetRahmen

**Dateien:**
- Modify: `src/main/preset/schema.ts`
- Modify: `src/main/preset/types.ts` (re-export if needed)
- Modify: `src/main/preset/workshop/workshop-preset.ts`
- Modify: `src/main/preset/cyber-factory/cf-preset.ts`
- Test: `tests/phase5-orchestrierung.test.ts`

**Aenderung:** `PresetRahmen` Interface bekommt optionales Feld `orchestrierung?: boolean`. `validatePresetRahmen()` prueft: wenn vorhanden, muss boolean sein. Workshop-Preset und CF-Preset setzen `orchestrierung: true`. Architect und SE setzen es nicht (undefined = false).

### T3: PROC-017 — Release Management als Phase 8

**Dateien:**
- Modify: `src/main/graph/phase-contract.ts`
- Test: `tests/phase5-release-phase.test.ts`

**Aenderung:** Die Acht-Phasen-Kette enthaelt bereits alle 8 Phasen als `phase`-Knoten (`ideation`, `requirements`, `architecture`, `development`, `testing`, `fixing`, `audit`, `release`). Verifizieren dass `release` als Position 8 existiert und `phase_chain`-Query sie korrekt als letzte Phase liefert. Wenn `release`-Phase fehlt: als Knoten anlegen. Dokumentation des public-facing Charakters im Phase-Frontmatter.

### T4: PROC-015 — Fixing-Phase Workshop-Integration

**Dateien:**
- Create: `src/main/preset/workshop/workshop-fixing-dispatch.ts`
- Test: `tests/preset/workshop/workshop-fixing.test.ts`

**Aenderung:** Workshop-Preset bekommt Fixing-Dispatch-Logik: Wenn SE den Workshop mit `phase: fixing` triggert, dispatcht der Workshop Items nach Passung an verfuegbare Presets (Debugger-Preset als primaerer Empfaenger). Die Doppelrolle (Development-Orchestrator + Fixing-Orchestrator) wird im Workshop-Body dokumentiert.

Kernfunktion:
```
dispatchFixingItem(item, graphDb):
  → Klassifiziere Item (BUG / MFR / NRF)
  → BUG → Debugger-Preset dispatch
  → MFR/NRF → Development-Worker dispatch
  → Ergebnis als Graph-Knoten (routing_decision)
```

### T5: PROC-016 — Subsystem-Zyklus und Integration

**Dateien:**
- Create: `src/main/graph/subsystem-cycle.ts`
- Modify: `src/main/graph/query.ts` (+1 Query: `subsystem_cycle_status`)
- Test: `tests/graph/phase5-subsystem-cycle.test.ts`

**Aenderung:** Pro Subsystem-Strang ein Zyklus: Development → Testing → Fixing → Audit. Nach Zyklus-Abschluss: Subsystem-Integration, gefolgt von erneutem Testing → Fixing → Audit. Graph-Pattern: Phase-Knoten pro Subsystem mit `subsystem_von`-Kante + Zyklus-Status im Frontmatter.

Neue Query `subsystem_cycle_status`:
- Parameter: `subsystem_uid`
- Return: Aktuelle Zyklus-Phase, abgeschlossene Phasen, Integration-Status

### T6: PROC-006 — Plausibilitaets-Inferenz

**Dateien:**
- Create: `src/main/graph/plausibility-inference.ts`
- Test: `tests/graph/phase5-plausibility.test.ts`

**Aenderung:** Neues Modul das die NanoClaw-Bridge nutzt um eine lokale Inferenz (Ollama) durchzufuehren. Input: Anforderung-Knoten + Umsetzungs-Artefakt. Output: `traegt` oder `fraglich` als markierte Einschaetzung.

```typescript
inferPlausibility(bridge: NanoClawBridge, anforderung: string, umsetzung: string): Promise<'traegt' | 'fraglich'>
```

Ergebnis wird im `plausibilitaet`-Feld des `gate_befund`-Knotens gespeichert (Feld existiert bereits, war bisher immer `null`). Signal getrennt vom strukturellen Befund — nie verrechnet.

Optional deaktivierbar: wenn NanoClaw nicht verbunden oder kein Ollama-Provider konfiguriert, gibt die Funktion `null` zurueck.

### T7: GH-009 — GitHub MCP-Server Konfiguration

**Dateien:**
- Create: `src/main/github/github-mcp-config.ts`
- Test: `tests/github/phase5-mcp-config.test.ts`

**Aenderung:** Generator fuer `.mcp.json`-Eintraege. Konfiguriert `github/github-mcp-server` mit:
- `--toolset` Parameter (Default: `repos,pull_requests,issues`)
- Token als Env-Var `GITHUB_PERSONAL_ACCESS_TOKEN`
- Go-Binary-Pfad

```typescript
generateMcpEntry(options: { toolset?: string[], tokenEnvVar?: string }): McpServerEntry
writeMcpConfig(projectPath: string, entry: McpServerEntry): void
```

MCP-Server ist optional — Projekt arbeitet ohne ihn via gh-CLI (Schicht A+B).

### T8: GH-010 — Schenkel-2 GitHub-Zugriff

**Dateien:**
- Modify: `src/main/nanoclaw/bridge.ts` oder neues `src/main/nanoclaw/container-env.ts`
- Test: `tests/nanoclaw/phase5-github-env.test.ts`

**Aenderung:** NanoClaw Container-Start bekommt:
- `-e GITHUB_TOKEN=...` (Token aus Keychain/gh-CLI)
- `-v /path/to/project:/workspace/project` (Volume-Mount)

```typescript
buildContainerEnv(projectPath: string, githubToken?: string): ContainerEnvConfig
```

Kein lokaler MCP-Server im Container — direkter HTTPS-Zugriff auf GitHub-REST-API.

---

## Wave 2: Preset, Notes, UI

### T9: P3A-010 — Scaffolding Skill

**Dateien:**
- Create: `src/main/skills/scaffolding.ts`
- Test: `tests/skills/scaffolding.test.ts`

**Aenderung:** Eigenstaendiges Modul fuer Verzeichnisstruktur-Scaffolding:

```typescript
scaffoldProject(config: ScaffoldConfig): ScaffoldResult

interface ScaffoldConfig {
  projectPath: string
  subsystems: string[]     // Subsystem-Namen
  testFramework: string    // 'vitest' | 'jest' | 'none'
  language: string         // 'typescript' | 'python' | 'go'
}

interface ScaffoldResult {
  createdDirs: string[]
  createdFiles: string[]
}
```

Erstellt: `src/<subsystem>/`, `tests/<subsystem>/`, leere Testhuellen. Aufrufbar durch Architect (nach Zerlegung) und SE (bei Quereinstieg). Nicht Preset-intern — externer Skill.

### T10: NOTES-008 — Vault-Index als Einstiegspunkt

**Dateien:**
- Create: `src/main/notes/vault-index.ts`
- Test: `tests/notes/phase5-vault-index.test.ts`

**Aenderung:** Automatisch generiertes `index.md` im Vault-Root mit Wiki-Links zu allen Uebergabedokumenten:

```typescript
generateVaultIndex(graphDb: Database, vaultPath: string): void
```

- Query `vault_index` (existiert bereits) liefert alle note + uebergabedokument Knoten
- Generiert `index.md` mit `[[wiki-link]]`-Syntax
- Abgeloeste Dokumente markiert als `~~[[doc]]~~ (abgeloest)`
- `note`-Knoten im Graph mit `notetyp: 'vault-index'`
- Event-getrieben: wird bei Note-Create und Note-Delete automatisch aktualisiert

### T11: NOTES-009 — Inkrementeller Vault-Index via Watcher

**Dateien:**
- Create: `src/main/notes/vault-watcher.ts`
- Test: `tests/notes/phase5-vault-watcher.test.ts`

**Aenderung:** Dateisystem-Watcher auf das Vault-Verzeichnis:

```typescript
class VaultWatcher {
  constructor(vaultPath: string, onFileChanged: (event: VaultEvent) => void)
  start(): void
  stop(): void
}

type VaultEvent = { type: 'created' | 'changed' | 'deleted', path: string }
```

- Nutzt `fs.watch` (Node.js nativ, kein chokidar — Electron hat bereits einen File-Watcher)
- Debounce: 500ms (verhindert Mehrfach-Updates bei schnellem Speichern)
- Latenz-Anforderung: < 2s zwischen Dateiaenderung und Index-Update
- Kein Full-Rebuild — nur betroffene Eintraege aktualisieren

### T12: NOTES-013 — Obsidian-Vault-Kompatibilitaet

**Dateien:**
- Create: `src/main/notes/obsidian-compat.ts`
- Test: `tests/notes/phase5-obsidian-compat.test.ts`

**Aenderung:** Validierung und Sicherstellung der Obsidian-Kompatibilitaet:

```typescript
validateObsidianCompat(vaultPath: string): ObsidianCompatResult

interface ObsidianCompatResult {
  valid: boolean
  issues: ObsidianIssue[]
}
```

Prueft:
1. YAML-Frontmatter korrekt (kein invalid YAML)
2. Wiki-Links in `[[...]]`-Syntax (Obsidian-Standard)
3. Keine `.obsidian/`-Konflikte mit Vault-Struktur
4. Verzeichnisnamen Obsidian-kompatibel (keine Sonderzeichen die Obsidian nicht kann)

### T13: UI-030 — StatusBar Gesamt-Erweiterungen

**Dateien:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Test: `tests/renderer/phase5-statusbar.test.ts`

**Aenderung:** StatusBar erhaelt zusaetzliche Slots:
- Live Session-Count (aktualisiert sich bei Session-Create/Destroy)
- NanoClaw-Status-Indikator (connected/disconnected/connecting) mit Farbcoding

Bestehender Extension-Point im StatusBar (`Erweiterbar fuer NanoClaw-Status und Cost (Phase 5)`) wird genutzt.

### T14: UI-032 — Keep-Working-Restore

**Dateien:**
- Create: `src/main/session/session-persistence.ts`
- Modify: `src/renderer/index.tsx` (Restore-Logic beim App-Start)
- Test: `tests/session/phase5-persistence.test.ts`

**Aenderung:** Letzte Session-Konfiguration wird beim App-Close persistiert und beim naechsten Start wiederhergestellt:

```typescript
interface SessionSnapshot {
  sessions: { presetId: string, name: string, gridPosition: number }[]
  gridConfig: { cols: number, rows: number }
  activeProject: string
}

saveSessionSnapshot(snapshot: SessionSnapshot): void
loadSessionSnapshot(): SessionSnapshot | null
```

Speicherort: `~/.config/cipher-keel/session-snapshot.json`

### T15: UI-034 — Kanban-Vault-Konsistenz

**Dateien:**
- Modify: `src/main/kanban/` (sync logic)
- Test: `tests/kanban/phase5-vault-sync.test.ts`

**Aenderung:** Kanban-Items werden mit Graph-Knoten synchron gehalten:
- Neues Kanban-Item → Graph-Knoten erstellen (wenn Graph verfuegbar)
- Kanban-Item-Status-Aenderung → Graph-Knoten-Status aktualisieren
- Graph-Knoten geloescht → Kanban-Item als verwaist markieren

Keine bidirektionale Sync (Graph→Kanban) in v1 — nur Kanban→Graph.

---

## Kreuz-Abhaengigkeiten

| Von | Nach | Mechanismus |
|-----|------|-------------|
| T2 (orchestrierung) | T4 (Workshop-Fixing) | Workshop nutzt formales orchestrierung-Feld |
| T3 (Release-Phase) | T5 (Subsystem-Zyklus) | Zyklus endet vor Release-Phase |
| T5 (Subsystem-Zyklus) | T4 (Fixing-Dispatch) | Fixing-Phase im Zyklus nutzt Workshop-Dispatch |
| T10 (Vault-Index) | T11 (Watcher) | Watcher triggert Index-Update |
| T10 (Vault-Index) | T12 (Obsidian) | Index muss Obsidian-kompatibel sein |

Reihenfolge Wave 1 seq (T1→T2→T3→T4→T5→T6) respektiert alle PROC-Abhaengigkeiten.
Wave 2 ist intern abhaengig: T10 vor T11 (aber selber Worker).
T7/T8 (GH) sind komplett unabhaengig → parallel zu Wave 1 seq.

---

## Test-Strategie

### Wave 1 Tests
- **T1:** Query mit/ohne project_uid, Ergebnis-Filterung verifizieren
- **T2:** Schema-Validation mit/ohne orchestrierung, boolean-Pruefung
- **T3:** phase_chain Query liefert 8 Phasen in korrekter Reihenfolge mit release am Ende
- **T4:** Fixing-Item-Dispatch BUG→Debugger, MFR→Development
- **T5:** Subsystem-Zyklus Graph-Pattern: Dev→Test→Fix→Audit→Integration
- **T6:** Plausibilitaets-Inferenz mit Mock-Bridge (kein echtes Ollama im Test)
- **T7:** .mcp.json Generation mit korrektem Format
- **T8:** Container-Env mit GITHUB_TOKEN und Volume-Mount

### Wave 2 Tests
- **T9:** Scaffolding erstellt korrekte Verzeichnisse und Dateien
- **T10:** Vault-Index enthaelt alle Uebergabedokumente als Wiki-Links
- **T11:** Watcher erkennt Create/Change/Delete, Latenz < 2s
- **T12:** Obsidian-Kompatibilitaets-Pruefung: YAML, Wiki-Links, Verzeichnisse
- **T13:** StatusBar zeigt live Session-Count und NanoClaw-Status
- **T14:** Session-Snapshot speichern + laden
- **T15:** Kanban→Graph Sync bei Item-Create und Status-Change

### Geschaetzter Test-Umfang
- Wave 1: ~50-60 Tests
- Wave 2: ~40-50 Tests
- **Gesamt: ~90-110 neue Tests**

---

## Nicht im Scope

| Thema | Grund | Ziel |
|-------|-------|------|
| CK-COST (13 REQs) + CK-UI-016..019 | Eigene Phase (Cost-Sichtbarkeit) | Phase 6 |
| Cross-Runtime-Aggregation | Bewusst 2.0-Material (D5) | 2.0 |
| Companion-Rolle | Noch nicht ausdifferenziert | Spaeter |
| Release-Manager-Preset | 0.2+-Thema | 0.2 |
| Testing/Debugger-Presets | 0.2+-Thema | 0.2 |
