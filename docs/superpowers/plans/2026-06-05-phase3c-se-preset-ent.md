# Phase 3c: SE Preset + ENT Delta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Systems Engineer preset as coordination hub and address ENT delta (persona, capability lint, body-form, validation).

**Architecture:** New `src/main/preset/systems-engineer/` module, new shared modules (rolling-summary, persona-loader, capability-lint), graph extensions (trigger node, SE edges, access profiles). Builds on Phase 3a gate system and Phase 2 preset infrastructure.

**Tech Stack:** TypeScript, better-sqlite3, Vitest

---

## Task 1: Trigger Node + SE Edge Types

**Files:** Modify node-types.ts, edge-types.ts. Create tests/se-trigger.test.ts.

- [ ] Add `'trigger'` to NODE_KINDS, add TriggerAttrs interface (entitaets_id, phasen_ziel, subsystem, input_quelle, erwarteter_output, niveau, gate_befund_id)
- [ ] Add REQUIRED/ALLOWED frontmatter fields for trigger
- [ ] Add 4 edge types: `triggert`, `teilprojekt_von`, `uebergibt_an`, `sammelt_ein`
- [ ] Add pair derivation: `trigger->phase` = `triggert`
- [ ] Add validation for SE hierarchy edges (phase_subsystem pairs for teilprojekt_von etc — actually these connect SE sessions, so more flexible validation)
- [ ] Write type-level tests, run full suite, commit

---

## Task 2: SE Preset Registration

**Files:** Create src/main/preset/systems-engineer/se-preset.ts, index.ts. Create tests/se-preset.test.ts.

- [ ] Define SE_RAHMEN const with all 11 PresetRahmen fields (rollenTyp: QuerliegenSE, model: heavy, personaVorgabe: cipher, 8 capability IDs)
- [ ] Export `createSEPreset()` that returns a Preset object with rahmen + bodyPath + personaPath
- [ ] Write tests: SE_RAHMEN validates, rollenTyp is QuerliegenSE, phasenBindung is empty array, model is heavy, persona is cipher
- [ ] Run full suite, commit

---

## Task 3: Gate-Urteil + Trigger Queries

**Files:** Create src/main/preset/systems-engineer/se-gate-urteil.ts. Modify query.ts. Create tests/se-gate-urteil.test.ts.

- [ ] Implement `seGateUrteil(graphDb, phaseUid, gewichtung)` — calls autoGateBefund + adds gewichtung
- [ ] Implement `createTrigger(graphDb, attrs: TriggerAttrs)` — writes trigger node + triggert edge. Validates gate_befund_id exists if provided.
- [ ] Add query templates: `trigger_history` (chronological), `trigger_for_phase` (triggers targeting a phase)
- [ ] Write tests: gate-urteil creates befund with gewichtung, trigger creation validates gate reference, trigger_history returns chronological order
- [ ] Run full suite, commit

---

## Task 4: SE Hierarchy + Handoff Audit

**Files:** Modify query.ts. Create tests/se-hierarchy.test.ts.

- [ ] Add query template `se_hierarchy` — traverses teilprojekt_von edges from Haupt-SE
- [ ] Add query template `handoff_audit` — checks every phase transition has SE trigger
- [ ] Add query template `quereinstieg_entscheidungen` — all quereinstieg decisions in project
- [ ] Write tests with seeded hierarchy (Haupt-SE + 2 Teilprojekt-SEs), handoff audit with/without triggers
- [ ] Run full suite, commit

---

## Task 5: Graph Access Isolation

**Files:** Create src/main/graph/access-profile.ts. Create tests/access-profile.test.ts.

- [ ] Define AccessProfile interface: `{ read: 'wide' | 'phase-scoped', write: 'full' | 'phase-scoped', phasenScope?: string[] }`
- [ ] Implement `deriveProfile(rahmen: PresetRahmen)` — SE gets wide/full, phasen-entitaet gets phase-scoped
- [ ] Implement `checkAccess(profile, operation, nodeKind)` — returns `{ allowed: boolean, reason?: string }`
- [ ] Violations are logged, not blocked
- [ ] Write tests: SE profile is wide/full, architect profile is phase-scoped, violation detection works
- [ ] Run full suite, commit

---

## Task 6: Rolling Summary Generalization

**Files:** Create src/main/preset/shared/rolling-summary.ts (move + generalize from workshop). Create tests/rolling-summary-shared.test.ts.

