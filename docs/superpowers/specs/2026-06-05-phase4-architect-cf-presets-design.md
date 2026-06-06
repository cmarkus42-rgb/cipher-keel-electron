# Design Spec: Phase 4 — Architect + CF Presets

**Datum:** 2026-06-05
**Quellen:** `refinement/CK-P3A.md` (14 REQs), `refinement/CK-P3CF.md` (12 REQs)
**Projekt:** `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron/`
**Vorgaenger:** Phase 3 (Commit `08f8a03`, 1164 Tests, 222 REQs)

---

## Scope

25 REQs in drei Sub-Phasen:

| Sub-Phase | REQs | Inhalt |
|-----------|------|--------|
| 4a-infra | — | Graph-Erweiterungen, Query-Templates, deriveProfile-Override, Rolling-Summary-Configs |
| 4b-architect | 13 | CK-P3A-001 bis CK-P3A-009, CK-P3A-011 bis CK-P3A-014 |
| 4c-cf | 12 | CK-P3CF-001 bis CK-P3CF-012 |

**Deferred:** CK-P3A-010 (Scaffolding als eigenstaendiger Skill) → Phase 5.

---

## Design-Entscheidungen

### DE-1: Eigene NodeKinds statt Frontmatter-Spezialisierung

Neue Konzepte (ADR, Schnittstellen-Vertrag, Anforderungspaket, Frage/Antwort) werden als eigenstaendige NodeKinds implementiert, nicht als Frontmatter-Varianten bestehender Typen.

**Begruendung:** Template-basierte Queries (`nodes_by_kind`) sind atomar. Niveau-C-Worker (13B) brauchen eindeutige Typen. `offene_fragen` als Query ist ein Zweizeiler mit eigenen Kinds, ein Subquery-Monster mit Frontmatter-Filtern.

### DE-2: deriveProfile()-Override aus PresetRahmen

`access-profile.ts` prueft `rahmen.graphAnbindung` vor dem RollenTyp-Fallback. Kein neuer RollenTyp noetig — der Architect bleibt `PhasenEntitaet` mit explizitem `read: wide, write: full` aus dem Rahmen.

**Begruendung:** PresetRahmen traegt die Information bereits. Ein neuer RollenTyp waere Over-Engineering fuer einen einzelnen Anwendungsfall.

### DE-3: Drei Sub-Phasen (Infra → Architect → CF)

Striktes Sequenzieren: 4a-infra legt die gemeinsame Graph-Basis, 4b baut den Architect darauf, 4c baut die CF die Architect-Artefakte konsumiert.

**Begruendung:** Folgt dem Phase-3-Pattern (File-Ownership-Waves). Eliminiert Git-Konflikte in `node-types.ts`, `edge-types.ts`, `query.ts`. Jede Sub-Phase ist eigenstaendig testbar und audit-faehig.

### DE-4: Risk-Reviews als gate_befund mit gate_typ

Risk-Review-Knoten nutzen den bestehenden `gate_befund`-NodeKind mit `gate_typ: 'risk-review'`. Kein separater NodeKind.

**Begruendung:** Risk-Reviews sind strukturell Gate-Befunde mit erweitertem Frontmatter. Ein separater Kind wuerde die Query-Landschaft unnoetig fragmentieren.

---

## 4a-infra: Graph-Erweiterungen + Shared Infrastructure

### Neue NodeKinds (5)

#### `adr`

Architecture Decision Record. Traegt Tiefe-Stufen fuer Niveau-Bedienung.

| Frontmatter-Feld | Typ | Pflicht | Beschreibung |
|-------------------|-----|---------|-------------|
| `title` | string | ja | ADR-Titel |
| `context` | string | ja | Entscheidungs-Kontext |
| `options` | string | ja | Bewertete Optionen |
| `decision` | string | ja | Getroffene Entscheidung |
| `consequences` | string | ja | Konsequenzen |
| `tiefen` | object | ja | `{summary, context, alternatives, consequences}` — vorberechnete Tiefe-Stufen |
| `version` | number | ja | Versionsnummer, inkrementiert bei Update |

**Tiefe-Stufen-Zugriff:**
- `summary` (Niveau C): Title + Konsequenz, ≤500 Tokens
- `context` (Niveau B): Title + Kontext + Entscheidung + Konsequenz
- `full` (Niveau A): Alle Felder

#### `schnittstellen_vertrag`

