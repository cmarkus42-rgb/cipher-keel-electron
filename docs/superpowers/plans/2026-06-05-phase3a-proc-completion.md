# Phase 3a: PROC Completion + P1/INF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the M4 process engine (gates, skip profiles, handoff, subsystem loop, quereinstieg) and address 5 P1/INF REQs from Phase 2 dogfooding.

**Architecture:** Extends the existing graph layer (`src/main/graph/`) with new node/edge types, query templates, and a gate cache. No new modules — all additions are extensions of existing files. Workshop preset gets contract-binding. Keep-working gets session-layout persistence.

**Tech Stack:** TypeScript, better-sqlite3, Vitest, Electron IPC

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/main/graph/node-types.ts` | +gate_befund kind, +GateBefundAttrs, extend PhaseAttrs (skip_profil), extend PhaseSubsystemAttrs |
| Modify | `src/main/graph/edge-types.ts` | +gate_fuer, +subsystem_von, +haengt_ab_von edge types + derivation |
| Modify | `src/main/graph/query.ts` | +8 query templates |
| Create | `src/main/graph/gate-cache.ts` | Gate query cache with invalidation |
| Modify | `src/main/graph/phase-contract.ts` | +autoGateBefund(), handoff helpers |
| Modify | `src/main/preset/workshop/workshop-flow.ts` | +toPhaseContracts() |
| Modify | `src/main/session/keep-working.ts` | +SessionLayout save/restore |
| Modify | `src/main/ipc-handlers.ts` | +p1:normalize channel |
| Create | `src/renderer/hooks/useWikiLinks.ts` | Wiki-link parser + resolver |
| Create | `tests/gate-system.test.ts` | Gate types, queries, cache, non-blocking |
| Create | `tests/skip-profile.test.ts` | Skip profile CRUD + workshop skip |
| Create | `tests/handoff-protocol.test.ts` | Two-act handoff + completeness |
| Create | `tests/subsystem-loop.test.ts` | Subsystem edges, dependencies, quereinstieg |
| Create | `tests/steuer-ueberblick.test.ts` | Aggregating query |
| Create | `tests/proc-validation.test.ts` | Adoption, autarky, M2/M3 |
| Create | `tests/proc-performance.test.ts` | Gate query benchmarks |
| Create | `tests/wiki-links.test.ts` | Wiki-link parsing |

---

## Task 1: Gate-Befund Node Type + Edge Type

**Files:**
- Modify: `src/main/graph/node-types.ts`
- Modify: `src/main/graph/edge-types.ts`
- Test: `tests/gate-system.test.ts`

- [ ] **Step 1: Write failing tests for gate_befund node type and gate_fuer edge type**

Create `tests/gate-system.test.ts` with tests for:
- `gate_befund` is in NODE_KINDS and passes isValidKind
- `gate_befund` has required frontmatter fields: phase_uid, strukturell, gate_typ
- `gate_befund` has allowed frontmatter fields: phase_uid, strukturell, plausibilitaet, gewichtung, gate_typ
- `gate_fuer` is in EDGE_TYPES and passes isValidEdgeType
- `gate_befund->phase` derives `gate_fuer` via deriveEdgeType
- `gate_fuer` validates for gate_befund->phase pair
- `gate_fuer` rejects non-phase destination
- GateBefundAttrs has separate strukturell and plausibilitaet fields (PROC-007)
- plausibilitaet can be null (not executed)

```typescript
import { describe, it, expect } from 'vitest'
import {
  NODE_KINDS, isValidKind,
  REQUIRED_FRONTMATTER_FIELDS, ALLOWED_FRONTMATTER_FIELDS,
  type GateBefundAttrs
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES, isValidEdgeType, deriveEdgeType, validateEdgeForPair
} from '../src/main/graph/edge-types'

describe('gate_befund node type (PROC-005)', () => {
  it('gate_befund is a valid node kind', () => {
    expect(NODE_KINDS).toContain('gate_befund')
    expect(isValidKind('gate_befund')).toBe(true)
  })
  it('has required frontmatter fields', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS.gate_befund
    expect(req).toContain('phase_uid')
    expect(req).toContain('strukturell')
    expect(req).toContain('gate_typ')
  })
  it('has allowed frontmatter fields', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS.gate_befund
    expect(allowed).toContain('plausibilitaet')
    expect(allowed).toContain('gewichtung')
  })
})

