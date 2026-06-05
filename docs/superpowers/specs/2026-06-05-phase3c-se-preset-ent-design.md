# Phase 3c Design Spec: SE Preset + ENT Delta

Stand: 2026-06-05
Sub-Projekt: 3c von 3 (Phase 3 Zerlegung — letztes)
Scope: 21 REQs (13 CK-P2 + 8 CK-ENT)

---

## Kontext

Phase 3a lieferte die Prozess-Engine (Gates, Handoff, Subsystem-Loop). Phase 3b den Kickoff-Wizard + GitHub-Integration. Phase 3c vervollstaendigt Phase 3 mit dem Systems-Engineer-Preset als Koordinations-Hub und der ENT-Delta-Pruefung.

934/934 Tests, 46 Test-Dateien, 201 REQs bisher implementiert.

## Abhaengigkeiten

- Preset-System (types.ts, schema.ts, capability-*.ts): done (P2)
- Graph Gate-System (gate_befund, gate_fuer, Query-Templates): done (3a)
- steuer_ueberblick Query: done (3a) — deckt P2-005 ab
- assemble-entity.ts, rolling-summary.ts: done (P2, teilweise)

## Deferred

| REQ | Grund |
|-----|-------|
| ENT-009, ENT-027 | NanoClaw-abhaengig |
| ENT-020, ENT-022, ENT-030 | Phase 4+, Niveau-C Drift-Monitoring |
| P2-005 | Already done in 3a (steuer_ueberblick) |

---

## 1. SE Preset Registration (P2-001, P2-013)

Neues Verzeichnis `src/main/preset/systems-engineer/`.

### se-preset.ts

```
SE_RAHMEN: PresetRahmen = {
  id: 'systems-engineer',
  name: 'Systems Engineer',
  rollenTyp: QuerliegenSE,
  phasenBindung: [],              // querliegend
  capabilityAnbindung: [se-core-identity, gate-urteil-guide, trigger-zeiger-format,
    steuer-ueberblick-tool, companion-memory-tools, handoff-logik-guide,
    rolling-summary, graph-navigation-advanced],
  graphAnbindung: { lesen: true, schreiben: true },  // wide read, full write
  personaVorgabe: 'cipher',       // P2-013
  runtime: 'claude-cli-tmux',
  model: 'heavy',
  capabilityNiveau: 'A',
  harnessBindung: '',
}
```

Registrierung in einem preset-registry (neues Modul oder Erweiterung von index.ts).

---

## 2. Gate-Urteil (P2-002)

### se-gate-urteil.ts

Zweistufiges Urteil pro Phase:
- **Strukturell:** Nutzt `gate_structural_coverage` aus 3a + `autoGateBefund`
- **Plausibilitaet:** Feld vorbereitet in GateBefundAttrs (null bis NanoClaw verfuegbar)
- **Gewichtung:** SE-Freitext im gate_befund-Knoten, erklaert warum so gewichtet
- **Constraint:** Kein Phase-Trigger ohne vorheriges Gate-Urteil (enforced in trigger-write)

```typescript
export async function seGateUrteil(
  graphDb: Database, phaseUid: string, gewichtung: string
): Promise<GateBefundAttrs>
```

---

## 3. Trigger-Mechanik (P2-003, P2-008, P2-014)

### Neuer Knotentyp: trigger

```typescript
interface TriggerAttrs {
  entitaets_id: string
  phasen_ziel: string
  subsystem: string
  input_quelle: string        // UID des Input-Uebergabedokuments
  erwarteter_output: string
  niveau: 'A' | 'B' | 'C'    // P2-008: Niveau des Konsumenten
  gate_befund_id: string | null
}
```

### Neuer Kantentyp: triggert

`trigger -> phase` — welche Phase wird angestossen.

### Trigger-Erzeugung (P2-008)

```typescript
export function createTrigger(
  graphDb: Database, attrs: TriggerAttrs
): string  // returns trigger node UID
```

Niveau-Auswahl ist Pflicht-Parameter. Niveau-C-Trigger max 300 Tokens.

### trigger_history Query (P2-014)

Chronologische Liste aller Trigger eines Projekts:
```sql
SELECT t.uid, t.erstellt, fm.entitaets_id, fm.phasen_ziel, fm.subsystem, fm.gate_befund_id
FROM node t
WHERE t.kind = 'trigger'
ORDER BY t.erstellt
```

---

## 4. SE Hierarchie (P2-004)

### Neue Kantentypen

- `teilprojekt_von` — SE-Session -> Haupt-SE-Session (Hierarchie)
- `uebergibt_an` — Teilprojekt-SE -> Haupt-SE (Abschluss-Uebergabe)
- `sammelt_ein` — Haupt-SE -> Teilprojekt-SE (Einsammel-Mechanik)

### se_hierarchy Query

```sql
-- Traversiert Haupt-SE -> Teilprojekt-SEs
SELECT child.uid, child.title, e.type
FROM node parent
JOIN edge e ON e.dst = parent.uid AND e.type = 'teilprojekt_von'
JOIN node child ON child.uid = e.src
WHERE parent.uid = ?
```