Grenz-Kontrakt zwischen zwei Subsystemen.

| Frontmatter-Feld | Typ | Pflicht | Beschreibung |
|-------------------|-----|---------|-------------|
| `subsystem_a` | string | ja | UID des ersten Subsystems |
| `subsystem_b` | string | ja | UID des zweiten Subsystems |
| `input_schema` | string | ja | Input-Typen und Format |
| `output_schema` | string | ja | Output-Typen und Format |
| `fehlerverhalten` | string | ja | Fehlerfaelle und Reaktionen |
| `template_version` | string | ja | Version des verwendeten Templates |

**Validierung:** Template-Validator prueft Pflichtfelder bei Erstellung. Ivory-Tower-Check: Befund-Knoten wenn Zerlegung als unbaubar erkannt wird.

#### `anforderungspaket`

Granularer Worker-Input pro Subsystem.

| Frontmatter-Feld | Typ | Pflicht | Beschreibung |
|-------------------|-----|---------|-------------|
| `subsystem` | string | ja | UID des Subsystems |
| `req_ids` | string[] | ja | Zugeordnete REQ-IDs |
| `code_anker` | string[] | ja | Pfade, Funktions-Signaturen |
| `akzeptanzkriterium` | string | ja | Mindest-Akzeptanzkriterium |
| `testcase_verweis` | string | ja | Referenz auf Testcase |
| `niveau_c_extrakt` | string | nein | ≤1000 Tokens Niveau-C-Variante |

**Pruef-Frage:** "Kann ein Worker, der das Projekt noch nie gesehen hat, dieses Paket mit dem Paket-Text allein starten?" — dokumentiert im `anforderungspaket-formulierer`-Capability.

#### `frage_knoten`

Coaching-Frage von CF-Worker an Architect.

| Frontmatter-Feld | Typ | Pflicht | Beschreibung |
|-------------------|-----|---------|-------------|
| `subsystem` | string | ja | Betroffenes Subsystem |
| `frage` | string | ja | Die Frage |
| `worker_id` | string | ja | ID des fragenden Workers |
| `status` | enum | ja | `'offen'` oder `'beantwortet'` |

#### `antwort_knoten`

Coaching-Antwort vom Architect.

| Frontmatter-Feld | Typ | Pflicht | Beschreibung |
|-------------------|-----|---------|-------------|
| `frage_uid` | string | ja | UID des beantworteten frage_knoten |
| `antwort` | string | ja | Die Antwort |
| `architect_session` | string | ja | Session-ID des antwortenden Architect |

### Neue EdgeKinds (3)

| EdgeKind | Source-Kind | Dest-Kind | Pair-Derivation |
|----------|------------|-----------|-----------------|
| `schnittstellen_vertrag_fuer` | schnittstellen_vertrag | phase_subsystem | explizit (kein Pair-Default) |
| `adr_fuer` | adr | phase_subsystem | explizit |
| `beantwortet` | antwort_knoten | frage_knoten | explizit |

Alle drei EdgeKinds sind explizit — keine Pair-basierte Ableitung. Sie werden in `edge-types.ts` registriert und in `writer.ts` validiert.

### Neue Query-Templates (8)

| Template | Parameter | Return | Zweck |
|----------|-----------|--------|-------|
| `adr_list` | `project_uid?` | ADR-Knoten sortiert nach Version | ADR-Index fuer Uebergabe-Dokument |
| `adr_by_tiefe` | `adr_uid`, `tiefe` | Gefilterter ADR-Content | Niveau-gerechter ADR-Zugriff |
| `schnittstellen_vertraege` | `subsystem_uid?` | Vertrags-Knoten | Subsystem-Grenzen auflisten |
| `anforderungspakete` | `subsystem_uid?` | Paket-Knoten | CF-Input pro Subsystem |
| `offene_fragen` | `subsystem?` | frage_knoten mit status='offen' | Architect-Coaching-Queue |
| `coaching_historie` | `subsystem` | Frage+Antwort-Paare chronologisch | Kontext-Rekonstruktion |
| `architect_summary` | `project_uid` | Aggregiert: Subsystem-Status, ADR-Count, offene Fragen, Drift-Findings | Rolling-Summary-Input |
| `risk_reviews` | `welle?` | gate_befund-Knoten mit gate_typ='risk-review' | SE-Gate-Input |

### deriveProfile()-Override

