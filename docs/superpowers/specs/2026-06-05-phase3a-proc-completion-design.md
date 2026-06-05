# Phase 3a Design Spec: PROC Completion + P1/INF

Stand: 2026-06-05
Sub-Projekt: 3a von 3 (Phase 3 Zerlegung)
Scope: 13 PROC-REQs + 5 P1/INF-REQs = 18 REQs

---

## Kontext

Phase 2 hat den Graph-Kern (BT-1), die 8-Phasen-Kette (PROC-001), den Phasen-Kontrakt (PROC-002), die phaseninput-Aufloesung (PROC-003) und die Runtime-Agnostik (PROC-013) implementiert. 768 Tests gruen, 33 Test-Dateien.

Phase 3a vervollstaendigt die Prozess-Engine als Fundament fuer den Systems Engineer (Sub-Projekt 3c) und die Phase-4-Arbeit (Architect/CF-Presets). Zusaetzlich werden 5 offene P1/INF-REQs aus dem Phase-2-Dogfooding adressiert.

## Abhaengigkeiten

- BT-1 (Knowledge Graph): done
- PROC-001/002/003/013: done
- Workshop-Preset (`src/main/preset/workshop/`): done
- P1-Module (`src/main/p1/`): done
- Notes-System (`src/main/notes/`): done

## Deferred (nicht in 3a)

| REQ | Grund |
|-----|-------|
| PROC-006 | Plausibilitaets-Inferenz braucht NanoClaw/BT-2 |
| PROC-015 | Fixing-Phase Workshop-Orchestrierung — Phase 4 |
| PROC-016 | Subsystem-Zyklus — Phase 4 |
| PROC-017 | Release Management — Phase 4 |

---

## 1. Gate-System (PROC-005, PROC-007, PROC-008, PROC-021)

### 1.1 Neuer Knotentyp: gate_befund

Erweiterung in `src/main/graph/node-types.ts`:

```typescript
// NODE_KINDS erweitern um 'gate_befund'

interface GateBefundAttrs {
  phase_uid: string
  strukturell: 'gruen' | 'rot' | 'teilweise'
  plausibilitaet: 'traegt' | 'fraglich' | null  // null = nicht ausgefuehrt
  gewichtung: string          // SE-Freitext
  gate_typ: string            // z.B. 'anforderung_coverage', 'test_coverage'
}
```

Felder in `REQUIRED_FRONTMATTER_FIELDS`: `['phase_uid', 'strukturell', 'gate_typ']`
Felder in `ALLOWED_FRONTMATTER_FIELDS`: `['phase_uid', 'strukturell', 'plausibilitaet', 'gewichtung', 'gate_typ']`

### 1.2 Neuer Kantentyp: gate_fuer

Erweiterung in `src/main/graph/edge-types.ts`:

- `gate_fuer` — gate_befund -> phase (welche Phase wird bewertet)
- Paar-Ableitung: `gate_befund->phase` = `gate_fuer`

### 1.3 Neue Query-Templates

Erweiterung in `src/main/graph/query.ts`:

**`gate_structural_coverage`** — Zaehlt typisierte Kanten fuer eine Phase.

```sql
SELECT
  ? as edge_type,
  COUNT(*) as total,
  SUM(CASE WHEN has_edge THEN 1 ELSE 0 END) as covered,
  SUM(CASE WHEN NOT has_edge THEN 1 ELSE 0 END) as uncovered
FROM (
  SELECT n.uid,
    EXISTS (
      SELECT 1 FROM edge e WHERE e.dst = n.uid AND e.type = ?
    ) as has_edge
  FROM node n
  JOIN edge e_phase ON e_phase.src = n.uid
    AND e_phase.type = 'traegt_phase'
    AND e_phase.dst = ?
  WHERE n.kind = 'anforderung' AND n.status = 'aktiv'
)
```

