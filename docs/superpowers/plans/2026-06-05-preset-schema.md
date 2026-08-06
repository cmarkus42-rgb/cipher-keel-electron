# Preset-Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Preset-System foundation (Entity/Preset/Session types, CapabilityNiveau, PresetRahmen schema + validation, runtime adapter lookup) covering REQs CK-ENT-001, 003, 004, 010, 023, 028.

**Architecture:** New `src/main/preset/` module with three focused files (types, niveau, schema) plus a barrel export. The existing `src/main/agent/registry.ts` gets a single new method `getForRuntime()` that maps runtime strings from the PresetRahmen to concrete adapters, with no silent fallback on unknown values.

**Tech Stack:** TypeScript (strict), Vitest, existing `AgentAdapter` / `ClaudeCodeAdapter` / `AdapterRegistry` infrastructure.

---

## File Structure

**Create:**
- `src/main/preset/types.ts` — Entity, Preset, Session types (CK-ENT-001)
- `src/main/preset/niveau.ts` — CapabilityNiveau enum, NiveauConfig, getNiveauConfig() (CK-ENT-003)
- `src/main/preset/schema.ts` — PresetRahmen, RollenTyp, ValidationResult, validatePresetRahmen() (CK-ENT-004, CK-ENT-023)
- `src/main/preset/index.ts` — barrel re-exports
- `tests/preset-schema.test.ts` — all tests for the above + registry.getForRuntime()

**Modify:**
- `src/main/agent/registry.ts` — add `getForRuntime(runtime?: string): AgentAdapter` (CK-ENT-010, CK-ENT-028)

---

## Task 1: Write failing tests