`access-profile.ts` — Signatur-Erweiterung:

```typescript
// Vorher:
deriveProfile(rollenTyp: RollenTyp): AccessProfile

// Nachher:
deriveProfile(rollenTyp: RollenTyp, rahmen?: PresetRahmen): AccessProfile
```

Logik: Wenn `rahmen?.graphAnbindung` gesetzt ist, nutze `rahmen.graphAnbindung.lesen` und `rahmen.graphAnbindung.schreiben` direkt. Sonst Fallback auf RollenTyp-Default. Rueckwaerts-kompatibel (rahmen ist optional).

### Rolling-Summary-Config-Erweiterungen

Neue Configs in `rolling-summary.ts`:

```typescript
ARCHITECT_SUMMARY_CONFIG = {
  pflicht: true,
  updateTriggers: ['coaching-antwort', 'drift-befund', 'adr-update', 'welle-abschluss'],
  summaryFields: ['subsystem_status', 'aktive_adrs', 'offene_coaching', 'drift_findings']
}

CF_SUMMARY_CONFIG = {
  pflicht: false,
  autoActivateAfterWelle: 3,
  updateTriggers: ['welle-abschluss', 'risk-review', 'worker-rotation'],
  summaryFields: ['wellen_abgeschlossen', 'aktive_worker', 'blockierte_subsysteme', 'offene_fragen']
}
```

### Betroffene Dateien (4a-infra)

| Datei | Aenderung |
|-------|-----------|
| `src/main/graph/node-types.ts` | +5 NodeKinds, +Frontmatter-Typen |
| `src/main/graph/edge-types.ts` | +3 EdgeKinds |
| `src/main/graph/query.ts` | +8 Query-Templates |
| `src/main/graph/access-profile.ts` | deriveProfile Signatur-Erweiterung |
| `src/main/graph/writer.ts` | Frontmatter-Validierung fuer neue Kinds |
| `src/main/graph/schema.ts` | Keine Aenderung (NodeKinds sind Frontmatter, nicht Schema) |
| `src/main/preset/shared/rolling-summary.ts` | +ARCHITECT_SUMMARY_CONFIG, +CF_SUMMARY_CONFIG |
| `tests/` | Neue Tests fuer jeden NodeKind, EdgeKind, Query, Profile-Override |

---

## 4b-architect: Architect-Preset

### Preset-Registration

```typescript
PresetRahmen = {
  id: 'architect',
  name: 'Architect',
  rollenTyp: 'phasen-entitaet',
  phasenBindung: ['architecture'],
  graphAnbindung: { lesen: true, schreiben: true },  // Override: read wide, write full
  personaVorgabe: 'theaitetos',
  runtime: 'claude-cli-tmux',
  model: 'heavy',                        // Niveau A; 'standard' bei Niveau B
  capabilityNiveau: 'A',                  // default, konfigurierbar
  orchestrierung: false,
  harnessBindung: ''
}
```

### Capability-Pakete (7)

| Paket | Loader | A | B | C |
|-------|--------|---|---|---|
| `architect-core-identity` | inline | ja | ja | ja (≤400 Tok) |
| `subsystem-zerlegung-guide` | skill-md | ja | ja | — |
| `adr-format-guide` | skill-md | ja | ja (Kurzform ≤300 Tok) | — |
| `anforderungspaket-formulierer` | skill-md | ja | ja | — |
| `niveau-c-formulierer` | skill-md | ja | ja | — |
| `coaching-loop-guide` | skill-md | ja | — | — |
| `rolling-summary` | skill-md | ja | — | — |

Niveau C bekommt zusaetzlich `schnittstellen-stempel` als Inline-Extrakt innerhalb von `architect-core-identity` (zusammen ≤800 Tokens). Kein separates Paket.

### Niveau-B-Einschraenkungen (CK-P3A-014)

| Feld | Niveau A | Niveau B |
|------|----------|----------|
| `max_subsystems` | unbegrenzt | 3 |
| `model` | heavy (Opus) | standard (Sonnet) |
| `adr_format` | vollstaendig | Kurzform (≤300 Tokens) |
| `coaching_loop` | ja | nein |
| `rolling_summary` | ja | nein |

Bei `capabilityNiveau: B` werden `coaching-loop-guide` und `rolling-summary` nicht in die Capability-Liste aufgenommen. `max_subsystems: 3` als Constraint im Body und enforced im `subsystem-zerlegung-guide`.