---

## 5. Handoff-Logik (P2-010)

SE als einziges Phasen-Scharnier:
- Kein phasen-uebergreifender Handoff ohne SE-Beteiligung
- Jeder Handoff ist im Graph dokumentiert (Trigger-Knoten oder Gate-Befund)
- Rueckweg via SE: CF-Befund -> SE liest -> SE triggert Architect erneut

Implementiert als Constraint-Check in `createTrigger()`: Trigger-Knoten verweist auf gate_befund_id.

### handoff_audit Query

```sql
-- Prueft ob jeder Phasen-Uebergang einen SE-Trigger hat
SELECT ph.uid, fm.name as phase_name,
  EXISTS (SELECT 1 FROM node t WHERE t.kind = 'trigger'
    AND json_extract(t.frontmatter, '$.phasen_ziel') = fm.name
  ) as has_trigger
FROM node ph
WHERE ph.kind = 'phase'
ORDER BY CAST(json_extract(ph.frontmatter, '$.position') AS INTEGER)
```

---

## 6. Graph-Zugriffs-Isolation (P2-012)

### access-profile.ts

```typescript
interface AccessProfile {
  read: 'wide' | 'phase-scoped'
  write: 'full' | 'phase-scoped'
  phasenScope?: string[]
}

function deriveProfile(rahmen: PresetRahmen): AccessProfile
function scopeQuery(sql: string, profile: AccessProfile): string
```

- SE: `{ read: 'wide', write: 'full' }` — liest alles, schreibt Gate-Befunde + Trigger
- Phasen-Entitaet: `{ read: 'phase-scoped', write: 'phase-scoped' }` — nur eigene Phase
- Verletzung wird geloggt (kein harter Block)

---

## 7. Rolling Summary Generalisierung (P2-006, ENT-012)

Verschiebe `src/main/preset/workshop/rolling-summary.ts` nach `src/main/preset/shared/rolling-summary.ts`.

Generalisiertes Interface:
```typescript
interface RollingSummaryConfig {
  pflicht: boolean          // true fuer SE (ab Niveau B), false fuer CF
  updateTriggers: string[]  // ['gate-urteil', 'trigger', 'session-ende']
  summaryFields: string[]   // ['offene_gates', 'aktive_straenge', 'letzter_trigger', ...]
}
```

SE-spezifisch: Update nach jedem Gate-Urteil und Trigger.

---

## 8. Capability-Pakete pro Niveau (P2-009, P2-011)

### se-capabilities.ts

| Niveau | Pakete | Loader |
|--------|--------|--------|
| A | 8 (alle) | SKILL.md Lazy-Loading |
| B | 6 (kein graph-navigation-advanced, kein steuer-ueberblick-tool) | Abschnitte |
| C | 1 (se-core-identity, max 500 Tokens) | Inline |

Niveau-C ist Bedienhilfe-Modus (P2-009): Kein Plausibilitaets-Gate, keine Rolling Summary, keine Skills.

---

## 9. Quereinstieg-Entscheidungen (P2-007)

Quereinstiegs-Entscheidung als `entscheidung`-Knoten im Graph:
```typescript
interface QuereinstiegAttrs extends EntscheidungAttrs {
  begruendung: string   // unter 200 Tokens, niveau-C-lesbar
  strang_uid: string
  ziel_phase: string
}
```

Query `quereinstieg_entscheidungen`: Alle Quereinstiege eines Projekts.

---

## 10. ENT: Persona-Separation (ENT-002, ENT-029)

### persona-loader.ts

```typescript
export function loadPersona(vorgabe: string): string | null
  // Liest aus src/main/preset/personas/{vorgabe}.md
  // Return null wenn nicht gefunden

export const PERSONA_DEFAULTS: Record<string, string> = {
  'systems-engineer': 'cipher',
  'architect': 'theaitetos',
  'workshop': 'cipher',
  // ...
}
```

`persona-defaults.json` als deklarative Datei (ENT-029).

Persona wird orthogonal zum Body in assemblierte CLAUDE.md injiziert — separater Abschnitt, nicht vermischt mit Body-Instruktionen.

---

## 11. ENT: Body-Form pro Niveau (ENT-005)

| Niveau | Body-Form |
|--------|-----------|
| A | CLAUDE.md mit Skills-Referenzen |
| B | CLAUDE.md komprimiert (keine SKILL.md-Referenzen) |
| C | Instruktionsdatei inline (max 2000 Tokens) |

`assembleBody(preset, niveau)` in `assemble-entity.ts` erweitern.

---

## 12. ENT: Capability Lint + Token Count (ENT-018, ENT-019)

### capability-lint.ts