**Files:**
- Create: `tests/preset-schema.test.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
/**
 * Preset-Schema + Niveau + Runtime tests
 * CK-ENT-001, CK-ENT-003, CK-ENT-004, CK-ENT-010, CK-ENT-023, CK-ENT-028
 */
import { describe, it, expect } from 'vitest'
import { CapabilityNiveau, getNiveauConfig } from '../../src/main/preset/niveau'
import { RollenTyp, validatePresetRahmen } from '../../src/main/preset/schema'
import type { PresetRahmen } from '../../src/main/preset/schema'
import type { Entity, Preset, Session } from '../../src/main/preset/types'
import { AdapterRegistry } from '../../src/main/agent/registry'

// -----------------------------------------------------------------------
// CK-ENT-001 — Type shapes (compile-time check via type assertions)
// -----------------------------------------------------------------------
describe('Entity / Preset / Session types (CK-ENT-001)', () => {
  it('Entity has required fields', () => {
    const e: Entity = { id: 'e1', name: 'SE', rollenTyp: RollenTyp.QuerliegenSE, description: 'Systems Engineer' }
    expect(e.id).toBe('e1')
    expect(e.name).toBe('SE')
    expect(e.description).toBe('Systems Engineer')
  })

  it('multiple Sessions for same Entity are independent', () => {
    const s1: Session = { id: 's1', presetId: 'p1', adapterId: 'claude-code', status: 'running', createdAt: new Date() }
    const s2: Session = { id: 's2', presetId: 'p1', adapterId: 'claude-code', status: 'running', createdAt: new Date() }
    expect(s1.id).not.toBe(s2.id)
    expect(s1.presetId).toBe(s2.presetId)
  })

  it('Preset references Entity via entityId', () => {
    const p: Preset = {
      id: 'p1',
      name: 'SE-Preset',
      entityId: 'e1',
      rahmen: {
        id: 'r1', name: 'SE-Rahmen',
        rollenTyp: RollenTyp.QuerliegenSE,
        phasenBindung: [],
        capabilityAnbindung: [],
        graphAnbindung: { lesen: true, schreiben: true },
        personaVorgabe: '',
        runtime: '',
        model: '',
        capabilityNiveau: CapabilityNiveau.A,
        harnessBindung: '',
      },
      bodyPath: '/presets/se/body.md',
      personaPath: '/presets/se/persona.md',
    }
    expect(p.entityId).toBe('e1')
  })
})

// -----------------------------------------------------------------------
// CK-ENT-003 — CapabilityNiveau
// -----------------------------------------------------------------------
describe('CapabilityNiveau (CK-ENT-003)', () => {
  it('enum has values A, B, C', () => {
    expect(CapabilityNiveau.A).toBe('A')
    expect(CapabilityNiveau.B).toBe('B')
    expect(CapabilityNiveau.C).toBe('C')
  })

  it('getNiveauConfig A → CLAUDE.md + nativ', () => {
    const cfg = getNiveauConfig(CapabilityNiveau.A)
    expect(cfg.bodyForm).toBe('CLAUDE.md')
    expect(cfg.loaderStrategie).toBe('nativ')
  })

  it('getNiveauConfig B → harness-native + manuell', () => {
    const cfg = getNiveauConfig(CapabilityNiveau.B)
    expect(cfg.bodyForm).toBe('harness-native')
    expect(cfg.loaderStrategie).toBe('manuell')
  })

  it('getNiveauConfig C → Instruktionsdatei + inline', () => {
    const cfg = getNiveauConfig(CapabilityNiveau.C)
    expect(cfg.bodyForm).toBe('Instruktionsdatei')
    expect(cfg.loaderStrategie).toBe('inline')
  })
})

// -----------------------------------------------------------------------
// CK-ENT-004, CK-ENT-023 — PresetRahmen schema validation
// -----------------------------------------------------------------------

function validRahmen(): PresetRahmen {
  return {
    id: 'r1',
    name: 'Test-Rahmen',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['ideation'],
    capabilityAnbindung: [],
    graphAnbindung: { lesen: true, schreiben: false },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: 'claude-sonnet-4-6',
    capabilityNiveau: CapabilityNiveau.B,
    harnessBindung: '',
  }
}

describe('validatePresetRahmen (CK-ENT-004, CK-ENT-023)', () => {
  it('valid rahmen passes without errors', () => {
    const result = validatePresetRahmen(validRahmen())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('missing id produces structured error', () => {
    const rahmen = validRahmen()
    const { id: _id, ...withoutId } = rahmen
    const result = validatePresetRahmen(withoutId)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'id')).toBe(true)
  })

  it('missing name produces structured error', () => {
    const rahmen = validRahmen()
    const { name: _name, ...withoutName } = rahmen
    const result = validatePresetRahmen(withoutName)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'name')).toBe(true)
  })

  it('missing rollenTyp produces structured error', () => {
    const rahmen = validRahmen()
    const { rollenTyp: _rt, ...withoutRt } = rahmen
    const result = validatePresetRahmen(withoutRt)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'rollenTyp')).toBe(true)
  })

  it('missing capabilityNiveau produces structured error', () => {
    const rahmen = validRahmen()
    const { capabilityNiveau: _cn, ...withoutCn } = rahmen
    const result = validatePresetRahmen(withoutCn)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'capabilityNiveau')).toBe(true)
  })

  it('multiple missing required fields produce one error per missing field', () => {
    const result = validatePresetRahmen({})
    expect(result.valid).toBe(false)
    const fields = result.errors.map(e => e.field)
    expect(fields).toContain('id')
    expect(fields).toContain('name')
    expect(fields).toContain('rollenTyp')
    expect(fields).toContain('capabilityNiveau')
  })

  it('invalid rollenTyp enum value is rejected', () => {
    const rahmen = { ...validRahmen(), rollenTyp: 'ungueltig-typ' }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'rollenTyp')).toBe(true)
  })

  it('invalid capabilityNiveau enum value is rejected', () => {
    const rahmen = { ...validRahmen(), capabilityNiveau: 'D' }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'capabilityNiveau')).toBe(true)
  })

  it('empty optional fields are accepted as defaults (no errors)', () => {
    // runtime, model, harnessBindung, personaVorgabe, phasenBindung can be empty
    const rahmen: PresetRahmen = {
      id: 'r2',
      name: 'Minimal-Rahmen',
      rollenTyp: RollenTyp.BeauftragteInstanz,
      phasenBindung: [],
      capabilityAnbindung: [],
      graphAnbindung: { lesen: true, schreiben: false },
      personaVorgabe: '',
      runtime: '',
      model: '',
      capabilityNiveau: CapabilityNiveau.C,
      harnessBindung: '',
    }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('unknown fields in input object are ignored', () => {
    const rahmen = { ...validRahmen(), unknownField: 'some-value', anotherUnknown: 42 }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------
// CK-ENT-010, CK-ENT-028 — AdapterRegistry.getForRuntime()
// -----------------------------------------------------------------------
describe('AdapterRegistry.getForRuntime (CK-ENT-010, CK-ENT-028)', () => {
  it('undefined runtime returns default ClaudeCodeAdapter', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getForRuntime(undefined)
    expect(adapter.id).toBe('claude-code')
  })

  it('empty string runtime returns default ClaudeCodeAdapter', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getForRuntime('')
    expect(adapter.id).toBe('claude-code')
  })

  it('claude-cli-tmux maps to ClaudeCodeAdapter', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getForRuntime('claude-cli-tmux')
    expect(adapter.id).toBe('claude-code')
  })

  it('unknown runtime throws Error containing the unknown value', () => {
    const registry = new AdapterRegistry()
    expect(() => registry.getForRuntime('unknown-xyz')).toThrow(/unknown-xyz/)
  })

  it('no silent fallback: unknown runtime does not silently return default', () => {
    const registry = new AdapterRegistry()
    let threw = false
    try {
      registry.getForRuntime('unbekannter-wert')
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails (imports don't exist yet)**

```bash
cd <repo-root> && npm test -- --reporter=verbose tests/preset-schema.test.ts 2>&1 | head -40
```

Expected: FAIL with "Cannot find module" errors.

---

## Task 2: Implement `src/main/preset/types.ts`

**Files:**
- Create: `src/main/preset/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
/**
 * Core type hierarchy for the Preset-System.
 *
 * Entity: immutable role identity (who a participant is)
 * Preset: materialized run folder + prompt (how a role is instantiated)
 * Session: ephemeral AI invocation (a single run)
 *
 * CK-ENT-001
 */