### Niveau-C-Einschraenkung (CK-P3A-009)

Schnittstellen-Stempel-Modus:
- Ein Subsystem = das ganze System (keine echte Zerlegung)
- Ein Schnittstellen-Vertrag (Input/Output des Gesamtsystems)
- Ein Anforderungspaket
- Kein Coaching-Loop, keine ADRs
- Preset-Katalog zeigt Hinweis: "Bedienhilfe-Modus, nicht als vollwertige Architektur empfohlen"

### Negative Grenzen (CK-P3A-013)

Sektion `## Negative Grenzen` im `architect-body.md`:

1. **Kein produktiver Code.** Pseudocode und Schnittstellen-Signaturen erlaubt, implementierungsfertiger Code verboten.
2. **Keine Welle-Planung.** Bau-Logistik ist CF-Territorium.
3. **Keine Anforderungs-Schaerfung.** Anforderungen kommen aus Refinement, nicht vom Architect.

**Warning-Mechanik:** `capability-lint.ts` bekommt Regel `architect-boundary-check`. Prueft ob Architect-Session Dateien mit Code-Extensions (.ts, .tsx, .js, .py) schreibt. Bei Treffer: Warning als `gate_befund`-Knoten + Log. Informational, kein Hard-Block.

### Kernfunktionen

#### Subsystem-Zerlegung (CK-P3A-002)

- Erstellt `phase_subsystem`-Knoten (bestehender Kind) mit Zustaendigkeit im Frontmatter
- Erstellt `schnittstellen_vertrag`-Knoten an jeder Grenze + `schnittstellen_vertrag_fuer`-Kanten
- Template-Validator prueft Pflichtfelder (input_schema, output_schema, fehlerverhalten)
- Ivory-Tower-Check: `gate_befund`-Knoten mit `gate_typ: 'unbaubar'` wenn Zerlegung nicht traegt

#### ADR-Management (CK-P3A-003)

- `adr`-Knoten mit vorberechneten Tiefe-Stufen im Frontmatter
- Query `adr_by_tiefe(uid, 'summary')` liefert Title + Konsequenz ≤500 Tokens
- Version-Tracking: `version`-Feld inkrementiert bei Update
- Aktualisierbar ueber Wellen hinweg via `upsertNode` (gleiche natural_key)
- `adr_fuer`-Kante verbindet ADR mit Subsystem

#### Anforderungspakete (CK-P3A-004)

- `anforderungspaket`-Knoten pro Subsystem
- Niveau-C-Variante im `niveau_c_extrakt`-Feld (≤1000 Tokens)
- Pruef-Frage dokumentiert im `anforderungspaket-formulierer`-Capability

#### Coaching-Loop (CK-P3A-005, Architect-Seite)

- Architect pollt `offene_fragen`-Query
- Liest `frage_knoten`, schreibt `antwort_knoten` mit `beantwortet`-Kante
- Aktualisiert `frage_knoten.status` auf `'beantwortet'`
- Bei Drift-Erkennung: `gate_befund` mit `gate_typ: 'drift'` → SE wird informiert via Graph-Knoten

#### Abhaengigkeits-Kanten (CK-P3A-006)

- `haengt_ab_von`-Kanten (bestehender EdgeKind) zwischen `phase_subsystem`-Knoten
- CF konsumiert via `subsystem_dependencies`-Query (besteht bereits)
- Architect qualifiziert Zerlegung rueckwirkend und aktualisiert ADRs

#### Uebergabe an SE (CK-P3A-007)

- `uebergabedokument`-Knoten (bestehender Kind) mit `dokumentTyp: 'architect-handoff'`
- Pflicht-Sektionen: Subsystem-Ueberblick, ADR-Index, offene Punkte, Drift-Findings, Testing-Empfehlung
- Kein CF→SE-Uebergabe-Dokument am Phasen-Ende

#### Rolling Summary (CK-P3A-008)

- Pflicht ab Niveau B
- Nutzt shared `createSummaryNode()` / `loadLatestSummary()` mit `ARCHITECT_SUMMARY_CONFIG`
- Summary-Felder: subsystem_status, aktive_adrs, offene_coaching, drift_findings
- Update nach jedem Coaching-Austausch und jeder Drift-Erkennung

### Body-Form-Assembly