```typescript
export function lintCapabilities(packages: CapabilityPackage[]): LintResult[]
  // ENT-018: Keine impliziten Abhaengigkeiten (jedes Paket standalone)

export function estimateTokens(content: string): number
  // Whitespace-Split * 1.3 (Heuristik)

export function warnOversizedPackages(packages: CapabilityPackage[]): Warning[]
  // ENT-019: > 10.000 Tokens Warnung
  // Niveau-C: > 500 Tokens Warnung
```

---

## 13. ENT: Validation + Permissions (ENT-021, ENT-025)

### validatePresetRahmen Erweiterung (ENT-025)

Prueft alle 4 Anbindungen:
1. graphAnbindung gesetzt
2. capabilityAnbindung nicht leer
3. personaVorgabe entweder leer oder gueltige Persona-Datei
4. runtime ist gueltiger Adapter-Name

### generatePermissions (ENT-021)

```typescript
export function generatePermissions(rahmen: PresetRahmen): SettingsFragment
  // Auf Niveau A: generiert .claude/settings.json Fragment mit erlaubten Tools
```

---

## 14. ENT Config/Doku (ENT-013, ENT-014, ENT-015, ENT-016)

Kein neuer Code — Text-Sektionen in Preset-Body-Templates:
- ENT-013: D-13 Hinweis-Satz in jedem Niveau-C Preset
- ENT-014: Sektion "Niveau-Bedienung vs. Entsprechung" in jedem Preset
- ENT-015: Granularitaets-Pflicht als Sektion
- ENT-016: Prueffrage-Checkpoint vor jedem Dispatch

Implementiert als Template-Strings in se-preset.ts und als shared Constants.

---

## Datei-Map

| Action | Datei |
|--------|-------|
| Create | `src/main/preset/systems-engineer/se-preset.ts` |
| Create | `src/main/preset/systems-engineer/se-gate-urteil.ts` |
| Create | `src/main/preset/systems-engineer/se-capabilities.ts` |
| Create | `src/main/preset/systems-engineer/se-trigger.ts` |
| Create | `src/main/preset/systems-engineer/index.ts` |
| Create | `src/main/preset/shared/rolling-summary.ts` (moved + generalized) |
| Create | `src/main/preset/shared/persona-loader.ts` |
| Create | `src/main/preset/shared/persona-defaults.json` |
| Create | `src/main/preset/capability-lint.ts` |
| Create | `src/main/graph/access-profile.ts` |
| Modify | `src/main/graph/node-types.ts` | +trigger Kind, +TriggerAttrs |
| Modify | `src/main/graph/edge-types.ts` | +triggert, +teilprojekt_von, +uebergibt_an, +sammelt_ein |
| Modify | `src/main/graph/query.ts` | +trigger_history, +se_hierarchy, +handoff_audit, +quereinstieg_entscheidungen |
| Modify | `src/main/preset/schema.ts` | +validatePresetRahmen Erweiterung |
| Modify | `src/main/session/assemble-entity.ts` | +assembleBody Niveau-Differenzierung |
| Create | `tests/se-preset.test.ts` |
| Create | `tests/se-gate-urteil.test.ts` |
| Create | `tests/se-trigger.test.ts` |
| Create | `tests/se-hierarchy.test.ts` |
| Create | `tests/access-profile.test.ts` |
| Create | `tests/rolling-summary-shared.test.ts` |
| Create | `tests/persona-loader.test.ts` |
| Create | `tests/capability-lint.test.ts` |
| Create | `tests/ent-validation.test.ts` |

---

## Wave-Plan

| Wave | Inhalt | REQs | Workers |
|------|--------|------|---------|
| 1 | Types + Edges (trigger, SE-Kanten) + SE Preset Registration | P2-001, 003, 013 | 2 |
| 2 | Gate-Urteil + Trigger Queries + History | P2-002, 008, 014 | 2 |
| 3 | SE Hierarchy + Graph Isolation + Handoff Audit | P2-004, 010, 012 | 2-3 |
| 4 | Rolling Summary + Capabilities + Niveau Config | P2-006, 007, 009, 011 | 2 |
| 5 | ENT: Persona + Body-Form + Lint + Validation | ENT-002, 005, 012, 018, 019, 021, 025, 029 | 3 |
| 6 | ENT Config/Doku + Hygiene | ENT-013, 014, 015, 016 | 1 |

Geschaetzter Test-Zuwachs: ~120-150 neue Tests.

---

## Akzeptanzkriterien

1. SE-Preset registriert und instanziierbar mit allen Rahmen-Feldern
2. Gate-Urteil mit getrennten strukturell/plausibilitaet Signalen
3. Trigger-Mechanik mit Niveau-Auswahl und Gate-Befund-Verweis
4. SE-Hierarchie (Haupt-SE + Teilprojekt-SEs) traversierbar
5. Graph-Zugriffs-Isolation loggt Verletzungen
6. Rolling Summary generalisiert fuer SE + Workshop
7. Persona orthogonal zum Body, Default-Matrix vorhanden
8. Capability-Lint warnt bei ueberdimensionierten Paketen
9. Bestehende 934 Tests bleiben gruen