import type { RollenTyp } from './schema'
import type { PresetRahmen } from './schema'

export interface Entity {
  /** Stable unique identifier */
  id: string
  /** Human-readable role name (e.g. "SE", "Debugger") */
  name: string
  /** Role classification — determines orchestration and trigger logic */
  rollenTyp: RollenTyp
  /** Free-form description of this entity's purpose */
  description: string
}

export interface Preset {
  /** Stable unique identifier */
  id: string
  /** Human-readable preset name */
  name: string
  /** ID of the Entity this preset materializes */
  entityId: string
  /** Typed metadata block read by the machinery */
  rahmen: PresetRahmen
  /** Absolute path to the body prompt file */
  bodyPath: string
  /** Absolute path to the persona file (empty = no persona) */
  personaPath: string
}

export type SessionStatus = 'pending' | 'running' | 'finished' | 'error'

export interface Session {
  /** Stable unique identifier (ULID recommended) */
  id: string
  /** ID of the Preset that spawned this session */
  presetId: string
  /** ID of the AgentAdapter used for this session */
  adapterId: string
  /** Lifecycle state */
  status: SessionStatus
  /** When this session was created */
  createdAt: Date
}
```

- [ ] **Step 2: Run the test subset that covers types**

```bash
cd <repo-root> && npm test -- tests/preset-schema.test.ts 2>&1 | grep -E "(PASS|FAIL|Cannot find|Entity|Preset|Session)" | head -20
```

Expected: Still fails (schema not implemented yet), but no "Cannot find module" for types.

---

## Task 3: Implement `src/main/preset/niveau.ts`

**Files:**
- Create: `src/main/preset/niveau.ts`

- [ ] **Step 1: Write the niveau file**

```typescript
/**
 * CapabilityNiveau — three levels A, B, C.
 *
 * Each niveau determines body form and loader strategy.
 * A: Full Claude Code — CLAUDE.md auto-loaded, native lazy loading
 * B: Harness-native — manual lazy loading
 * C: Instruction file — inline capabilities, minimal token budget
 *
 * CK-ENT-003
 */

export enum CapabilityNiveau {
  /** Full Claude Code harness — CLAUDE.md + SKILL.md native lazy-loading */
  A = 'A',
  /** Harness-native files or channel payload — manual lazy-loading */
  B = 'B',
  /** Short instruction file — inline capabilities, tight token budget */
  C = 'C',
}

export type BodyForm = 'CLAUDE.md' | 'harness-native' | 'Instruktionsdatei'
export type LoaderStrategie = 'nativ' | 'manuell' | 'inline'

export interface NiveauConfig {
  bodyForm: BodyForm
  loaderStrategie: LoaderStrategie
}

