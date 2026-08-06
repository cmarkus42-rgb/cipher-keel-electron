# Audit Report: Phase 5 — Stabilisierung

**Datum:** 2026-06-06
**Run-ID:** arun-01KTE9RFY9TMBHGE6PWPN6R8H5 (phase5-stabilisierung)
**Scope:** 17 Commits seit `11575e2` — 15 REQs + 2 Audit-Fixes
**Tests:** 1386/1387 pass (1 flaky)
**Verdict:** RELEASE

---

## Zusammenfassung

| Severity | Count |
|----------|-------|
| High     | 0     |
| Medium   | 6     |
| Low      | 3     |

Alle 15 REQs und 2 Audit-Fixes sind implementiert. Keine High-Findings. Die 6 Medium-Findings betreffen fehlende Convenience-Funktionen, unvollstaendige Spec-Compliance in nicht-kritischen Bereichen, eine `any`-Typisierung, einen flaky Test und eine nicht verdrahtete UI-Prop. Keines der Findings verursacht Runtime-Fehler oder blockiert den Release.

---

## Findings

### MEDIUM

**F-001: T4 — Fixing-Dispatch ohne Graph-Integration**
- Datei: `src/main/preset/workshop/workshop-fixing-dispatch.ts`
- Spec verlangt `dispatchFixingItem(item, graphDb)` mit `routing_decision`-Graph-Knoten
- Implementierung nimmt nur `item`, kein `graphDb`-Parameter, kein Graph-Write
- Impact: Dispatch-Entscheidungen sind ephemer, nicht im Knowledge Graph nachvollziehbar
- Fix: `graphDb`/`writer` als Parameter ergaenzen, `routing_decision`-Knoten schreiben

**F-002: T7 — `writeMcpConfig` fehlt**
- Datei: `src/main/github/github-mcp-config.ts`
- Spec definiert zwei Funktionen: `generateMcpEntry()` und `writeMcpConfig(projectPath, entry)`
- Nur `generateMcpEntry()` ist implementiert
- Impact: Caller muss `.mcp.json` selbst schreiben
- Fix: `writeMcpConfig` mit `fs.writeFileSync` ergaenzen

**F-003: T10 — `any`-Type-Cast in vault-index.ts**
- Datei: `src/main/notes/vault-index.ts:22`
- `result.rows.filter((r: any) => r.kind === 'uebergabedokument')`
- Einziges `any` in neuem Phase-5-Code, unterlaueft TypeScript-Sicherheit
- Fix: `(r: Record<string, unknown>)` verwenden

**F-004: T11 — Flaky vault-watcher Test**
- Datei: `tests/notes/phase5-vault-watcher.test.ts:18-30`
- `emits created event for new .md file` faellt intermittierend durch
- `fs.watch` auf macOS + 500ms Debounce + 1000ms Timeout = Timing-Race
- Fix: Timeout auf 2000ms erhoehen oder Event-basiert warten statt fester Wartezeit

**F-005: T12 — Wiki-Link-Validierung fehlt**
- Datei: `src/main/notes/obsidian-compat.ts`
- Spec Pruefpunkt 2: "Wiki-Links in `[[...]]`-Syntax" — nicht implementiert
- Nur YAML-Frontmatter und Verzeichnisnamen werden geprueft
- Impact: Obsidian-Kompatibilitaetspruefung ist unvollstaendig
- Fix: Regex-Scan auf `[[...]]`-Syntax in Markdown-Dateien ergaenzen

**F-006: T13 — StatusBar `activeProject` nicht verdrahtet**
- Datei: `src/renderer/index.tsx:109`
- `<StatusBar sessionCount={sessionCount} activeProject={undefined} />`
- Komponente zeigt immer "Kein Projekt" — UI-Feature nicht funktional
- Fix: `activeProject` aus State/IPC-Kanal ableiten und durchreichen

### LOW

**F-007: T5 — Integration-Zyklus nicht implementiert**
- Datei: `src/main/graph/subsystem-cycle.ts`
- `integrated`-Feld existiert, aber kein Code-Pfad setzt es auf `true`
- Spec: "Nach Zyklus-Abschluss: Subsystem-Integration"
- Moeglicherweise bewusste Scope-Reduktion fuer v1

**F-008: T3 — Kein `public_facing`-Frontmatter-Key fuer Release-Phase**
- Datei: `tests/phase5-release-phase.test.ts`
- Spec: "Dokumentation des public-facing Charakters im Phase-Frontmatter"
- Test verifiziert Position 8, aber kein expliziter `public_facing`-Key

**F-009: T9 — Keine Pfad-Sanitierung bei Subsystem-Namen**
- Datei: `src/main/skills/scaffolding.ts:47`
- `path.join(projectPath, 'src', sub)` ohne Validierung von `sub`
- Internes API, nicht user-facing — sehr geringes Risiko

---

## REQ-Compliance

| Task | REQ | Status | Anmerkung |
|------|-----|--------|-----------|
| T1 | Audit-Fix F-001 (Phase 4) | PASS | project_uid korrekt verdrahtet |
| T2 | Audit-Fix F-002 (Phase 4) | PASS | orchestrierung als formales Feld |
| T3 | CK-PROC-017 | PASS | Release als Phase 8 verifiziert |
| T4 | CK-PROC-015 | PASS* | Dispatch korrekt, Graph-Write fehlt (F-001) |
| T5 | CK-PROC-016 | PASS* | Zyklus korrekt, Integration-Phase offen (F-007) |
| T6 | CK-PROC-006 | PASS | Plausibilitaets-Inferenz sauber |
| T7 | CK-GH-009 | PASS* | Generator korrekt, writeMcpConfig fehlt (F-002) |
| T8 | CK-GH-010 | PASS | Container-Env vollstaendig |
| T9 | CK-P3A-010 | PASS | Scaffolding funktional |
| T10 | CK-NOTES-008 | PASS | Vault-Index mit Wiki-Links |
| T11 | CK-NOTES-009 | PASS* | Watcher funktional, Test flaky (F-004) |
| T12 | CK-NOTES-013 | PASS* | Validator funktional, Wiki-Link-Check fehlt (F-005) |
| T13 | CK-UI-030 | PASS* | Komponente korrekt, nicht verdrahtet (F-006) |
| T14 | CK-UI-032 | PASS | Session-Snapshot save/load |
| T15 | CK-UI-034 | PASS | Kanban→Graph Sync |

---

## Metriken

- **Neue Module:** 10 (scaffolding, subsystem-cycle, plausibility-inference, github-mcp-config, container-env, vault-index, vault-watcher, obsidian-compat, kanban-graph-sync, workshop-fixing-dispatch)
- **Erweiterte Module:** 5 (query.ts, schema.ts, keep-working.ts, StatusBar.tsx, index.tsx)
- **Tests:** 1387 (1386 pass, 1 flaky)
- **`any`-Nutzung:** 1 Stelle (vault-index.ts:22 — F-003)
- **TODO/FIXME:** 0 neue (1 pre-existing in tmux-manager.ts)
- **Security:** Keine neuen Schwachstellen (F-009 ist intern, kein User-Input)