Params: `{ edge_type: EdgeType, phase_uid: string }`
Liefert: `{ edge_type, total, covered, uncovered }`

**`gate_befunde_fuer_phase`** — Alle GateBefund-Knoten einer Phase.

```sql
SELECT n.uid, n.frontmatter, n.erstellt
FROM node n
JOIN edge e ON e.src = n.uid AND e.type = 'gate_fuer' AND e.dst = ?
WHERE n.kind = 'gate_befund'
ORDER BY n.erstellt DESC
```

Params: `{ phase_uid: string }`
PROC-007: strukturell und plausibilitaet sind getrennte Felder, nie verrechnet.

**`gate_befunde_aggregiert`** — Ueber alle Phasen aggregiert.

```sql
SELECT
  ph.uid as phase_uid,
  json_extract(ph.frontmatter, '$.name') as phase_name,
  json_extract(ph.frontmatter, '$.position') as phase_position,
  gb.uid as befund_uid,
  json_extract(gb.frontmatter, '$.strukturell') as strukturell,
  json_extract(gb.frontmatter, '$.plausibilitaet') as plausibilitaet
FROM node ph
LEFT JOIN edge e ON e.type = 'gate_fuer' AND e.dst = ph.uid
LEFT JOIN node gb ON gb.uid = e.src AND gb.kind = 'gate_befund'
WHERE ph.kind = 'phase'
ORDER BY CAST(json_extract(ph.frontmatter, '$.position') AS INTEGER)
```

### 1.4 Nicht-Blockierung (PROC-008)

Architektonisch bereits gegeben: Kein Code blockiert Phasenuebergaenge. Gates sind informativ im phasenoutput. Verifiziert durch Constraint-Test:

```typescript
// test: Phase mit rotem Gate abschliessen — Uebergang muss moeglich sein
it('rotes Gate blockiert keinen Phasenuebergang', () => { ... })
```

### 1.5 Performance (PROC-021)

Neue Datei `tests/proc-performance.test.ts`:

- Benchmark mit 50-Knoten-Graph: strukturelle Gate-Abfrage < 500ms (Median ueber 10 Laeufe)
- Benchmark mit 500-Knoten-Graph: strukturelle Gate-Abfrage < 2s (Median ueber 10 Laeufe)
- Cache-Hit bei unveraendertem Graph < 10ms

Gate-Cache als optionales Modul `src/main/graph/gate-cache.ts`:
- In-Memory-Map `phase_uid + gate_typ -> QueryResult`
- Invalidierung bei jedem `graph_upsert_node` oder `graph_link` Call
- Cache-Hit prueft Invalidierungs-Counter

---

## 2. Skip-Profile (PROC-004)

### 2.1 PhaseAttrs Erweiterung

Erweiterung in `src/main/graph/node-types.ts`:

```typescript
interface PhaseAttrs {
  name: string
  position: number
  phase_status: PhaseStatus
  skip_profil?: {
    tiefe: 'voll' | 'minimal' | 'trivial-skip'
    begruendung: string | null
    markiert_von: string | null  // Entity-ID
  }
}
```

`ALLOWED_FRONTMATTER_FIELDS.phase` erweitern um `'skip_profil'`.

### 2.2 Neues Query-Template

**`phase_skip_status`** — Alle Phasen mit Skip-Profil.

```sql
SELECT
  uid, title,
  json_extract(frontmatter, '$.name') as name,
  json_extract(frontmatter, '$.position') as position,
  json_extract(frontmatter, '$.phase_status') as phase_status,
  json_extract(frontmatter, '$.skip_profil') as skip_profil
FROM node
WHERE kind = 'phase'
ORDER BY CAST(json_extract(frontmatter, '$.position') AS INTEGER)
```

### 2.3 Graph-Fakt-Persistenz

Skip-Status wird ueber normales `graph_upsert_node` auf dem Phase-Knoten geschrieben. Workshop-Pfad setzt Ideation, Requirements, Architektur als `tiefe: 'trivial-skip'`.