- [ ] Define `RollingSummaryConfig` interface with pflicht, updateTriggers, summaryFields
- [ ] Define `SE_SUMMARY_CONFIG` and `WORKSHOP_SUMMARY_CONFIG` presets
- [ ] Implement `createSummaryNode(graphDb, config, data)` — writes summary node to graph
- [ ] Implement `loadLatestSummary(graphDb, entityId)` — reads most recent summary
- [ ] Write tests: SE config has pflicht=true, summary roundtrip (create + load), Workshop config preserved
- [ ] Run full suite, commit

---

## Task 7: SE Capabilities per Niveau

**Files:** Create src/main/preset/systems-engineer/se-capabilities.ts. Modify se-preset.ts.

- [ ] Define capability packages for Niveau A (8), B (6), C (1)
- [ ] Implement `getSECapabilities(niveau)` returning package IDs for that niveau
- [ ] Niveau-C: only se-core-identity (max 500 tokens inline)
- [ ] Niveau-B: 6 packages (no graph-navigation-advanced, no steuer-ueberblick-tool)
- [ ] Write tests: correct package counts per niveau, C has only 1 package
- [ ] Run full suite, commit

---

## Task 8: Persona Separation + Defaults

**Files:** Create src/main/preset/shared/persona-loader.ts, persona-defaults.json. Create tests/persona-loader.test.ts.

- [ ] Implement `loadPersona(vorgabe: string)` — reads from persona templates dir, returns content or null
- [ ] Create `persona-defaults.json`: `{ "systems-engineer": "cipher", "architect": "theaitetos", "workshop": "cipher" }`
- [ ] Implement `getDefaultPersona(presetId: string)` — looks up in defaults
- [ ] Write tests: loadPersona returns content for known persona, null for unknown, defaults map correct
- [ ] Run full suite, commit

---

## Task 9: Body-Form per Niveau + Assemble Enhancement

**Files:** Modify src/main/session/assemble-entity.ts.

- [ ] Extend `assembleEntityClaudeMd()` to accept niveau parameter
- [ ] Niveau A: full CLAUDE.md with SKILL.md references
- [ ] Niveau B: compressed CLAUDE.md (inline capabilities, no SKILL.md refs)
- [ ] Niveau C: inline instruction (max 2000 tokens)
- [ ] Persona injected as separate section (orthogonal to body) — ENT-002
- [ ] Write tests for all 3 niveau outputs
- [ ] Run full suite, commit

---

## Task 10: Capability Lint + Token Count

**Files:** Create src/main/preset/capability-lint.ts. Create tests/capability-lint.test.ts.

- [ ] Implement `estimateTokens(content: string)` — whitespace split * 1.3 heuristic
- [ ] Implement `lintCapabilities(packages)` — checks no implicit dependencies, returns LintResult[]
- [ ] Implement `warnOversizedPackages(packages, niveau)` — >10k warning, >500 for niveau-C
- [ ] Write tests: token estimation, oversized detection, dependency check
- [ ] Run full suite, commit

---

## Task 11: Preset Validation + Permissions

**Files:** Modify src/main/preset/schema.ts. Create tests/ent-validation.test.ts.

- [ ] Extend `validatePresetRahmen()` to check all 4 Anbindungen (ENT-025): graphAnbindung set, capabilityAnbindung non-empty, personaVorgabe valid or empty, runtime valid adapter
- [ ] Implement `generatePermissions(rahmen)` — generates settings.json fragment for Niveau A (ENT-021)
- [ ] Write tests: validation catches missing Anbindungen, permissions generated correctly for SE
- [ ] Run full suite, commit

---

## Task 12: ENT Config Templates + Final Verification

**Files:** Modify se-preset.ts (add template sections).

- [ ] Add D-13 Hinweis-Satz constant for Niveau-C presets (ENT-013)
- [ ] Add "Niveau-Bedienung vs. Entsprechung" section template (ENT-014)
- [ ] Add Granularitaets-Pflicht section (ENT-015)
- [ ] Add Prueffrage-Checkpoint template (ENT-016)
- [ ] Run full test suite, typecheck
- [ ] Final commit

---

## Wave Assignment

| Wave | Tasks | Workers |
|------|-------|---------|
| 1 | Task 1 + Task 2 (Types + SE Preset) | 2 parallel |
| 2 | Task 3 + Task 4 (Queries + Hierarchy) | 2 sequential (query.ts) |
| 3 | Task 5 + Task 6 + Task 7 (Isolation + Summary + Capabilities) | 3 parallel |
| 4 | Task 8 + Task 9 (Persona + Body-Form) | 2 parallel |
| 5 | Task 10 + Task 11 (Lint + Validation) | 2 parallel |
| 6 | Task 12 (Config + Final) | 1 |