| Niveau | Body | Capabilities | Persona | Token-Cap |
|--------|------|-------------|---------|-----------|
| A | `architect-body.md` vollstaendig | 7 SKILL.md-Refs (lazy-load) | theaitetos.md | — |
| B | `architect-body.md` vollstaendig | 5 Pakete | theaitetos.md | — |
| C | `architect-body.md` truncated | 2 inline (≤800 Tok) | theaitetos.md | ≤2000 Tok |

### Neue Dateien (4b-architect)

| Datei | Inhalt |
|-------|--------|
| `src/main/preset/architect/architect-preset.ts` | Preset-Registration, Capability-Liste per Niveau |
| `src/main/preset/architect/architect-body.md` | Instruktions-Body |
| `src/main/preset/architect/architect-capabilities.ts` | CapabilityPackage-Definitionen |
| `src/main/preset/capability-lint.ts` | +`architect-boundary-check` Regel |
| `tests/preset/architect/` | Tests fuer Registration, Capabilities, Niveau, Boundaries |

### REQ-Mapping (4b-architect)

| REQ | Implementierung |
|-----|----------------|
| CK-P3A-001 | architect-preset.ts (Registration + Rahmen) |
| CK-P3A-002 | architect-body.md (Zerlegung) + schnittstellen_vertrag NodeKind (4a) |
| CK-P3A-003 | architect-body.md (ADR) + adr NodeKind (4a) + adr_by_tiefe Query (4a) |
| CK-P3A-004 | architect-capabilities.ts (anforderungspaket-formulierer) + anforderungspaket NodeKind (4a) |
| CK-P3A-005 | architect-body.md (Coaching) + frage/antwort NodeKinds (4a) + offene_fragen Query (4a) |
| CK-P3A-006 | architect-body.md (Abhaengigkeiten) + bestehende haengt_ab_von Kante |
| CK-P3A-007 | architect-body.md (Uebergabe) + bestehender uebergabedokument Kind |
| CK-P3A-008 | architect-capabilities.ts (rolling-summary) + ARCHITECT_SUMMARY_CONFIG (4a) |
| CK-P3A-009 | architect-preset.ts (Niveau C Reduktion) + architect-body.md (Hinweis) |
| CK-P3A-011 | architect-capabilities.ts (niveau-c-formulierer Paket) |
| CK-P3A-012 | architect-capabilities.ts (alle 7 Pakete + Niveau-Zuordnung) |
| CK-P3A-013 | architect-body.md (Negative Grenzen) + capability-lint.ts (Warning) |
| CK-P3A-014 | architect-preset.ts (Niveau B Config) |

---

## 4c-cf: Cyber Factory Preset

### Preset-Registration

```typescript
PresetRahmen = {
  id: 'cyber-factory',
  name: 'Cyber Factory',
  rollenTyp: 'phasen-entitaet',
  phasenBindung: ['development'],
  graphAnbindung: { lesen: true, schreiben: true },  // read full, write full
  personaVorgabe: 'cipher',
  runtime: 'claude-cli-tmux',
  model: 'standard',                     // Sonnet-Klasse
  capabilityNiveau: 'A',                  // default, konfigurierbar
  orchestrierung: true,                   // CF orchestriert Worker-Sessions
  harnessBindung: ''
}
```

### Capability-Pakete (8)

| Paket | Loader | A | B | C |
|-------|--------|---|---|---|
| `cf-core-identity` | inline | ja | ja | ja (≤500 Tok) |
| `welle-plan-guide` | skill-md | ja | ja | — |
| `worker-startup-protokoll` | skill-md | ja | ja | — |
| `model-routing-guide` | skill-md | ja | — | — |
| `risk-review-guide` | skill-md | ja | — | — |
| `welle-plan-granularisierer` | skill-md | ja | ja | — |
| `rueckweg-protokoll` | skill-md | ja | ja | — |
| `graph-navigation` | skill-md | ja | — | — |

### Niveau-Differenzierung

| | Niveau A | Niveau B | Niveau C |
|---|----------|----------|----------|
| Max Worker | 5 parallel | 2 parallel | 1 (self) |
| Model (CF selbst) | standard | standard | standard |
| Worker-Routing | light/standard/heavy | standard only | — |
| Capabilities | 8 | 5 | 1 |
| Rolling Summary | auto ab Welle 3 | auto ab Welle 3 | — |
| Risk-Review | nach jeder Welle | nach jeder Welle | — |
| Bezeichnung | Cyber Factory | Cyber Factory | Development-Worker-Modus |