---

## 3. Graph-vermittelter Handoff (PROC-011)

### 3.1 Zwei-Akte-Protokoll

Formalisierung der existierenden Mechanik:

**Akt 1 — Schreiben (abgebende Phase):**
1. Phase schreibt Output-Artefakte als Knoten mit `phasenoutput: true` + `traegt_phase`-Kante zum Phase-Knoten
2. Phase erzeugt `anlass`-Knoten mit Frontmatter `{ zeitpunkt: ISO-8601, session: string, handoff_referenz: phase_uid }`
3. Phase setzt eigenen `phase_status` auf `'abgeschlossen'`

**Akt 2 — Lesen (aufnehmende Phase):**
1. `resolvePhaseInput()` (existiert) — findet phasenoutput-Artefakte des Vorgaengers
2. Phase prueft ob Anlass-Knoten existiert (Handoff wurde vollzogen)

### 3.2 Neues Query-Template

**`handoff_completeness`** — Prueft ob Vorgaenger-Phase Handoff vollzogen hat.

```sql
SELECT
  prev.uid as predecessor_uid,
  json_extract(prev.frontmatter, '$.name') as predecessor_name,
  json_extract(prev.frontmatter, '$.phase_status') as predecessor_status,
  (SELECT COUNT(*) FROM node n
   JOIN edge e ON e.src = n.uid AND e.type = 'traegt_phase' AND e.dst = prev.uid
   WHERE json_extract(n.frontmatter, '$.phasenoutput') = 1
  ) as artefakt_count,
  EXISTS (
    SELECT 1 FROM node a
    WHERE a.kind = 'anlass'
      AND json_extract(a.frontmatter, '$.handoff_referenz') = prev.uid
  ) as has_anlass
FROM node curr
JOIN edge e_next ON e_next.dst = curr.uid AND e_next.type = 'naechste_phase'
JOIN node prev ON prev.uid = e_next.src AND prev.kind = 'phase'
WHERE curr.kind = 'phase'
  AND json_extract(curr.frontmatter, '$.name') = ?
```

Params: `{ phase_name: string }`
Liefert: `{ predecessor_uid, predecessor_name, predecessor_status, artefakt_count, has_anlass }`

### 3.3 Keine neuen Kantentypen

`traegt_phase` + `erzeugt_von` decken das Handoff-Protokoll ab. Gate-Abfragen beziehen sich auf Graph-Fakten, nicht auf Dateipruefungen (M4-Nachtrag).

---

## 4. Subsystem-Loop + Quereinstieg (PROC-009, PROC-010)

### 4.1 Neue Kantentypen

Erweiterung in `src/main/graph/edge-types.ts`:

- `subsystem_von` — phase_subsystem -> phase_subsystem (Hierarchie: Kind -> Eltern)
- `haengt_ab_von` — phase_subsystem -> phase_subsystem (Bau-Reihenfolge, Architect setzt, CF konsumiert)

Paar-Ableitung:
- `phase_subsystem->phase_subsystem`: Nicht automatisch ableitbar (zwei moegliche Typen). Muss explizit gesetzt werden.

### 4.2 PhaseSubsystemAttrs Erweiterung

```typescript
interface PhaseSubsystemAttrs {
  ebene?: string
  scope?: string              // Kurzbeschreibung
  status?: 'offen' | 'in_arbeit' | 'abgeschlossen' | 'blocked'
  blocked_grund?: string      // nur wenn status === 'blocked'
}
```

`ALLOWED_FRONTMATTER_FIELDS.phase_subsystem` erweitern um `'scope', 'status', 'blocked_grund'`.

### 4.3 Neue Query-Templates

**`subsystem_list`** — Alle Subsysteme eines Projekts mit Status und Abhaengigkeiten.