describe('gate_fuer edge type (PROC-005)', () => {
  it('is a valid edge type', () => {
    expect(EDGE_TYPES).toContain('gate_fuer')
    expect(isValidEdgeType('gate_fuer')).toBe(true)
  })
  it('gate_befund->phase derives gate_fuer', () => {
    expect(deriveEdgeType('gate_befund', 'phase')).toBe('gate_fuer')
  })
  it('validates for gate_befund->phase', () => {
    expect(validateEdgeForPair('gate_fuer', 'gate_befund', 'phase')).toBeNull()
  })
  it('rejects non-phase destination', () => {
    expect(validateEdgeForPair('gate_fuer', 'gate_befund', 'anforderung')).not.toBeNull()
  })
})

describe('gate signals separate (PROC-007)', () => {
  it('strukturell and plausibilitaet are independent fields', () => {
    const befund: GateBefundAttrs = {
      phase_uid: 'uid', strukturell: 'gruen',
      plausibilitaet: null, gewichtung: '', gate_typ: 'coverage'
    }
    expect(befund.strukturell).toBe('gruen')
    expect(befund.plausibilitaet).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify FAIL** (`npx vitest run tests/gate-system.test.ts`)

- [ ] **Step 3: Implement gate_befund in node-types.ts**

Add `'gate_befund'` to `NODE_KINDS`. Add `GateBefundAttrs` interface. Add to `NodeAttrMap`, `REQUIRED_FRONTMATTER_FIELDS`, `ALLOWED_FRONTMATTER_FIELDS`.

- [ ] **Step 4: Implement gate_fuer in edge-types.ts**

Add `'gate_fuer'` to `EDGE_TYPES`. Add `'gate_befund->phase': 'gate_fuer'` to `PAIR_DERIVATION`. Add validation block for `gate_fuer` in `validateEdgeForPair`.

- [ ] **Step 5: Run tests, verify PASS**

- [ ] **Step 6: Run full suite, verify no regressions** (`npx vitest run`)

- [ ] **Step 7: Commit** — `feat(graph): add gate_befund node type and gate_fuer edge type (PROC-005, PROC-007)`

---

## Task 2: Gate Query Templates

**Files:**
- Modify: `src/main/graph/query.ts`
- Modify: `tests/gate-system.test.ts`

- [ ] **Step 1: Append tests to gate-system.test.ts**

Add tests using in-memory DB (pattern: `new Database(':memory:')` + `applySchema(db)`). Seed with phase, anforderungen bound via traegt_phase, artefakte with setzt_um edges. Test:
- `gate_structural_coverage` template registered and counts covered/uncovered
- `gate_befunde_fuer_phase` template registered
- `gate_befunde_aggregiert` template registered
- Phase can transition to abgeschlossen with rot gate (PROC-008 non-blocking)

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement 3 templates in query.ts**

Add `'gate_structural_coverage'`, `'gate_befunde_fuer_phase'`, `'gate_befunde_aggregiert'` to `QUERY_TEMPLATES`. Add switch cases. SQL from design spec Section 1.3.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(graph): add gate query templates (PROC-005, PROC-008)`

---

## Task 3: Skip Profiles

**Files:**
- Modify: `src/main/graph/node-types.ts`
- Modify: `src/main/graph/query.ts`
- Create: `tests/skip-profile.test.ts`

- [ ] **Step 1: Write tests** — skip_profil in ALLOWED_FRONTMATTER_FIELDS, PhaseAttrs accepts skip_profil, phase_skip_status template registered and returns phases with skip data

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Extend PhaseAttrs** with optional `skip_profil: { tiefe, begruendung, markiert_von }`. Add `'skip_profil'` to `ALLOWED_FRONTMATTER_FIELDS.phase`. Add `'phase_skip_status'` template to query.ts.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(graph): add skip profiles for phases (PROC-004)`

---

## Task 4: Handoff Protocol

**Files:**
- Modify: `src/main/graph/query.ts`
- Create: `tests/handoff-protocol.test.ts`

- [ ] **Step 1: Write tests** — handoff_completeness template registered, reports incomplete when no output, reports complete with artefakte + anlass

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement handoff_completeness template** in query.ts. SQL from design spec Section 3.2.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(graph): add handoff_completeness query (PROC-011)`

---

## Task 5: Subsystem Edge Types + Attrs

**Files:**
- Modify: `src/main/graph/node-types.ts`
- Modify: `src/main/graph/edge-types.ts`
- Create: `tests/subsystem-loop.test.ts`

- [ ] **Step 1: Write tests** — subsystem_von and haengt_ab_von valid edge types, validate for phase_subsystem->phase_subsystem, PhaseSubsystemAttrs accepts scope/status/blocked_grund

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement** — extend PhaseSubsystemAttrs, add edge types, add validation

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(graph): add subsystem edge types and extended attrs (PROC-009)`

---

## Task 6: Subsystem + Quereinstieg Queries

**Files:**
- Modify: `src/main/graph/query.ts`
- Modify: `tests/subsystem-loop.test.ts`

- [ ] **Step 1: Write tests** — subsystem_list, subsystem_dependencies (topological order), quereinstieg_eignung templates

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement 3 templates** in query.ts. SQL from design spec Section 4.3.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(graph): add subsystem and quereinstieg queries (PROC-009, PROC-010)`

---

## Task 7: Steuer-Ueberblick

**Files:**
- Modify: `src/main/graph/query.ts`
- Create: `tests/steuer-ueberblick.test.ts`

- [ ] **Step 1: Write tests** — template registered, aggregates subsystem status with phase and gate info

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement steuer_ueberblick template.** SQL from design spec Section 5.1.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit** — `feat(graph): add steuer_ueberblick aggregating query (PROC-012)`

---

## Task 8: Workshop Contract Binding + Validation

**Files:**
- Modify: `src/main/preset/workshop/workshop-flow.ts`
- Create: `tests/proc-validation.test.ts`

- [ ] **Step 1: Write tests** — toPhaseContracts returns 8 contracts, workshop skip phases marked trivial-skip, flat traversal completes, session autarky (PROC-019), M2/M3 spezifizierbar (PROC-020)

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement toPhaseContracts()** in workshop-flow.ts. Reads phase nodes, sets skip profiles, returns PhaseContract array.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(workshop): add contract binding with skip profiles (PROC-014, PROC-018, PROC-019, PROC-020)`

---

## Task 9: Gate Cache + Performance

**Files:**
- Create: `src/main/graph/gate-cache.ts`
- Create: `tests/proc-performance.test.ts`

- [ ] **Step 1: Write tests** — cache hit returns same result, invalidation clears cache, 50-node benchmark < 500ms, 500-node benchmark < 2s

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement GateCache** — Map-based, version counter, invalidate() bumps version

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit** — `feat(graph): add gate cache and performance benchmarks (PROC-021)`

---

## Task 10: P1 Normalizer IPC + Wiki-Links

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/shared/ipc-channels.ts`
- Create: `src/renderer/hooks/useWikiLinks.ts`
- Create: `tests/wiki-links.test.ts`

- [ ] **Step 1: Write wiki-link parser tests** — single link, multiple links, no links, incomplete links

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement parseWikiLinks** — regex `/\[\[([^\[\]]+?)\]\]/g`, returns `WikiLink[]` with text, start, end

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Add P1_NORMALIZE to ipc-channels.ts, add handler to ipc-handlers.ts**

- [ ] **Step 6: Run full suite**

- [ ] **Step 7: Commit** — `feat: add wiki-link parser and p1:normalize IPC (P1-007, P1-009)`

---

## Task 11: Vault Index + Auto Gate Befund

**Files:**
- Modify: `src/main/graph/query.ts`
- Modify: `src/main/graph/phase-contract.ts`
- Modify: `tests/gate-system.test.ts`

- [ ] **Step 1: Write tests** — vault_index template registered, autoGateBefund creates gate_befund node

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement vault_index template** in query.ts. Implement `autoGateBefund()` in phase-contract.ts — runs gate_structural_coverage, writes gate_befund node + gate_fuer edge.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(graph): add vault_index query and autoGateBefund (P1-010, P1-016)`

---

## Task 12: Keep-Working Session Layout

**Files:**
- Modify: `src/main/session/keep-working.ts`

- [ ] **Step 1: Write tests** — saveSessionLayout + restoreSessionLayout roundtrip, returns null for missing file

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement SessionLayout interface, saveSessionLayout, restoreSessionLayout** — JSON file persistence in session-layout.json

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(session): add session layout save/restore (INF-017)`

---

## Task 13: Final Verification

- [ ] **Step 1: Run full test suite** (`npx vitest run`) — expect 768 existing + ~150 new all PASS

- [ ] **Step 2: Run typecheck** (`npx tsc --noEmit`) — expect no errors

- [ ] **Step 3: Verify no regressions** in key test files: kanban, timeline, project-window, coupling

- [ ] **Step 4: Commit any loose changes**

---

## Wave Assignment for CF Execution

| Wave | Tasks | REQs | Est. Workers |
|------|-------|------|-------------|
| 1 | Task 1-4 | PROC-004/005/007/008/011 | 3-4 |
| 2 | Task 5-7 | PROC-009/010/012 | 2-3 |
| 3 | Task 8-9 | PROC-014/018/019/020/021 | 2 |
| 4 | Task 10-12 | P1-007/009/010/016, INF-017 | 2-3 |
| 5 | Task 13 | Integration verification | 1 |