### Niveau-C-Einschraenkung (CK-P3CF-008)

Development-Worker-Modus:
- Nur `cf-core-identity` inline (≤500 Tokens)
- Kein Multi-Session, kein Orchestrator, kein Welle-Plan
- CF ist selbst der einzige Worker
- Preset-Katalog zeigt Bezeichnung "Development-Worker-Modus" (nicht "Cyber Factory")

### Welle-Plan (CK-P3CF-002)

`cf-welle-plan.ts`:

1. Query `subsystem_dependencies` → Abhaengigkeits-Graph
2. Topologische Sortierung → Wellen-Schichten
3. Pro Schicht: Parallelisierbarkeit pruefen (keine gemeinsamen Kanten)
4. Worker-Kapazitaet anwenden (max_workers aus Niveau: A=5, B=2)
5. Pro Worker-Slot: Anforderungspaket-Verweis + Fertig-Schwellwert
6. Welle-Plan als Graph-Knoten ablegen (`note`-Kind mit `dokumentTyp: 'welle-plan'`)

Input: Architect-Zerlegung (Subsystem-Knoten + Abhaengigkeits-Kanten + Anforderungspakete).
Output: Geordnete Wellen mit Worker-Slots.
Invariante: CF nimmt Zerlegung als festen Input — keine Diskussion, keine Modifikation.

### Worker-Orchestrierung / Schenkel-1-Protokoll (CK-P3CF-003)

`cf-worker-orchestration.ts` — Portierung des cipher-mux-0.9.x-Protokolls:

1. `mux_create_session` (oder Electron-Equivalent)
2. Wait 8-10s
3. `tmux capture-pane` → Claude-Prompt sichtbar? Nein: Retry (max 3)
4. `tmux send-keys` mit Instruktion (Single-Quotes)
5. Wait 15s
6. `capture-pane` → Worker arbeitet? Paste-Check: `[Pasted text]` → extra Enter
7. Monitoring-Loop (alle 2min): capture-pane (Fortschritt/Blocker) + context_usage (>80% → rotieren) + Task-Status updaten

### Model-Routing (CK-P3CF-004)

`cf-model-routing.ts`:

| Subsystem-Komplexitaet | Niveau A Worker-Model | Niveau B |
|------------------------|-----------------------|----------|
| `trivial` | light (Haiku) | standard |
| `business_logic` | standard (Sonnet) | standard |
| `architecture` | heavy (Opus) | standard |

`komplexitaet` ist Frontmatter-Feld im `phase_subsystem`-Knoten, vom Architect gesetzt. Default: `business_logic`.

### Risk-Reviews (CK-P3CF-005)

`cf-risk-review.ts`:

Nach jeder abgeschlossenen Welle: `gate_befund`-Knoten mit `gate_typ: 'risk-review'`.

| Frontmatter-Feld | Typ | Beschreibung |
|-------------------|-----|-------------|
| `risiko` | string | Risiko-Beschreibung |
| `wahrscheinlichkeit` | enum | `'hoch'`, `'mittel'`, `'niedrig'` |
| `impact` | enum | `'hoch'`, `'mittel'`, `'niedrig'` |
| `massnahme` | string | Empfohlene Massnahme |
| `befund_statement` | string | ≤200 Tokens (Niveau-C-Bedienung) |

Query `risk_reviews` liefert alle Risk-Review-Knoten. SE liest sie beim naechsten Gate-Urteil.

### Rueckweg-Protokoll (CK-P3CF-006)

`cf-rueckweg.ts`:

1. `gate_befund`-Knoten schreiben: subsystem, bruchpunkt, schnittstelle, bau_implikation, `gate_typ: 'architektur-bruch'`
2. Subsystem-Knoten → Frontmatter: `blocked: true`
3. `uebergabedokument`-Knoten mit `dokumentTyp: 'rueckweg-befund'` → SE-Information
4. CF wartet auf SE-Entscheidung — kein Umbau auf eigene Faust
5. Andere unabhaengige Wellen laufen weiter

Formel: "Die Zerlegung ist Input, nicht Hypothese."

### Welle-Plan-Granularisierer (CK-P3CF-007)

Default-aktiviertes Capability-Paket auf Niveau A und B. Pro Worker-Slot ein Eintrag:

- Anforderungspaket-Verweis
- Vorgaenger-Welle
- Erwartete Tests
- Fertig-Kriterium
- ≤300 Tokens pro Eintrag

Pruef-Frage vor jedem Dispatch: "Kann ein Worker, der das Projekt noch nie gesehen hat, diesen Eintrag mit dem Text allein starten?"

### Graph-vermittelte Zusammenarbeit (CK-P3CF-009, CF-Seite)

1. Worker meldet Schnittstellen-Unklarheit an CF
2. CF schreibt `frage_knoten` (subsystem, frage, worker_id)
3. CF pollt `offene_fragen`-Query fuer Antworten
4. `antwort_knoten` gefunden → CF extrahiert Antwort
5. CF leitet Information an Worker weiter (tmux send-keys)

Kein direkter mux_send von CF an Architect. Alles graph-vermittelt.

### Negative Grenzen (CK-P3CF-011)

Sektion `## Negative Grenzen` im `cf-body.md`:

1. **Keine Architektur-Entscheidungen.** Schnittstellen-Vertraege, Subsystem-Grenzen, ADRs sind Architect-Territorium. Frage-Knoten stellen: ja. Vertraege aendern: nein.
2. **Kein Bugfixing.** Das ist Fixing-Phase-Territorium.
3. **Kein direkter Handoff an SE.** Der Architect uebergibt am Phasen-Ende, nicht die CF.

**Warning-Mechanik:** `capability-lint.ts` bekommt Regel `cf-boundary-check`. Prueft ob CF `schnittstellen_vertrag`-Knoten schreibt oder `adr`-Knoten modifiziert. Bei Treffer: Warning als `gate_befund` + Log.

### Rolling Summary (CK-P3CF-012)

- Wellen < 3: deaktiviert
- Wellen >= 3: automatisch aktiviert
- Manuell: jederzeit aktivierbar via Config-Flag
- Nutzt shared `createSummaryNode()` / `loadLatestSummary()` mit `CF_SUMMARY_CONFIG`
- Summary-Felder: wellen_abgeschlossen, aktive_worker, blockierte_subsysteme, offene_fragen

### Body-Form-Assembly

| Niveau | Body | Capabilities | Persona | Token-Cap |
|--------|------|-------------|---------|-----------|
| A | `cf-body.md` vollstaendig | 8 SKILL.md-Refs (lazy-load) | cipher.md | — |
| B | `cf-body.md` vollstaendig | 5 Pakete | cipher.md | — |
| C | `cf-body.md` truncated | 1 inline (≤500 Tok) | cipher.md | ≤2000 Tok |

### Neue Dateien (4c-cf)

| Datei | Inhalt |
|-------|--------|
| `src/main/preset/cyber-factory/cf-preset.ts` | Preset-Registration |
| `src/main/preset/cyber-factory/cf-body.md` | Instruktions-Body |
| `src/main/preset/cyber-factory/cf-capabilities.ts` | CapabilityPackage-Definitionen |
| `src/main/preset/cyber-factory/cf-welle-plan.ts` | Welle-Schnitt-Logik |
| `src/main/preset/cyber-factory/cf-model-routing.ts` | Model-Routing |
| `src/main/preset/cyber-factory/cf-worker-orchestration.ts` | Schenkel-1-Protokoll |
| `src/main/preset/cyber-factory/cf-risk-review.ts` | Risk-Review-Erzeugung |
| `src/main/preset/cyber-factory/cf-rueckweg.ts` | Rueckweg-Protokoll |
| `src/main/preset/capability-lint.ts` | +`cf-boundary-check` Regel |
| `tests/preset/cyber-factory/` | Tests fuer alle CF-Module |

### REQ-Mapping (4c-cf)

| REQ | Implementierung |
|-----|----------------|
| CK-P3CF-001 | cf-preset.ts (Registration + Rahmen) |
| CK-P3CF-002 | cf-welle-plan.ts + bestehende subsystem_dependencies Query |
| CK-P3CF-003 | cf-worker-orchestration.ts (Schenkel-1) |
| CK-P3CF-004 | cf-model-routing.ts + phase_subsystem.komplexitaet Frontmatter |
| CK-P3CF-005 | cf-risk-review.ts + bestehender gate_befund Kind |
| CK-P3CF-006 | cf-rueckweg.ts + bestehender uebergabedokument Kind |
| CK-P3CF-007 | cf-capabilities.ts (welle-plan-granularisierer Paket) |
| CK-P3CF-008 | cf-preset.ts (Niveau C Reduktion) + cf-body.md (Hinweis) |
| CK-P3CF-009 | cf-body.md (Coaching CF-Seite) + frage/antwort Kinds (4a) |
| CK-P3CF-010 | cf-capabilities.ts (alle 8 Pakete + Niveau-Zuordnung) |
| CK-P3CF-011 | cf-body.md (Negative Grenzen) + capability-lint.ts (Warning) |
| CK-P3CF-012 | cf-capabilities.ts (rolling-summary) + CF_SUMMARY_CONFIG (4a) |