```sql
SELECT
  n.uid, n.title,
  json_extract(n.frontmatter, '$.scope') as scope,
  json_extract(n.frontmatter, '$.status') as status,
  json_extract(n.frontmatter, '$.blocked_grund') as blocked_grund,
  (SELECT GROUP_CONCAT(e_dep.dst)
   FROM edge e_dep WHERE e_dep.src = n.uid AND e_dep.type = 'haengt_ab_von'
  ) as dependencies
FROM node n
WHERE n.kind = 'phase_subsystem'
ORDER BY n.erstellt
```

**`subsystem_dependencies`** — Topologische Sortierung via haengt_ab_von-Kanten.

```sql
WITH RECURSIVE topo(uid, title, depth) AS (
  -- Roots: subsystems with no incoming haengt_ab_von edges
  SELECT n.uid, n.title, 0
  FROM node n
  WHERE n.kind = 'phase_subsystem'
    AND NOT EXISTS (
      SELECT 1 FROM edge e WHERE e.dst = n.uid AND e.type = 'haengt_ab_von'
    )

  UNION ALL

  SELECT n.uid, n.title, t.depth + 1
  FROM topo t
  JOIN edge e ON e.dst = t.uid AND e.type = 'haengt_ab_von'
  JOIN node n ON n.uid = e.src AND n.kind = 'phase_subsystem'
  WHERE t.depth < 20
)
SELECT uid, title, depth FROM topo ORDER BY depth, uid
```

**`quereinstieg_eignung`** — PROC-010: Prueft ob der Graph die Artefakte traegt, die Phase X als phaseninput verlangt, fuer ein bestimmtes Subsystem.

```sql
SELECT
  ? as target_phase_name,
  ? as subsystem_uid,
  (SELECT COUNT(*) FROM node n
   JOIN edge e_phase ON e_phase.src = n.uid AND e_phase.type = 'traegt_phase'
   JOIN node ph ON ph.uid = e_phase.dst AND ph.kind = 'phase'
     AND json_extract(ph.frontmatter, '$.name') = ?
   WHERE json_extract(n.frontmatter, '$.phasenoutput') = 1
  ) as required_inputs,
  (SELECT COUNT(*) FROM node n
   JOIN edge e_sub ON e_sub.src = n.uid AND e_sub.type = 'traegt_phase'
   JOIN node sub ON sub.uid = e_sub.dst AND sub.uid = ?
   WHERE json_extract(n.frontmatter, '$.phasenoutput') = 1
  ) as available_inputs
```

Params: `{ target_phase: string, subsystem_uid: string }`
Wenn `available_inputs >= required_inputs`: Quereinstieg moeglich.

### 4.4 Quereinstieg-Markierung

Quereinstieg wird als `anlass`-Knoten dokumentiert mit `handoff_referenz: 'quereinstieg:' + phase_name`. Bewusst markierte Ausnahme im Graph, kein Default.

---

## 5. Steuer-Ueberblick (PROC-012)

### 5.1 Neues Query-Template

**`steuer_ueberblick`** — Aggregiert ueber alle Straenge.

```sql
SELECT
  sub.uid as subsystem_uid,
  sub.title as subsystem_name,
  json_extract(sub.frontmatter, '$.status') as subsystem_status,
  ph.uid as phase_uid,
  json_extract(ph.frontmatter, '$.name') as phase_name,
  json_extract(ph.frontmatter, '$.position') as phase_position,
  json_extract(ph.frontmatter, '$.phase_status') as phase_status,
  gb_latest.strukturell,
  gb_latest.plausibilitaet
FROM node sub
LEFT JOIN edge e_tp ON e_tp.src = sub.uid AND e_tp.type = 'traegt_phase'
LEFT JOIN node ph ON ph.uid = e_tp.dst AND ph.kind = 'phase'
LEFT JOIN (
  SELECT
    e_gf.dst as phase_uid,
    json_extract(gb.frontmatter, '$.strukturell') as strukturell,
    json_extract(gb.frontmatter, '$.plausibilitaet') as plausibilitaet,
    ROW_NUMBER() OVER (PARTITION BY e_gf.dst ORDER BY gb.erstellt DESC) as rn
  FROM node gb
  JOIN edge e_gf ON e_gf.src = gb.uid AND e_gf.type = 'gate_fuer'
  WHERE gb.kind = 'gate_befund'
) gb_latest ON gb_latest.phase_uid = ph.uid AND gb_latest.rn = 1
WHERE sub.kind = 'phase_subsystem'
ORDER BY json_extract(sub.frontmatter, '$.status'),
         CAST(json_extract(ph.frontmatter, '$.position') AS INTEGER)
```