const NIVEAU_CONFIGS: Record<CapabilityNiveau, NiveauConfig> = {
  [CapabilityNiveau.A]: { bodyForm: 'CLAUDE.md', loaderStrategie: 'nativ' },
  [CapabilityNiveau.B]: { bodyForm: 'harness-native', loaderStrategie: 'manuell' },
  [CapabilityNiveau.C]: { bodyForm: 'Instruktionsdatei', loaderStrategie: 'inline' },
}

export function getNiveauConfig(niveau: CapabilityNiveau): NiveauConfig {
  return NIVEAU_CONFIGS[niveau]
}
```

- [ ] **Step 2: Run niveau tests**

```bash
cd <repo-root> && npm test -- tests/preset-schema.test.ts 2>&1 | grep -E "(CapabilityNiveau|PASS|FAIL)" | head -20
```

Expected: CapabilityNiveau describe block passes, schema blocks still fail.

---

## Task 4: Implement `src/main/preset/schema.ts`

**Files:**
- Create: `src/main/preset/schema.ts`

- [ ] **Step 1: Write the schema file**

```typescript
/**
 * PresetRahmen — typed metadata block for preset configuration.
 *
 * All 11 fields from M2 v1.1 §8.1 are defined here.
 * validatePresetRahmen() checks required fields and enum values.
 * Unknown fields in the input are silently ignored.
 *
 * CK-ENT-004, CK-ENT-023
 */

import { CapabilityNiveau } from './niveau'

/** Four role types from M5 §7 (Vier Lagen). CK-ENT-023 */
export enum RollenTyp {
  PhasenEntitaet = 'phasen-entitaet',
  QuerliegenSE = 'querliegen-se',
  QuerliegenCompanion = 'querliegen-companion',
  BeauftragteInstanz = 'beauftragte-instanz',
}

export interface GraphAnbindung {
  lesen: boolean
  schreiben: boolean
}

/** Typed metadata block read by the keel machinery. CK-ENT-004 */
export interface PresetRahmen {
  /** Unique ID for this rahmen */
  id: string
  /** Human-readable name */
  name: string
  /** Role classification */
  rollenTyp: RollenTyp
  /** Phase(s) this preset can carry (loose coupling, array) */
  phasenBindung: string[]
  /** Capability packages assigned to this preset */
  capabilityAnbindung: string[]
  /** Read/write profile for graph access */
  graphAnbindung: GraphAnbindung
  /** Default persona identifier (empty = no persona override) */
  personaVorgabe: string
  /** Runtime path declaration — used for adapter lookup */
  runtime: string
  /** Model override (empty = harness default) */
  model: string
  /** Capability niveau A | B | C */
  capabilityNiveau: CapabilityNiveau
  /** Specific harness this preset is bound to (empty = any) */
  harnessBindung: string
}

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

const REQUIRED_FIELDS: ReadonlyArray<keyof PresetRahmen> = ['id', 'name', 'rollenTyp', 'capabilityNiveau']

const VALID_ROLLEN_TYPEN = new Set<string>(Object.values(RollenTyp))
const VALID_NIVEAUS = new Set<string>(Object.values(CapabilityNiveau))

/**
 * Validate a preset rahmen object.
 *
 * - Required fields: id, name, rollenTyp, capabilityNiveau
 * - Enum fields: rollenTyp, capabilityNiveau must be valid enum values
 * - Unknown fields: silently ignored
 * - Empty optional fields: treated as defaults, not errors
 */