---

## Kreuz-Abhaengigkeiten

| Von | Nach | Mechanismus |
|-----|------|-------------|
| 4a (NodeKinds) | 4b + 4c | Beide Presets nutzen die neuen Graph-Typen |
| 4a (Queries) | 4b + 4c | Beide Presets nutzen die neuen Query-Templates |
| 4a (deriveProfile) | 4b | Architect braucht Override fuer read-wide |
| 4b (Anforderungspakete) | 4c | CF konsumiert Architect-Output als festen Input |
| 4b (Abhaengigkeits-Kanten) | 4c | CF baut Welle-Plan darauf |
| 4b (Coaching Architect-Seite) | 4c | CF schreibt Fragen, Architect antwortet |
| 4b (Schnittstellen-Vertraege) | 4c | CF-Worker arbeiten gegen Vertraege |

Reihenfolge 4a → 4b → 4c respektiert alle Abhaengigkeiten.

---

## Test-Strategie

### 4a-infra Tests

- **NodeKind-Validierung:** Jeder neue Kind hat Pflicht-Frontmatter-Tests (fehlende Felder → SchemaError)
- **EdgeKind-Validierung:** Korrekte Source/Dest-Kinds, Duplikat-Erkennung
- **Query-Tests:** Jedes Template mit Setup-Daten, leere Ergebnisse, gefuellte Ergebnisse
- **deriveProfile:** Override-Logik + Fallback-Logik
- **Rolling-Summary-Configs:** Korrekte Felder, Auto-Aktivierung

### 4b-architect Tests

- **Preset-Registration:** Rahmen-Validierung, Instanziierung pro Niveau
- **Capability-Loading:** Pro Niveau korrekte Pakete, Token-Counts
- **Negative Grenzen:** Warning bei Code-Output, kein Warning bei Pseudocode
- **ADR-Tiefe-Stufen:** Query pro Tiefe, Token-Limit-Pruefung
- **Coaching-Loop:** Frage→Antwort→Status-Update Flow
- **Uebergabe-Dokument:** Pflicht-Sektionen vorhanden

### 4c-cf Tests

- **Preset-Registration:** Rahmen-Validierung, orchestrierung=true
- **Welle-Plan:** Topologische Sortierung korrekt, Kapazitaets-Limits
- **Worker-Orchestrierung:** Startup-Protokoll Schritte (Unit-testbar ohne tmux)
- **Model-Routing:** Korrekte Zuordnung per Komplexitaet und Niveau
- **Risk-Review:** Knoten-Erzeugung, Pflichtfelder, Token-Limit
- **Rueckweg:** Befund + Blocking + SE-Information Flow
- **Coaching CF-Seite:** Frage-Erstellung, Antwort-Polling, Worker-Weiterleitung
- **Negative Grenzen:** Warning bei Vertrags-Aenderung, kein Warning bei Frage-Knoten

### Geschaetzter Test-Umfang

- 4a-infra: ~40-50 Tests (Graph-Kern, viel Validierung)
- 4b-architect: ~50-60 Tests (Preset + Capabilities + Flows)
- 4c-cf: ~60-70 Tests (Preset + 6 Module + Flows)
- **Gesamt: ~150-180 neue Tests**

---

## Nicht im Scope

| Thema | Grund | Ziel |
|-------|-------|------|
| CK-P3A-010 Scaffolding-Skill | "soll" Prioritaet, braucht skills/-Infrastruktur | Phase 5 |
| Runtime-Integration (echte tmux-Sessions) | E2E braucht laufende Electron-App | Dogfooding |
| NanoClaw-Channel-Route | Abhaengig von NanoClaw-Implementierung | Phase 5+ |
| Persona theaitetos.md Inhalt | Persona-Text ist Content, nicht Code | Separat erstellbar |