M4 definiert *was* (diese Query), M3 definiert *wie* (UI in Phase 5). Kern-Aussage unter 500 Tokens (AK).

---

## 6. Adoption + Wirksamkeit (PROC-014, PROC-018, PROC-019, PROC-020)

### 6.1 Workshop-Kontrakt-Bindung (PROC-014)

Erweiterung in `src/main/preset/workshop/workshop-flow.ts`:

```typescript
export function toPhaseContracts(
  graphDb: Database.Database,
  projectUid: string
): PhaseContract[] {
  // Mappe Workshop 6-Phasen-Flow auf M4 PhaseContracts
  // Ideation, Requirements, Architektur: skip_profil.tiefe = 'trivial-skip'
  // Development, Testing, Fixing: skip_profil.tiefe = 'voll' oder 'minimal'
}
```

Workshop-Preset ist erster Kontrakt-Traeger (schlanke Phase zuerst, CF zuletzt).

### 6.2 Validierung an beiden Polen (PROC-018)

Neue Datei `tests/proc-validation.test.ts`:

```typescript
describe('PROC-018: Kontrakt-Validierung an beiden Polen', () => {
  it('Workshop-Pfad: flacher Durchlauf mit Skip-Profilen', () => { ... })
  it('CF-Pfad: voller Durchlauf ohne Skip', () => { ... })
  it('Beide gegen denselben PhaseContract', () => { ... })
})
```

### 6.3 Session-Autarkie (PROC-019)

Test-Helper `assertPhaseAutarky()`:

```typescript
export async function assertPhaseAutarky(
  contract: PhaseContract,
  graphDb: Database.Database
): Promise<{ autark: boolean; prozess_rueckfragen: string[] }> {
  // 1. resolvePhaseInput — muss ohne Fehler aufloesen
  // 2. phasenoutput-Schema — muss beschrieben sein
  // 3. gate_typ — muss definiert sein
  // Ergebnis: autark = true wenn keine Prozess-Rueckfragen noetig
}
```

### 6.4 M2/M3-Spezifizierbarkeit (PROC-020)

Statischer Traceability-Check in `tests/proc-validation.test.ts`:

```typescript
describe('PROC-020: M2/M3 aus Phasenmodell spezifizierbar', () => {
  it('Jede Phase hat phaseninput-Definition', () => { ... })
  it('Jede Phase hat phasenoutput-Schema', () => { ... })
  it('Phasen-Reihenfolge ist abfragbar (M3-Zeitstrahl)', () => { ... })
  it('Preset-Zuordnung pro Phase moeglich (M2-Bauplan)', () => { ... })
})
```

Kein Runtime-Code — reine Verifikation.

---

## 7. P1-Vertiefung

### 7.1 Normalisierungsfunktion (P1-007)

`src/main/p1/normalizer.ts` existiert (`normalizeToP1Format`). Pruefung ob Refinement-Entity-Integration fehlt. Falls ja:
- Export erweitern fuer externe Aufrufer
- IPC-Channel `p1:normalize` in `ipc-handlers.ts` hinzufuegen
- Kein neuer Code wenn bereits vollstaendig

### 7.2 Wiki-Link-Rendering (P1-009)

Neuer Hook `src/renderer/hooks/useWikiLinks.ts`:

```typescript
export function useWikiLinks(body: string): WikiLink[] {
  // Parse [[...]] Syntax
  // Resolve gegen Graph (graph_search via IPC)
  // Return: Array<{ text: string, targetUid: string | null, resolved: boolean }>
}
```

Integration in `NotesCell.tsx`: Wiki-Links klickbar rendern. Klick navigiert zur Note. Unaufgeloeste Links als gestrichelt markiert.

### 7.3 Vault-Index (P1-010)

`src/main/notes/vault-structure.ts` existiert. Erweiterung:

- Pro-Projekt auto-aktualisierter Index als Graph-Abfrage (kein separater Knoten — der Graph IST der Index)
- `note-watcher.ts`: Bei Dateiaenderung Graph-Node aktualisieren
- Neues Query-Template `vault_index`:

```sql
SELECT n.uid, n.title, n.kind, n.status, n.path,
  json_extract(n.frontmatter, '$.notetyp') as notetyp
FROM node n
WHERE n.kind IN ('note', 'uebergabedokument')
ORDER BY n.erstellt DESC
```

### 7.4 Niveau-A Gate-Befund automatisch (P1-016)

Erweiterung in `src/main/graph/phase-contract.ts`:

```typescript
export async function autoGateBefund(
  graphDb: Database.Database,
  phaseUid: string,
  gateTyp: string
): Promise<GateBefundAttrs> {
  // 1. gate_structural_coverage Query ausfuehren
  // 2. Ergebnis als gate_befund-Knoten in Graph schreiben
  // 3. gate_fuer-Kante setzen
  // Return: GateBefundAttrs
}
```

Wird nach jedem phasenoutput-Write aufgerufen (Niveau A). Niveau B/C: manuell oder deaktiviert.

---

## 8. Keep-Working Restore (INF-017)

`src/main/session/keep-working.ts` existiert. Erweiterung:

### 8.1 Session-Layout Persistenz

```typescript
interface SessionLayout {
  sessions: Array<{
    sessionId: string
    tmuxSession: string
    gridPosition: { col: number; row: number }
    entityId: string | null
  }>
  grid: { cols: number; rows: number }
  savedAt: string  // ISO-8601
}

export function saveSessionLayout(layout: SessionLayout): void {
  // Schreibt nach ~/.config/cipher-keel/session-state.json
}

export function restoreSessionLayout(): SessionLayout | null {
  // Liest session-state.json
  // Prueft ob tmux-Sessions noch existieren (tmux list-sessions)
  // Filtert tote Sessions raus
  // Return: bereinigte Layout oder null
}
```

State in `~/.config/cipher-keel/session-state.json` — kurzlebiger Runtime-State, nicht im Graph.

---

## Wave-Vorschlag (fuer CF-Execution)

| Wave | REQs | Inhalt | Workers |
|------|------|--------|---------|
| 1 | PROC-004, 005, 007, 008, 011 | Gate-System + Skip + Handoff (Fundament) | 3-4 |
| 2 | PROC-009, 010, 012 | Subsystem-Loop + Quereinstieg + Steuer-Ueberblick | 2-3 |
| 3 | PROC-014, 018, 019, 020, 021 | Adoption + Wirksamkeit + Performance | 2-3 |
| 4 | P1-007, 009, 010, 016, INF-017 | P1-Vertiefung + Keep-Working | 2-3 |

Geschaetzter Test-Zuwachs: ~150-200 neue Tests.

---

## Akzeptanzkriterien (Gesamt)

1. Alle 13 PROC-REQs implementiert mit Tests
2. Alle 5 P1/INF-REQs implementiert mit Tests
3. Bestehende 768 Tests bleiben gruen
4. Gate-Performance-Benchmarks bestanden
5. Workshop-Pfad und CF-Pfad validiert gegen Kontrakt
6. Kein Schenkel-spezifischer Code im Kontrakt