export function validatePresetRahmen(rahmen: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const obj = rahmen as Record<string, unknown>

  if (typeof obj !== 'object' || obj === null) {
    return {
      valid: false,
      errors: [{ field: 'rahmen', message: 'Input must be an object' }],
    }
  }

  // Check required fields exist and are non-empty strings
  for (const field of REQUIRED_FIELDS) {
    const value = obj[field]
    if (value === undefined || value === null || value === '') {
      errors.push({ field, message: `Required field '${field}' is missing or empty` })
    }
  }

  // Validate rollenTyp enum (only if present — missing is already caught above)
  if (obj['rollenTyp'] !== undefined && obj['rollenTyp'] !== null && obj['rollenTyp'] !== '') {
    if (!VALID_ROLLEN_TYPEN.has(String(obj['rollenTyp']))) {
      errors.push({
        field: 'rollenTyp',
        message: `Invalid rollenTyp '${obj['rollenTyp']}'. Valid values: ${[...VALID_ROLLEN_TYPEN].join(', ')}`,
      })
    }
  }

  // Validate capabilityNiveau enum (only if present)
  if (obj['capabilityNiveau'] !== undefined && obj['capabilityNiveau'] !== null && obj['capabilityNiveau'] !== '') {
    if (!VALID_NIVEAUS.has(String(obj['capabilityNiveau']))) {
      errors.push({
        field: 'capabilityNiveau',
        message: `Invalid capabilityNiveau '${obj['capabilityNiveau']}'. Valid values: A, B, C`,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 2: Run schema tests**

```bash
cd <repo-root> && npm test -- tests/preset-schema.test.ts 2>&1 | grep -E "(validatePresetRahmen|RollenTyp|PASS|FAIL)" | head -30
```

Expected: Schema describe blocks pass; registry tests still fail.

---

## Task 5: Edit `src/main/agent/registry.ts` — add `getForRuntime()`

**Files:**
- Modify: `src/main/agent/registry.ts`

- [ ] **Step 1: Add `getForRuntime()` to AdapterRegistry**

Read the current file first (already done at plan time), then apply this edit.

Add after the `setDefault` method (line 43, before the closing `}`):

```typescript
  /**
   * Known runtime values from PresetRahmen and their corresponding adapter IDs.
   * CK-ENT-010, CK-ENT-028
   */
  private static readonly RUNTIME_TO_ADAPTER_ID: ReadonlyMap<string, string> = new Map([
    ['claude-cli-tmux', 'claude-code'],
    ['nanoclaw-channel-route', 'nanoclaw-channel'],
  ])

  /**
   * Look up an adapter by the `runtime` field from a PresetRahmen.
   *
   * - Empty / undefined → returns the default adapter (ClaudeCodeAdapter)
   * - Known runtime → returns the corresponding registered adapter
   * - Unknown runtime → throws an Error with the value; no silent fallback
   *
   * CK-ENT-010, CK-ENT-028
   */
  getForRuntime(runtime: string | undefined): AgentAdapter {
    if (!runtime) {
      return this.getDefault()
    }

    const adapterId = AdapterRegistry.RUNTIME_TO_ADAPTER_ID.get(runtime)
    if (adapterId === undefined) {
      throw new Error(
        `[AdapterRegistry] Unknown runtime value '${runtime}'. ` +
        `Known runtimes: ${[...AdapterRegistry.RUNTIME_TO_ADAPTER_ID.keys()].join(', ')}`
      )
    }

    const adapter = this.adapters.get(adapterId)
    if (!adapter) {
      throw new Error(
        `[AdapterRegistry] Adapter '${adapterId}' for runtime '${runtime}' is not registered`
      )
    }

    return adapter
  }
```

The exact edit replaces the closing `}` of the class with the new method + closing `}`:

Old string (the final closing brace of the class after `setDefault`):

```typescript
  setDefault(id: string): void {
    if (!this.adapters.has(id)) throw new Error(`Adapter '${id}' not registered`)
    this.defaultId = id
  }
}
```

New string:

```typescript
  setDefault(id: string): void {
    if (!this.adapters.has(id)) throw new Error(`Adapter '${id}' not registered`)
    this.defaultId = id
  }

  /**
   * Known runtime values from PresetRahmen and their corresponding adapter IDs.
   * CK-ENT-010, CK-ENT-028
   */
  private static readonly RUNTIME_TO_ADAPTER_ID: ReadonlyMap<string, string> = new Map([
    ['claude-cli-tmux', 'claude-code'],
    ['nanoclaw-channel-route', 'nanoclaw-channel'],
  ])

  /**
   * Look up an adapter by the `runtime` field from a PresetRahmen.
   *
   * - Empty / undefined → returns the default adapter (ClaudeCodeAdapter)
   * - Known runtime → returns the corresponding registered adapter
   * - Unknown runtime → throws an Error with the value; no silent fallback
   *
   * CK-ENT-010, CK-ENT-028
   */
  getForRuntime(runtime: string | undefined): AgentAdapter {
    if (!runtime) {
      return this.getDefault()
    }

    const adapterId = AdapterRegistry.RUNTIME_TO_ADAPTER_ID.get(runtime)
    if (adapterId === undefined) {
      throw new Error(
        `[AdapterRegistry] Unknown runtime value '${runtime}'. ` +
        `Known runtimes: ${[...AdapterRegistry.RUNTIME_TO_ADAPTER_ID.keys()].join(', ')}`
      )
    }

    const adapter = this.adapters.get(adapterId)
    if (!adapter) {
      throw new Error(
        `[AdapterRegistry] Adapter '${adapterId}' for runtime '${runtime}' is not registered`
      )
    }

    return adapter
  }
}
```

- [ ] **Step 2: Run the full preset-schema test suite**

```bash
cd <repo-root> && npm test -- tests/preset-schema.test.ts 2>&1 | tail -30
```

Expected: All tests PASS.

---

## Task 6: Create `src/main/preset/index.ts` (barrel)

**Files:**
- Create: `src/main/preset/index.ts`

- [ ] **Step 1: Write the barrel file**

```typescript
/**
 * Preset module — barrel export.
 * CK-ENT-001, CK-ENT-003, CK-ENT-004, CK-ENT-023
 */
export type { Entity, Preset, Session, SessionStatus } from './types'
export { CapabilityNiveau, getNiveauConfig } from './niveau'
export type { BodyForm, LoaderStrategie, NiveauConfig } from './niveau'
export { RollenTyp, validatePresetRahmen } from './schema'
export type { PresetRahmen, GraphAnbindung, ValidationError, ValidationResult } from './schema'
```

- [ ] **Step 2: Verify barrel compiles**

```bash
cd <repo-root> && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors (or only pre-existing unrelated errors).

---

## Task 7: Run full test suite — no regressions

**Files:** none

- [ ] **Step 1: Run all tests**

```bash
cd <repo-root> && npm test 2>&1 | tail -30
```

Expected: All previously passing tests still pass; new preset-schema tests all pass.

- [ ] **Step 2: Commit**

```bash
cd <repo-root> && git add \
  src/main/preset/types.ts \
  src/main/preset/niveau.ts \
  src/main/preset/schema.ts \
  src/main/preset/index.ts \
  src/main/agent/registry.ts \
  tests/preset-schema.test.ts && git commit -m "$(cat <<'EOF'
feat(preset): Preset-Schema, Niveaus, Runtime-Anbindung (CK-ENT-001/003/004/010/023/028)

- src/main/preset/types.ts: Entity, Preset, Session types
- src/main/preset/niveau.ts: CapabilityNiveau A/B/C + getNiveauConfig()
- src/main/preset/schema.ts: PresetRahmen (11 Felder), RollenTyp, validatePresetRahmen()
- src/main/preset/index.ts: barrel exports
- src/main/agent/registry.ts: getForRuntime() — runtime→Adapter-Lookup ohne stille Fallbacks
- tests/preset-schema.test.ts: 20 Tests gruen

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- CK-ENT-001 ✓ — Entity, Preset, Session types with correct semantics; multiple sessions of same entity possible (Task 2)
- CK-ENT-003 ✓ — CapabilityNiveau A/B/C enum; bodyForm/loaderStrategie per niveau (Task 3)
- CK-ENT-004 ✓ — All 11 PresetRahmen fields; validatePresetRahmen(); unknown fields ignored (Task 4)
- CK-ENT-010 ✓ — runtime field → adapter lookup via getForRuntime() (Task 5)
- CK-ENT-023 ✓ — RollenTyp enum with 4 values; enum validation in validatePresetRahmen() (Task 4)
- CK-ENT-028 ✓ — empty runtime → default; unknown runtime → Error with value; no silent fallback (Task 5)

**Placeholder scan:** No TBD, no "implement later", all code blocks are complete.

**Type consistency:**
- `Entity.rollenTyp: RollenTyp` — RollenTyp is defined in schema.ts, imported in types.ts ✓
- `Preset.rahmen: PresetRahmen` — PresetRahmen imported from schema.ts ✓
- `Preset.rahmen.capabilityNiveau: CapabilityNiveau` — CapabilityNiveau imported from niveau.ts in schema.ts ✓
- `registry.getForRuntime()` returns `AgentAdapter` — same type as `getDefault()` ✓
- Tests import CapabilityNiveau from niveau.ts, RollenTyp from schema.ts — consistent with barrel ✓
