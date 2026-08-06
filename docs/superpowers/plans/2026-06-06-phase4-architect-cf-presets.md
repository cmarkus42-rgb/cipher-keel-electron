# Phase 4: Architect + CF Presets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Architect and Cyber Factory presets with graph-mediated collaboration, capability packages per niveau, and negative boundary enforcement.

**Architecture:** Three sequential sub-phases — 4a-infra (graph extensions), 4b-architect (preset), 4c-cf (preset). Each sub-phase is independently testable. All graph writes go through the existing single-writer-queue in `writer.ts`. New NodeKinds/EdgeKinds extend the existing type registries. Presets follow the SE/Workshop reference patterns.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Electron (main process)

**Spec:** `docs/superpowers/specs/2026-06-05-phase4-architect-cf-presets-design.md`

---

## Sub-Phase 4a: Graph Infrastructure

### Task 1: Add 5 new NodeKinds + frontmatter types

**Files:**
- Modify: `src/main/graph/node-types.ts`
- Test: `tests/graph/phase4a-node-types.test.ts`

- [ ] **Step 1: Write failing tests for new NodeKinds**

```typescript
// tests/graph/phase4a-node-types.test.ts
import { describe, it, expect } from 'vitest'
import {
  NODE_KINDS,
  isValidKind,
  REQUIRED_FRONTMATTER_FIELDS,
  ALLOWED_FRONTMATTER_FIELDS,
} from '../../src/main/graph/node-types'

describe('Phase 4a NodeKinds', () => {
  const NEW_KINDS = [
    'adr',
    'schnittstellen_vertrag',
    'anforderungspaket',
    'frage_knoten',
    'antwort_knoten',
  ] as const

  for (const kind of NEW_KINDS) {
    it(`NODE_KINDS contains '${kind}'`, () => {
      expect(NODE_KINDS).toContain(kind)
    })

    it(`isValidKind('${kind}') returns true`, () => {
      expect(isValidKind(kind)).toBe(true)
    })

    it(`REQUIRED_FRONTMATTER_FIELDS has entry for '${kind}'`, () => {
      expect(REQUIRED_FRONTMATTER_FIELDS).toHaveProperty(kind)
      expect(Array.isArray(REQUIRED_FRONTMATTER_FIELDS[kind])).toBe(true)
    })

    it(`ALLOWED_FRONTMATTER_FIELDS has entry for '${kind}'`, () => {
      expect(ALLOWED_FRONTMATTER_FIELDS).toHaveProperty(kind)
      expect(Array.isArray(ALLOWED_FRONTMATTER_FIELDS[kind])).toBe(true)
    })
  }

  // ADR required fields
  it('adr requires title, context, options, decision, consequences, tiefen, version', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['adr']
    expect(req).toContain('title')
    expect(req).toContain('context')
    expect(req).toContain('options')
    expect(req).toContain('decision')
    expect(req).toContain('consequences')
    expect(req).toContain('tiefen')
    expect(req).toContain('version')
  })

  // schnittstellen_vertrag required fields
  it('schnittstellen_vertrag requires subsystem_a, subsystem_b, input_schema, output_schema, fehlerverhalten, template_version', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['schnittstellen_vertrag']
    expect(req).toContain('subsystem_a')
    expect(req).toContain('subsystem_b')
    expect(req).toContain('input_schema')
    expect(req).toContain('output_schema')
    expect(req).toContain('fehlerverhalten')
    expect(req).toContain('template_version')
  })

  // anforderungspaket required fields
  it('anforderungspaket requires subsystem, req_ids, code_anker, akzeptanzkriterium, testcase_verweis', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['anforderungspaket']
    expect(req).toContain('subsystem')
    expect(req).toContain('req_ids')
    expect(req).toContain('code_anker')
    expect(req).toContain('akzeptanzkriterium')
    expect(req).toContain('testcase_verweis')
  })

  // anforderungspaket allows optional niveau_c_extrakt
  it('anforderungspaket allows niveau_c_extrakt', () => {
    const allowed = ALLOWED_FRONTMATTER_FIELDS['anforderungspaket']
    expect(allowed).toContain('niveau_c_extrakt')
  })

  // frage_knoten required fields
  it('frage_knoten requires subsystem, frage, worker_id, status', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['frage_knoten']
    expect(req).toContain('subsystem')
    expect(req).toContain('frage')
    expect(req).toContain('worker_id')
    expect(req).toContain('status')
  })

  // antwort_knoten required fields
  it('antwort_knoten requires frage_uid, antwort, architect_session', () => {
    const req = REQUIRED_FRONTMATTER_FIELDS['antwort_knoten']
    expect(req).toContain('frage_uid')
    expect(req).toContain('antwort')
    expect(req).toContain('architect_session')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-node-types.test.ts`
Expected: FAIL — new kinds not in NODE_KINDS

- [ ] **Step 3: Implement new NodeKinds and frontmatter types**

In `src/main/graph/node-types.ts`:

1. Add to `NODE_KINDS` array: `'adr', 'schnittstellen_vertrag', 'anforderungspaket', 'frage_knoten', 'antwort_knoten'`

2. Add frontmatter attr interfaces:

```typescript
/** CK-P3A-003: Architecture Decision Record */
export interface AdrAttrs {
  title: string
  context: string
  options: string
  decision: string
  consequences: string
  tiefen: { summary: string; context: string; alternatives: string; consequences: string }
  version: number
}

/** CK-P3A-002: Interface contract between subsystems */
export interface SchnittstellenVertragAttrs {
  subsystem_a: string
  subsystem_b: string
  input_schema: string
  output_schema: string
  fehlerverhalten: string
  template_version: string
}

/** CK-P3A-004: Granular worker input per subsystem */
export interface AnforderungspaketAttrs {
  subsystem: string
  req_ids: string[]
  code_anker: string[]
  akzeptanzkriterium: string
  testcase_verweis: string
  niveau_c_extrakt?: string
}

/** CK-P3A-005: Coaching question from CF worker */
export interface FrageKnotenAttrs {
  subsystem: string
  frage: string
  worker_id: string
  status: 'offen' | 'beantwortet'
}

/** CK-P3A-005: Coaching answer from Architect */
export interface AntwortKnotenAttrs {
  frage_uid: string
  antwort: string
  architect_session: string
}
```

3. Add entries to `REQUIRED_FRONTMATTER_FIELDS`:

```typescript
adr: ['title', 'context', 'options', 'decision', 'consequences', 'tiefen', 'version'],
schnittstellen_vertrag: ['subsystem_a', 'subsystem_b', 'input_schema', 'output_schema', 'fehlerverhalten', 'template_version'],
anforderungspaket: ['subsystem', 'req_ids', 'code_anker', 'akzeptanzkriterium', 'testcase_verweis'],
frage_knoten: ['subsystem', 'frage', 'worker_id', 'status'],
antwort_knoten: ['frage_uid', 'antwort', 'architect_session'],
```

4. Add entries to `ALLOWED_FRONTMATTER_FIELDS` (required + optional):

```typescript
adr: ['title', 'context', 'options', 'decision', 'consequences', 'tiefen', 'version'],
schnittstellen_vertrag: ['subsystem_a', 'subsystem_b', 'input_schema', 'output_schema', 'fehlerverhalten', 'template_version'],
anforderungspaket: ['subsystem', 'req_ids', 'code_anker', 'akzeptanzkriterium', 'testcase_verweis', 'niveau_c_extrakt'],
frage_knoten: ['subsystem', 'frage', 'worker_id', 'status'],
antwort_knoten: ['frage_uid', 'antwort', 'architect_session'],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-node-types.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `cd <repo-root> && npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/graph/node-types.ts tests/graph/phase4a-node-types.test.ts
git commit -m "feat(graph): add 5 NodeKinds for Architect/CF presets (CK-P3A-002..005, CK-P3CF-009)"
```

---

### Task 2: Add 3 new EdgeKinds

**Files:**
- Modify: `src/main/graph/edge-types.ts`
- Test: `tests/graph/phase4a-edge-types.test.ts`

- [ ] **Step 1: Write failing tests for new EdgeKinds**

```typescript
// tests/graph/phase4a-edge-types.test.ts
import { describe, it, expect } from 'vitest'
import {
  EDGE_TYPES,
  isValidEdgeType,
  deriveEdgeType,
  validateEdgeForPair,
} from '../../src/main/graph/edge-types'

describe('Phase 4a EdgeKinds', () => {
  const NEW_EDGES = [
    'schnittstellen_vertrag_fuer',
    'adr_fuer',
    'beantwortet',
  ] as const

  for (const edge of NEW_EDGES) {
    it(`EDGE_TYPES contains '${edge}'`, () => {
      expect(EDGE_TYPES).toContain(edge)
    })

    it(`isValidEdgeType('${edge}') returns true`, () => {
      expect(isValidEdgeType(edge)).toBe(true)
    })
  }

  it('schnittstellen_vertrag -> phase_subsystem derives schnittstellen_vertrag_fuer', () => {
    expect(deriveEdgeType('schnittstellen_vertrag', 'phase_subsystem'))
      .toBe('schnittstellen_vertrag_fuer')
  })

  it('adr -> phase_subsystem derives adr_fuer', () => {
    expect(deriveEdgeType('adr', 'phase_subsystem')).toBe('adr_fuer')
  })

  it('antwort_knoten -> frage_knoten derives beantwortet', () => {
    expect(deriveEdgeType('antwort_knoten', 'frage_knoten')).toBe('beantwortet')
  })

  it('validates schnittstellen_vertrag_fuer for correct pair', () => {
    const err = validateEdgeForPair('schnittstellen_vertrag_fuer', 'schnittstellen_vertrag', 'phase_subsystem')
    expect(err).toBeNull()
  })

  it('rejects schnittstellen_vertrag_fuer for wrong source', () => {
    const err = validateEdgeForPair('schnittstellen_vertrag_fuer', 'anforderung', 'phase_subsystem')
    expect(err).not.toBeNull()
  })

  it('validates adr_fuer for correct pair', () => {
    const err = validateEdgeForPair('adr_fuer', 'adr', 'phase_subsystem')
    expect(err).toBeNull()
  })

  it('validates beantwortet for correct pair', () => {
    const err = validateEdgeForPair('beantwortet', 'antwort_knoten', 'frage_knoten')
    expect(err).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-edge-types.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement new EdgeKinds**

In `src/main/graph/edge-types.ts`:

1. Add to `EDGE_TYPES` array: `'schnittstellen_vertrag_fuer', 'adr_fuer', 'beantwortet'`

2. Add to `PAIR_DERIVATION`:
```typescript
'schnittstellen_vertrag->phase_subsystem': 'schnittstellen_vertrag_fuer',
'adr->phase_subsystem': 'adr_fuer',
'antwort_knoten->frage_knoten': 'beantwortet',
```

3. Add validation rules in `validateEdgeForPair` for the three new edge types. Each must check that source and destination kinds match the expected pair. Return `null` for valid, error string for invalid.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-edge-types.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/graph/edge-types.ts tests/graph/phase4a-edge-types.test.ts
git commit -m "feat(graph): add 3 EdgeKinds for interface contracts, ADRs, coaching (CK-P3A-002..005)"
```

---

### Task 3: Writer validation for new NodeKinds

**Files:**
- Modify: `src/main/graph/writer.ts` (only if validation logic needs changes beyond the registries)
- Test: `tests/graph/phase4a-writer.test.ts`

- [ ] **Step 1: Write failing tests for writer validation of new kinds**

```typescript
// tests/graph/phase4a-writer.test.ts
import { describe, it, expect } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter, SchemaError } from '../../src/main/graph/writer'
import type Database from 'better-sqlite3'

describe('GraphWriter — Phase 4a NodeKinds', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('creates adr node with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'adr',
      title: 'Use REST over gRPC',
      path: '/adrs/adr-001.md',
      frontmatter: {
        title: 'Use REST over gRPC',
        context: 'We need an API protocol',
        options: 'REST vs gRPC vs GraphQL',
        decision: 'REST for simplicity',
        consequences: 'Slower binary but simpler tooling',
        tiefen: { summary: 'REST chosen', context: 'full ctx', alternatives: 'gRPC, GraphQL', consequences: 'simpler' },
        version: 1,
      },
    })
    expect(result.created).toBe(true)
    expect(result.uid).toHaveLength(26)
  })

  it('rejects adr node missing required field', () => {
    expect(() => writer.upsertNode({
      kind: 'adr',
      title: 'Incomplete',
      path: '/adrs/bad.md',
      frontmatter: { title: 'Incomplete' },
    })).toThrow()
  })

  it('creates schnittstellen_vertrag with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'schnittstellen_vertrag',
      title: 'Auth-DB Contract',
      path: '/contracts/auth-db.md',
      frontmatter: {
        subsystem_a: 'uid-auth',
        subsystem_b: 'uid-db',
        input_schema: '{ userId: string }',
        output_schema: '{ user: User | null }',
        fehlerverhalten: '404 if not found, 500 on DB error',
        template_version: '1.0',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates anforderungspaket with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'anforderungspaket',
      title: 'Auth Subsystem Package',
      path: '/packages/auth.md',
      frontmatter: {
        subsystem: 'uid-auth',
        req_ids: ['REQ-001', 'REQ-002'],
        code_anker: ['src/auth/login.ts:handleLogin'],
        akzeptanzkriterium: 'Login returns JWT on valid credentials',
        testcase_verweis: 'T-AUTH.1',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates anforderungspaket with optional niveau_c_extrakt', () => {
    const result = writer.upsertNode({
      kind: 'anforderungspaket',
      title: 'Auth Package C',
      path: '/packages/auth-c.md',
      frontmatter: {
        subsystem: 'uid-auth',
        req_ids: ['REQ-001'],
        code_anker: ['src/auth/login.ts'],
        akzeptanzkriterium: 'Login works',
        testcase_verweis: 'T-AUTH.1',
        niveau_c_extrakt: 'Implement login endpoint returning JWT',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates frage_knoten with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'frage_knoten',
      title: 'Auth error handling unclear',
      path: '/coaching/q-001.md',
      frontmatter: {
        subsystem: 'uid-auth',
        frage: 'Should auth errors return 401 or 403?',
        worker_id: 'worker-a1',
        status: 'offen',
      },
    })
    expect(result.created).toBe(true)
  })

  it('creates antwort_knoten with valid frontmatter', () => {
    const result = writer.upsertNode({
      kind: 'antwort_knoten',
      title: 'Auth error answer',
      path: '/coaching/a-001.md',
      frontmatter: {
        frage_uid: '01ABCDEF',
        antwort: '401 for invalid credentials, 403 for insufficient permissions',
        architect_session: 'session-arch-01',
      },
    })
    expect(result.created).toBe(true)
  })

  it('links adr to subsystem with adr_fuer edge', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem',
      title: 'Auth Subsystem',
      path: '/subsystems/auth',
      frontmatter: {},
    })
    const adr = writer.upsertNode({
      kind: 'adr',
      title: 'REST API',
      path: '/adrs/rest.md',
      frontmatter: {
        title: 'REST', context: 'c', options: 'o', decision: 'd',
        consequences: 'co', tiefen: { summary: 's', context: 'c', alternatives: 'a', consequences: 'co' },
        version: 1,
      },
    })
    const edge = writer.linkEdge({ src: adr.uid, dst: sub.uid })
    expect(edge.type).toBe('adr_fuer')
    expect(edge.created).toBe(true)
  })

  it('links antwort to frage with beantwortet edge', () => {
    const frage = writer.upsertNode({
      kind: 'frage_knoten',
      title: 'Q1',
      path: '/coaching/q1.md',
      frontmatter: { subsystem: 'uid-a', frage: 'why?', worker_id: 'w1', status: 'offen' },
    })
    const antwort = writer.upsertNode({
      kind: 'antwort_knoten',
      title: 'A1',
      path: '/coaching/a1.md',
      frontmatter: { frage_uid: frage.uid, antwort: 'because', architect_session: 's1' },
    })
    const edge = writer.linkEdge({ src: antwort.uid, dst: frage.uid })
    expect(edge.type).toBe('beantwortet')
    expect(edge.created).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-writer.test.ts`
Expected: FAIL (new kinds not recognized by writer)

- [ ] **Step 3: Verify writer needs no code changes**

The writer's `upsertNode` validates frontmatter via `REQUIRED_FRONTMATTER_FIELDS[kind]` which was already populated in Task 1. The writer's `linkEdge` derives edge types via `deriveEdgeType` which was updated in Task 2. Check if the tests pass now that Tasks 1+2 are done. If they do, no writer changes needed. If not, add any missing validation logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-writer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add tests/graph/phase4a-writer.test.ts
git commit -m "test(graph): writer validation for Phase 4a NodeKinds and EdgeKinds"
```

---

### Task 4: Add 8 new query templates

**Files:**
- Modify: `src/main/graph/query.ts`
- Test: `tests/graph/phase4a-queries.test.ts`

- [ ] **Step 1: Write failing tests for new query templates**

```typescript
// tests/graph/phase4a-queries.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphQuery } from '../../src/main/graph/query'
import type Database from 'better-sqlite3'

function seedArchitectGraph(writer: GraphWriter) {
  // Create two subsystems
  const subA = writer.upsertNode({
    kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
    frontmatter: { scope: 'authentication' },
  })
  const subB = writer.upsertNode({
    kind: 'phase_subsystem', title: 'DB', path: '/sub/db',
    frontmatter: { scope: 'database' },
  })

  // ADR linked to Auth
  const adr1 = writer.upsertNode({
    kind: 'adr', title: 'Use JWT', path: '/adrs/jwt.md',
    frontmatter: {
      title: 'Use JWT', context: 'Need tokens', options: 'JWT vs session',
      decision: 'JWT', consequences: 'Stateless', version: 1,
      tiefen: { summary: 'JWT chosen for auth', context: 'ctx', alternatives: 'session', consequences: 'stateless' },
    },
  })
  writer.linkEdge({ src: adr1.uid, dst: subA.uid })

  // Contract between Auth and DB
  const contract = writer.upsertNode({
    kind: 'schnittstellen_vertrag', title: 'Auth-DB', path: '/contracts/auth-db.md',
    frontmatter: {
      subsystem_a: subA.uid, subsystem_b: subB.uid,
      input_schema: '{ userId: string }', output_schema: '{ user: User }',
      fehlerverhalten: '404', template_version: '1.0',
    },
  })
  writer.linkEdge({ src: contract.uid, dst: subA.uid })

  // Anforderungspaket for Auth
  const pkg = writer.upsertNode({
    kind: 'anforderungspaket', title: 'Auth Package', path: '/pkgs/auth.md',
    frontmatter: {
      subsystem: subA.uid, req_ids: ['REQ-001'], code_anker: ['src/auth.ts'],
      akzeptanzkriterium: 'Login works', testcase_verweis: 'T-1',
    },
  })

  // Open question
  const frage = writer.upsertNode({
    kind: 'frage_knoten', title: 'Q1', path: '/coaching/q1.md',
    frontmatter: { subsystem: subA.uid, frage: 'Error format?', worker_id: 'w1', status: 'offen' },
  })

  // Answered question
  const frage2 = writer.upsertNode({
    kind: 'frage_knoten', title: 'Q2', path: '/coaching/q2.md',
    frontmatter: { subsystem: subA.uid, frage: 'Token TTL?', worker_id: 'w2', status: 'beantwortet' },
  })
  const antwort = writer.upsertNode({
    kind: 'antwort_knoten', title: 'A2', path: '/coaching/a2.md',
    frontmatter: { frage_uid: frage2.uid, antwort: '1 hour', architect_session: 'arch-1' },
  })
  writer.linkEdge({ src: antwort.uid, dst: frage2.uid })

  // Risk review (gate_befund with gate_typ='risk-review')
  const phase = writer.upsertNode({
    kind: 'phase', title: 'Development', path: '/phases/dev',
    frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
  })
  writer.upsertNode({
    kind: 'gate_befund', title: 'Risk Review W1', path: '/reviews/w1.md',
    frontmatter: {
      phase_uid: phase.uid, strukturell: 'gruen', gate_typ: 'risk-review',
      risiko: 'Token leak', wahrscheinlichkeit: 'niedrig', impact: 'hoch',
      massnahme: 'Rotate keys', befund_statement: 'Low prob high impact token leak risk',
    },
  })

  return { subA, subB, adr1, contract, pkg, frage, frage2, antwort, phase }
}

describe('Phase 4a Query Templates', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('adr_list returns all ADR nodes', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'adr_list' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Use JWT')
  })

  it('adr_by_tiefe returns summary-level content', () => {
    const { adr1 } = seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'adr_by_tiefe', params: { adr_uid: adr1.uid, tiefe: 'summary' } })
    expect(result.count).toBe(1)
    // summary tiefe should contain the summary string from tiefen object
    const row = result.rows[0] as Record<string, unknown>
    expect(row).toHaveProperty('title')
  })

  it('schnittstellen_vertraege returns contracts', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'schnittstellen_vertraege' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Auth-DB')
  })

  it('schnittstellen_vertraege filters by subsystem_uid', () => {
    const { subA } = seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'schnittstellen_vertraege', params: { subsystem_uid: subA.uid } })
    expect(result.count).toBe(1)
  })

  it('anforderungspakete returns packages', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'anforderungspakete' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Auth Package')
  })

  it('offene_fragen returns only open questions', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'offene_fragen' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Q1')
  })

  it('coaching_historie returns Q+A pairs chronologically', () => {
    const { subA } = seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'coaching_historie', params: { subsystem: subA.uid } })
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('architect_summary aggregates subsystem data', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'architect_summary' })
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('risk_reviews returns gate_befund with gate_typ risk-review', () => {
    seedArchitectGraph(writer)
    const result = graphQuery(db, { template: 'risk_reviews' })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'Risk Review W1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-queries.test.ts`
Expected: FAIL — unknown template names

- [ ] **Step 3: Implement 8 query templates**

In `src/main/graph/query.ts`:

1. Add the 8 new template names to the `QUERY_TEMPLATES` array.

2. Add dispatcher cases in `graphQuery()` for each new template.

3. Implement each query function:

**`adr_list`**: `SELECT uid, title, frontmatter, erstellt FROM node WHERE kind = 'adr' AND status = 'aktiv' ORDER BY json_extract(frontmatter, '$.version') DESC`

**`adr_by_tiefe`**: Required params `adr_uid`, `tiefe`. SELECT the ADR node by uid, then extract from the `tiefen` JSON object based on `tiefe` parameter. For `summary`: return title + `json_extract(frontmatter, '$.tiefen.summary')` + `json_extract(frontmatter, '$.consequences')`. For `context`: return title + context + decision + consequences. For `full`: return all fields.

**`schnittstellen_vertraege`**: Optional `subsystem_uid` param. `SELECT n.uid, n.title, n.frontmatter, n.erstellt FROM node n WHERE n.kind = 'schnittstellen_vertrag' AND n.status = 'aktiv'` — if subsystem_uid provided, JOIN via edge: `JOIN edge e ON e.src = n.uid AND e.type = 'schnittstellen_vertrag_fuer' AND e.dst = :subsystem_uid`.

**`anforderungspakete`**: Optional `subsystem_uid` param. `SELECT uid, title, frontmatter FROM node WHERE kind = 'anforderungspaket' AND status = 'aktiv'` — if subsystem_uid provided, add `AND json_extract(frontmatter, '$.subsystem') = :subsystem_uid`.

**`offene_fragen`**: Optional `subsystem` param. `SELECT uid, title, frontmatter, erstellt FROM node WHERE kind = 'frage_knoten' AND status = 'aktiv' AND json_extract(frontmatter, '$.status') = 'offen'` — if subsystem provided, add `AND json_extract(frontmatter, '$.subsystem') = :subsystem`.

**`coaching_historie`**: Required `subsystem` param. Query frage_knoten and LEFT JOIN to antwort_knoten via beantwortet edge: `SELECT f.uid AS frage_uid, f.title AS frage_title, json_extract(f.frontmatter, '$.frage') AS frage, a.uid AS antwort_uid, json_extract(a.frontmatter, '$.antwort') AS antwort, f.erstellt FROM node f LEFT JOIN edge e ON e.dst = f.uid AND e.type = 'beantwortet' LEFT JOIN node a ON a.uid = e.src WHERE f.kind = 'frage_knoten' AND json_extract(f.frontmatter, '$.subsystem') = :subsystem ORDER BY f.erstellt ASC`.

**`architect_summary`**: No required params. Aggregate query: subsystem count, ADR count, open question count, drift findings count. Use subqueries: `SELECT (SELECT COUNT(*) FROM node WHERE kind='phase_subsystem' AND status='aktiv') AS subsystem_count, (SELECT COUNT(*) FROM node WHERE kind='adr' AND status='aktiv') AS adr_count, (SELECT COUNT(*) FROM node WHERE kind='frage_knoten' AND status='aktiv' AND json_extract(frontmatter, '$.status')='offen') AS offene_fragen, (SELECT COUNT(*) FROM node WHERE kind='gate_befund' AND status='aktiv' AND json_extract(frontmatter, '$.gate_typ')='drift') AS drift_findings`.

**`risk_reviews`**: Optional `welle` param. `SELECT uid, title, frontmatter, erstellt FROM node WHERE kind = 'gate_befund' AND status = 'aktiv' AND json_extract(frontmatter, '$.gate_typ') = 'risk-review' ORDER BY erstellt DESC`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-queries.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/graph/query.ts tests/graph/phase4a-queries.test.ts
git commit -m "feat(graph): add 8 query templates for Architect/CF workflows (adr, contracts, coaching, risk)"
```

---

### Task 5: deriveProfile() graphAnbindung override

**Files:**
- Modify: `src/main/graph/access-profile.ts`
- Test: `tests/graph/phase4a-access-profile.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/graph/phase4a-access-profile.test.ts
import { describe, it, expect } from 'vitest'
import { deriveProfile } from '../../src/main/graph/access-profile'
import { RollenTyp } from '../../src/main/preset/schema'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import type { PresetRahmen } from '../../src/main/preset/schema'

function makeRahmen(overrides: Partial<PresetRahmen> = {}): PresetRahmen {
  return {
    id: 'test',
    name: 'Test',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['architecture'],
    capabilityAnbindung: ['cap-1'],
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: '',
    runtime: '',
    model: '',
    capabilityNiveau: CapabilityNiveau.A,
    harnessBindung: '',
    ...overrides,
  }
}

describe('deriveProfile — graphAnbindung override (DE-2)', () => {
  it('PhasenEntitaet with graphAnbindung lesen:true gets read:wide', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: true, schreiben: false },
    }))
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('phase-scoped')
  })

  it('PhasenEntitaet with graphAnbindung schreiben:true gets write:full', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: false, schreiben: true },
    }))
    expect(profile.write).toBe('full')
  })

  it('PhasenEntitaet with both lesen+schreiben true gets read:wide write:full', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: true, schreiben: true },
    }))
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })

  it('PhasenEntitaet with both false falls back to RollenTyp default', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.PhasenEntitaet,
      graphAnbindung: { lesen: false, schreiben: false },
    }))
    expect(profile.read).toBe('phase-scoped')
    expect(profile.write).toBe('phase-scoped')
  })

  it('QuerliegenSE ignores override (already wide/full)', () => {
    const profile = deriveProfile(makeRahmen({
      rollenTyp: RollenTyp.QuerliegenSE,
      graphAnbindung: { lesen: false, schreiben: false },
    }))
    // QuerliegenSE always gets wide/full regardless
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-access-profile.test.ts`
Expected: FAIL — PhasenEntitaet currently always returns phase-scoped

- [ ] **Step 3: Implement override logic**

In `src/main/graph/access-profile.ts`, modify `deriveProfile()`:

After the existing RollenTyp-based mapping, add a guard that checks `rahmen.graphAnbindung`:

```typescript
export function deriveProfile(rahmen: PresetRahmen): AccessProfile {
  // Start with RollenTyp default
  let profile: AccessProfile
  switch (rahmen.rollenTyp) {
    case RollenTyp.QuerliegenSE:
      return { read: 'wide', write: 'full' }  // always, no override
    case RollenTyp.QuerliegenCompanion:
      profile = { read: 'wide', write: 'phase-scoped', phasenScope: rahmen.phasenBindung }
      break
    case RollenTyp.PhasenEntitaet:
    case RollenTyp.BeauftragteInstanz:
      profile = { read: 'phase-scoped', write: 'phase-scoped', phasenScope: rahmen.phasenBindung }
      break
  }

  // DE-2: graphAnbindung override from PresetRahmen
  if (rahmen.graphAnbindung.lesen) {
    profile.read = 'wide'
  }
  if (rahmen.graphAnbindung.schreiben) {
    profile.write = 'full'
  }

  return profile
}
```

Note: QuerliegenSE returns early — it's already wide/full, override is irrelevant.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/graph/phase4a-access-profile.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite (check existing access-profile tests still pass)**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/graph/access-profile.ts tests/graph/phase4a-access-profile.test.ts
git commit -m "feat(graph): deriveProfile graphAnbindung override from PresetRahmen (DE-2)"
```

---

### Task 6: Rolling-Summary configs for Architect and CF

**Files:**
- Modify: `src/main/preset/shared/rolling-summary.ts`
- Test: `tests/phase4a-rolling-summary.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/phase4a-rolling-summary.test.ts
import { describe, it, expect } from 'vitest'
import {
  ARCHITECT_SUMMARY_CONFIG,
  CF_SUMMARY_CONFIG,
} from '../../src/main/preset/shared/rolling-summary'

describe('Phase 4a Rolling Summary Configs', () => {
  it('ARCHITECT_SUMMARY_CONFIG is pflicht', () => {
    expect(ARCHITECT_SUMMARY_CONFIG.pflicht).toBe(true)
  })

  it('ARCHITECT_SUMMARY_CONFIG has correct updateTriggers', () => {
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('coaching-antwort')
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('drift-befund')
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('adr-update')
    expect(ARCHITECT_SUMMARY_CONFIG.updateTriggers).toContain('welle-abschluss')
  })

  it('ARCHITECT_SUMMARY_CONFIG has correct summaryFields', () => {
    expect(ARCHITECT_SUMMARY_CONFIG.summaryFields).toEqual([
      'subsystem_status', 'aktive_adrs', 'offene_coaching', 'drift_findings',
    ])
  })

  it('CF_SUMMARY_CONFIG is not pflicht', () => {
    expect(CF_SUMMARY_CONFIG.pflicht).toBe(false)
  })

  it('CF_SUMMARY_CONFIG has autoActivateAfterWelle', () => {
    expect((CF_SUMMARY_CONFIG as any).autoActivateAfterWelle).toBe(3)
  })

  it('CF_SUMMARY_CONFIG has correct updateTriggers', () => {
    expect(CF_SUMMARY_CONFIG.updateTriggers).toContain('welle-abschluss')
    expect(CF_SUMMARY_CONFIG.updateTriggers).toContain('risk-review')
    expect(CF_SUMMARY_CONFIG.updateTriggers).toContain('worker-rotation')
  })

  it('CF_SUMMARY_CONFIG has correct summaryFields', () => {
    expect(CF_SUMMARY_CONFIG.summaryFields).toEqual([
      'wellen_abgeschlossen', 'aktive_worker', 'blockierte_subsysteme', 'offene_fragen',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/phase4a-rolling-summary.test.ts`
Expected: FAIL — exports not found

- [ ] **Step 3: Implement configs**

In `src/main/preset/shared/rolling-summary.ts`, add after the existing `WORKSHOP_SUMMARY_CONFIG`:

```typescript
export interface CfSummaryConfig extends RollingSummaryConfig {
  autoActivateAfterWelle: number
}

export const ARCHITECT_SUMMARY_CONFIG: RollingSummaryConfig = {
  pflicht: true,
  updateTriggers: ['coaching-antwort', 'drift-befund', 'adr-update', 'welle-abschluss'],
  summaryFields: ['subsystem_status', 'aktive_adrs', 'offene_coaching', 'drift_findings'],
}

export const CF_SUMMARY_CONFIG: CfSummaryConfig = {
  pflicht: false,
  autoActivateAfterWelle: 3,
  updateTriggers: ['welle-abschluss', 'risk-review', 'worker-rotation'],
  summaryFields: ['wellen_abgeschlossen', 'aktive_worker', 'blockierte_subsysteme', 'offene_fragen'],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/phase4a-rolling-summary.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/preset/shared/rolling-summary.ts tests/phase4a-rolling-summary.test.ts
git commit -m "feat(preset): add ARCHITECT_SUMMARY_CONFIG and CF_SUMMARY_CONFIG (CK-P3A-008, CK-P3CF-012)"
```

---

## Sub-Phase 4b: Architect Preset

### Task 7: Architect preset registration

**Files:**
- Create: `src/main/preset/architect/architect-preset.ts`
- Test: `tests/preset/architect/architect-preset.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/architect/architect-preset.test.ts
import { describe, it, expect } from 'vitest'
import {
  ARCHITECT_CAPABILITIES,
  ARCHITECT_RAHMEN,
  createArchitectRahmen,
  getArchitectMaxSubsystems,
} from '../../../src/main/preset/architect/architect-preset'
import { validatePresetRahmen, RollenTyp } from '../../../src/main/preset/schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('Architect Preset Registration (CK-P3A-001)', () => {
  it('ARCHITECT_RAHMEN validates against schema', () => {
    const result = validatePresetRahmen(ARCHITECT_RAHMEN)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('has correct id and name', () => {
    expect(ARCHITECT_RAHMEN.id).toBe('architect')
    expect(ARCHITECT_RAHMEN.name).toBe('Architect')
  })

  it('is PhasenEntitaet bound to architecture', () => {
    expect(ARCHITECT_RAHMEN.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
    expect(ARCHITECT_RAHMEN.phasenBindung).toEqual(['architecture'])
  })

  it('has graphAnbindung lesen+schreiben both true', () => {
    expect(ARCHITECT_RAHMEN.graphAnbindung).toEqual({ lesen: true, schreiben: true })
  })

  it('uses theaitetos persona', () => {
    expect(ARCHITECT_RAHMEN.personaVorgabe).toBe('theaitetos')
  })

  it('defaults to heavy model (Opus)', () => {
    expect(ARCHITECT_RAHMEN.model).toBe('heavy')
  })

  it('defaults to Niveau A', () => {
    expect(ARCHITECT_RAHMEN.capabilityNiveau).toBe(CapabilityNiveau.A)
  })

  it('has 7 capability packages', () => {
    expect(ARCHITECT_CAPABILITIES).toHaveLength(7)
    expect(ARCHITECT_CAPABILITIES).toContain('architect-core-identity')
    expect(ARCHITECT_CAPABILITIES).toContain('subsystem-zerlegung-guide')
    expect(ARCHITECT_CAPABILITIES).toContain('adr-format-guide')
    expect(ARCHITECT_CAPABILITIES).toContain('anforderungspaket-formulierer')
    expect(ARCHITECT_CAPABILITIES).toContain('niveau-c-formulierer')
    expect(ARCHITECT_CAPABILITIES).toContain('coaching-loop-guide')
    expect(ARCHITECT_CAPABILITIES).toContain('rolling-summary')
  })
})

describe('Architect Niveau differentiation (CK-P3A-012, CK-P3A-014)', () => {
  it('Niveau A gets all 7 capabilities', () => {
    const rahmen = createArchitectRahmen(CapabilityNiveau.A)
    expect(rahmen.capabilityAnbindung).toHaveLength(7)
    expect(rahmen.model).toBe('heavy')
  })

  it('Niveau B gets 5 capabilities (no coaching-loop-guide, no rolling-summary)', () => {
    const rahmen = createArchitectRahmen(CapabilityNiveau.B)
    expect(rahmen.capabilityAnbindung).toHaveLength(5)
    expect(rahmen.capabilityAnbindung).not.toContain('coaching-loop-guide')
    expect(rahmen.capabilityAnbindung).not.toContain('rolling-summary')
    expect(rahmen.model).toBe('')  // standard = empty
  })

  it('Niveau C gets 1 capability (architect-core-identity only)', () => {
    const rahmen = createArchitectRahmen(CapabilityNiveau.C)
    expect(rahmen.capabilityAnbindung).toHaveLength(1)
    expect(rahmen.capabilityAnbindung).toContain('architect-core-identity')
  })

  it('Niveau A has unlimited subsystems', () => {
    expect(getArchitectMaxSubsystems(CapabilityNiveau.A)).toBeNull()
  })

  it('Niveau B has max 3 subsystems', () => {
    expect(getArchitectMaxSubsystems(CapabilityNiveau.B)).toBe(3)
  })

  it('Niveau C has max 1 subsystem', () => {
    expect(getArchitectMaxSubsystems(CapabilityNiveau.C)).toBe(1)
  })

  it('all niveau configs validate against schema', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      const result = validatePresetRahmen(createArchitectRahmen(n))
      expect(result.valid).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-preset.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement architect-preset.ts**

```typescript
// src/main/preset/architect/architect-preset.ts
/**
 * Architect Preset — long-running subsystem architecture lead.
 *
 * PhasenEntitaet bound to 'architecture' phase with graphAnbindung override
 * (read wide, write full via DE-2). Model heavy (Opus) at Niveau A,
 * standard at Niveau B. Extended lifecycle across all build waves.
 *
 * CK-P3A-001, CK-P3A-012, CK-P3A-014
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'

/** Seven capability packages for the Architect (CK-P3A-012). */
export const ARCHITECT_CAPABILITIES = [
  'architect-core-identity',
  'subsystem-zerlegung-guide',
  'adr-format-guide',
  'anforderungspaket-formulierer',
  'niveau-c-formulierer',
  'coaching-loop-guide',
  'rolling-summary',
] as const

export type ArchitectCapabilityName = (typeof ARCHITECT_CAPABILITIES)[number]

/** Niveau B: 5 capabilities (no coaching-loop-guide, no rolling-summary). CK-P3A-014 */
const NIVEAU_B_CAPABILITIES: string[] = [
  'architect-core-identity',
  'subsystem-zerlegung-guide',
  'adr-format-guide',
  'anforderungspaket-formulierer',
  'niveau-c-formulierer',
]

/** Niveau C: 1 capability (core identity with inline schnittstellen-stempel). CK-P3A-009 */
const NIVEAU_C_CAPABILITIES: string[] = [
  'architect-core-identity',
]

/** Default Rahmen at Niveau A. CK-P3A-001 */
export const ARCHITECT_RAHMEN: PresetRahmen = {
  id: 'architect',
  name: 'Architect',
  rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: ['architecture'],
  capabilityAnbindung: [...ARCHITECT_CAPABILITIES],
  graphAnbindung: { lesen: true, schreiben: true },
  personaVorgabe: 'theaitetos',
  runtime: 'claude-cli-tmux',
  model: 'heavy',
  capabilityNiveau: CapabilityNiveau.A,
  harnessBindung: '',
}

/**
 * Create a PresetRahmen for the Architect at the given niveau.
 * CK-P3A-012, CK-P3A-014
 */
export function createArchitectRahmen(niveau: CapabilityNiveau): PresetRahmen {
  const caps = niveau === CapabilityNiveau.A
    ? [...ARCHITECT_CAPABILITIES]
    : niveau === CapabilityNiveau.B
      ? NIVEAU_B_CAPABILITIES
      : NIVEAU_C_CAPABILITIES

  return {
    id: 'architect',
    name: 'Architect',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['architecture'],
    capabilityAnbindung: caps,
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'theaitetos',
    runtime: 'claude-cli-tmux',
    model: niveau === CapabilityNiveau.A ? 'heavy' : '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}

/** Max subsystems per niveau. CK-P3A-014, CK-P3A-009 */
export function getArchitectMaxSubsystems(niveau: CapabilityNiveau): number | null {
  if (niveau === CapabilityNiveau.A) return null  // unlimited
  if (niveau === CapabilityNiveau.B) return 3
  return 1  // Niveau C: Schnittstellen-Stempel-Modus
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-preset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/architect/architect-preset.ts tests/preset/architect/architect-preset.test.ts
git commit -m "feat(preset): Architect preset registration with niveau differentiation (CK-P3A-001, 012, 014)"
```

---

### Task 8: Architect capability packages

**Files:**
- Create: `src/main/preset/architect/architect-capabilities.ts`
- Test: `tests/preset/architect/architect-capabilities.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/architect/architect-capabilities.test.ts
import { describe, it, expect } from 'vitest'
import { getArchitectCapabilities } from '../../../src/main/preset/architect/architect-capabilities'
import { validateCapabilityPackage } from '../../../src/main/preset/capability-schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'
import { lintCapabilities, warnOversizedPackages } from '../../../src/main/preset/capability-lint'
import { LoaderType } from '../../../src/main/preset/capability-schema'

describe('Architect Capabilities (CK-P3A-012)', () => {
  it('returns 7 packages for Niveau A', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.A)
    expect(pkgs).toHaveLength(7)
  })

  it('returns 5 packages for Niveau B', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.B)
    expect(pkgs).toHaveLength(5)
    const names = pkgs.map(p => p.name)
    expect(names).not.toContain('coaching-loop-guide')
    expect(names).not.toContain('rolling-summary')
  })

  it('returns 1 package for Niveau C', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.C)
    expect(pkgs).toHaveLength(1)
    expect(pkgs[0].name).toBe('architect-core-identity')
    expect(pkgs[0].loader).toBe(LoaderType.Inline)
  })

  it('all packages validate', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.A)
    for (const pkg of pkgs) {
      const result = validateCapabilityPackage(pkg)
      expect(result.valid).toBe(true)
    }
  })

  it('no dependency lint errors at Niveau A', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.A)
    const errors = lintCapabilities(pkgs)
    expect(errors).toHaveLength(0)
  })

  it('Niveau C inline package under 800 tokens', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.C)
    const contents = pkgs.map(p => ({ name: p.name, content: p.niveauCExtrakt ?? '' }))
    const warnings = warnOversizedPackages(contents, 'C')
    expect(warnings).toHaveLength(0)
  })

  it('architect-core-identity has Niveau C extrakt including schnittstellen-stempel', () => {
    const pkgs = getArchitectCapabilities(CapabilityNiveau.C)
    const core = pkgs.find(p => p.name === 'architect-core-identity')!
    expect(core.niveauCExtrakt).toBeDefined()
    expect(core.niveauCExtrakt).toContain('Schnittstellen')
  })

  it('niveau-c-formulierer is default-activated on A and B (CK-P3A-011)', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B]) {
      const pkgs = getArchitectCapabilities(n)
      const names = pkgs.map(p => p.name)
      expect(names).toContain('niveau-c-formulierer')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-capabilities.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement architect-capabilities.ts**

```typescript
// src/main/preset/architect/architect-capabilities.ts
/**
 * Architect Capability Packages — differentiated by niveau.
 *
 * A: 7 packages (skill-md lazy-loading)
 * B: 5 packages (no coaching-loop-guide, no rolling-summary)
 * C: 1 package (inline, architect-core-identity + schnittstellen-stempel, ≤800 tokens)
 *
 * CK-P3A-011, CK-P3A-012
 */

import { CapabilityNiveau } from '../niveau'
import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

const CORE_IDENTITY_C_EXTRAKT = [
  '# Architect (Niveau C — Schnittstellen-Stempel-Modus)',
  '',
  'Du bist der Architect. Auf Niveau C bist du auf Ein-Subsystem-Fälle reduziert.',
  'Liefere einen einzelnen Schnittstellen-Vertrag (Input/Output des Gesamtsystems)',
  'und ein einzelnes Anforderungspaket. Keine ADRs, kein Coaching-Loop.',
  '',
  '## Schnittstellen-Stempel',
  '',
  'Erstelle einen schnittstellen_vertrag-Knoten mit:',
  '- input_schema: Input-Typen und Format',
  '- output_schema: Output-Typen und Format',
  '- fehlerverhalten: Fehlerfälle und Reaktionen',
  '',
  '## Negative Grenzen',
  '',
  '1. Kein produktiver Code (Pseudocode erlaubt)',
  '2. Keine Welle-Planung',
  '3. Keine Anforderungs-Schärfung',
].join('\n')

/** All 7 architect capability packages. */
const ALL_PACKAGES: CapabilityPackage[] = [
  {
    name: 'architect-core-identity',
    beschreibung: 'Kern-Identität und Auftrag des Architect-Presets',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/architect-core-identity/SKILL.md',
    niveauCExtrakt: CORE_IDENTITY_C_EXTRAKT,
  },
  {
    name: 'subsystem-zerlegung-guide',
    beschreibung: 'Anleitung zur Subsystem-Zerlegung mit Schnittstellen-Verträgen',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/subsystem-zerlegung-guide/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'adr-format-guide',
    beschreibung: 'ADR-Format mit Tiefe-Stufen für Niveau-Bedienung',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/adr-format-guide/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'anforderungspaket-formulierer',
    beschreibung: 'Granulare Anforderungspakete pro Worker formulieren',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/anforderungspaket-formulierer/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'niveau-c-formulierer',
    beschreibung: 'Outputs auf Niveau-C-taugliche Formen reduzieren (Pflicht)',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/niveau-c-formulierer/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'coaching-loop-guide',
    beschreibung: 'Frage/Antwort-Coaching-Loop im Graph während des Baus',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/coaching-loop-guide/SKILL.md',
    niveauMinimum: 'A',
  },
  {
    name: 'rolling-summary',
    beschreibung: 'Rolling Summary für Architect-State über Wellen hinweg',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/rolling-summary/SKILL.md',
    niveauMinimum: 'A',
  },
]

/**
 * Returns the capability packages for a given niveau.
 * Niveau A: all 7. Niveau B: 5 (filtered by niveauMinimum). Niveau C: 1 (inline).
 */
export function getArchitectCapabilities(niveau: CapabilityNiveau): CapabilityPackage[] {
  if (niveau === CapabilityNiveau.C) {
    return [{
      ...ALL_PACKAGES[0],
      loader: LoaderType.Inline,
      pfad: '',
    }]
  }

  return ALL_PACKAGES.filter(pkg => {
    if (!pkg.niveauMinimum) return true
    if (niveau === CapabilityNiveau.A) return true
    if (niveau === CapabilityNiveau.B) return pkg.niveauMinimum !== 'A'
    return false
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/architect/architect-capabilities.ts tests/preset/architect/architect-capabilities.test.ts
git commit -m "feat(preset): Architect capability packages with niveau differentiation (CK-P3A-011, CK-P3A-012)"
```

---

### Task 9: Architect boundary check in capability-lint

**Files:**
- Modify: `src/main/preset/capability-lint.ts`
- Test: `tests/preset/architect/architect-boundary.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/architect/architect-boundary.test.ts
import { describe, it, expect } from 'vitest'
import { checkArchitectBoundary, checkCfBoundary } from '../../../src/main/preset/capability-lint'

describe('Architect Boundary Check (CK-P3A-013)', () => {
  it('returns warning for .ts file write', () => {
    const results = checkArchitectBoundary(['src/auth/login.ts'])
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('warning')
    expect(results[0].message).toContain('produktiver Code')
  })

  it('returns warning for .tsx file write', () => {
    const results = checkArchitectBoundary(['src/components/App.tsx'])
    expect(results).toHaveLength(1)
  })

  it('no warning for .md file write', () => {
    const results = checkArchitectBoundary(['docs/adr-001.md'])
    expect(results).toHaveLength(0)
  })

  it('no warning for empty file list', () => {
    const results = checkArchitectBoundary([])
    expect(results).toHaveLength(0)
  })

  it('multiple code files produce multiple warnings', () => {
    const results = checkArchitectBoundary(['a.ts', 'b.js', 'c.py'])
    expect(results).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-boundary.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement boundary check functions**

In `src/main/preset/capability-lint.ts`, add:

```typescript
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h'])

/**
 * Check if an Architect session wrote productive code files.
 * Returns warnings (not errors) for each code file. CK-P3A-013
 */
export function checkArchitectBoundary(writtenFiles: string[]): LintResult[] {
  return writtenFiles
    .filter(f => {
      const ext = f.slice(f.lastIndexOf('.'))
      return CODE_EXTENSIONS.has(ext)
    })
    .map(f => ({
      packageName: 'architect-boundary',
      severity: 'warning' as const,
      message: `Architect hat produktiver Code geschrieben: ${f}. Pseudocode und Signaturen erlaubt, produktiver Code verboten.`,
    }))
}

/**
 * Check if a CF session modified architecture-owned node kinds.
 * Returns warnings for each violation. CK-P3CF-011
 */
export function checkCfBoundary(writtenNodeKinds: string[]): LintResult[] {
  const FORBIDDEN = new Set(['schnittstellen_vertrag', 'adr'])
  return writtenNodeKinds
    .filter(k => FORBIDDEN.has(k))
    .map(k => ({
      packageName: 'cf-boundary',
      severity: 'warning' as const,
      message: `CF hat ${k}-Knoten geschrieben/geändert. Architektur-Artefakte sind Architect-Territorium.`,
    }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-boundary.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/preset/capability-lint.ts tests/preset/architect/architect-boundary.test.ts
git commit -m "feat(preset): boundary check for Architect and CF presets (CK-P3A-013, CK-P3CF-011)"
```

---

### Task 10: Architect body markdown

**Files:**
- Create: `src/main/preset/architect/architect-body.md`
- Test: `tests/preset/architect/architect-body.test.ts`

- [ ] **Step 1: Write tests that verify body structure**

```typescript
// tests/preset/architect/architect-body.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/architect/architect-body.md')

describe('Architect Body (CK-P3A-001, CK-P3A-013)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains Negative Grenzen section', () => {
    expect(body).toContain('## Negative Grenzen')
  })

  it('mentions kein produktiver Code', () => {
    expect(body).toMatch(/kein.*produktiver.*Code/i)
  })

  it('mentions keine Welle-Planung', () => {
    expect(body).toMatch(/keine.*Welle.*Planung/i)
  })

  it('mentions keine Anforderungs-Schaerfung', () => {
    expect(body).toMatch(/keine.*Anforderungs/i)
  })

  it('contains role identity section', () => {
    expect(body).toContain('Architect')
  })

  it('contains Schnittstellen-Stempel hint for Niveau C (CK-P3A-009)', () => {
    expect(body).toContain('Bedienhilfe-Modus')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-body.test.ts`
Expected: FAIL — file not found

- [ ] **Step 3: Create architect-body.md**

```markdown
# Architect

Du bist der Architect — der langlaufende Subsystem-Architektur-Lead. Du zerlegst Systeme
in traegliche Subsysteme, definierst Schnittstellen-Vertraege, lieferst Architecture Decision
Records (ADRs) und formulierst granulare Anforderungspakete fuer CF-Worker.

Du bleibst ueber alle Bau-Wellen im Loop (extended-Betrieb). Du bist nicht fire-and-forget.

## Kernaufgaben

1. **Subsystem-Zerlegung**: System in Blackbox-Module zerlegen, Schnittstellen-Vertraege definieren
2. **ADRs**: Nicht-triviale Entscheidungen als ADR-Knoten im Graph (Kontext-Optionen-Entscheidung-Konsequenzen)
3. **Anforderungspakete**: Pro Subsystem granulare Pakete (max 1000 Tokens fuer Niveau C)
4. **Coaching**: Frage-Knoten der CF-Worker beantworten, Drift-Signale erkennen
5. **Abhaengigkeits-Kanten**: Bau-Reihenfolge der Subsysteme festlegen
6. **Uebergabe**: Am Ende des Bau-Zyklus das Uebergabe-Dokument an den SE liefern

## Arbeitsablauf

1. Zerlegung durchfuehren → phase_subsystem-Knoten + schnittstellen_vertrag-Knoten
2. ADRs fuer nicht-triviale Entscheidungen anlegen
3. Abhaengigkeits-Kanten zwischen Subsystemen setzen (haengt_ab_von)
4. Pro Subsystem ein Anforderungspaket schnueren
5. Waehrend des Baus: offene_fragen-Query pruefen, Antwort-Knoten schreiben
6. Bei Drift: gate_befund-Knoten mit gate_typ 'drift' schreiben
7. Am Ende: Uebergabe-Dokument an SE (Subsystem-Ueberblick, ADR-Index, offene Punkte)

## Negative Grenzen

1. **Kein produktiver Code.** Pseudocode und Schnittstellen-Signaturen sind erlaubt,
   implementierungsfertiger Code ist verboten.
2. **Keine Welle-Planung.** Bau-Logistik ist CF-Territorium. Du legst Abhaengigkeiten fest,
   die CF bestimmt Wellen-Struktur und Worker-Kapazitaet.
3. **Keine Anforderungs-Schaerfung.** Anforderungen kommen aus dem Refinement,
   nicht vom Architect. Du formulierst Pakete aus bestehenden Anforderungen.

## Niveau-Hinweise

- **Niveau A**: Volles Capability-Set, unbegrenzte Subsysteme, Coaching-Loop aktiv
- **Niveau B**: 5 Kern-Capabilities, max 3 Subsysteme, ADRs in Kurzform, kein Coaching
- **Niveau C**: Bedienhilfe-Modus, nicht als vollwertige Architektur empfohlen.
  Ein Subsystem, ein Vertrag, ein Paket. Kein Coaching, keine ADRs.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/architect/architect-body.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/architect/architect-body.md tests/preset/architect/architect-body.test.ts
git commit -m "feat(preset): Architect body with negative boundaries and niveau hints (CK-P3A-001, 009, 013)"
```

---

## Sub-Phase 4c: Cyber Factory Preset

### Task 11: CF preset registration

**Files:**
- Create: `src/main/preset/cyber-factory/cf-preset.ts`
- Test: `tests/preset/cyber-factory/cf-preset.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-preset.test.ts
import { describe, it, expect } from 'vitest'
import {
  CF_CAPABILITIES,
  CF_RAHMEN,
  createCfRahmen,
  getCfMaxWorkers,
} from '../../../src/main/preset/cyber-factory/cf-preset'
import { validatePresetRahmen, RollenTyp } from '../../../src/main/preset/schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('CF Preset Registration (CK-P3CF-001)', () => {
  it('CF_RAHMEN validates against schema', () => {
    const result = validatePresetRahmen(CF_RAHMEN)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('has correct id and name', () => {
    expect(CF_RAHMEN.id).toBe('cyber-factory')
    expect(CF_RAHMEN.name).toBe('Cyber Factory')
  })

  it('is PhasenEntitaet bound to development', () => {
    expect(CF_RAHMEN.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
    expect(CF_RAHMEN.phasenBindung).toEqual(['development'])
  })

  it('has graphAnbindung lesen+schreiben both true', () => {
    expect(CF_RAHMEN.graphAnbindung).toEqual({ lesen: true, schreiben: true })
  })

  it('uses cipher persona', () => {
    expect(CF_RAHMEN.personaVorgabe).toBe('cipher')
  })

  it('defaults to standard model (Sonnet)', () => {
    expect(CF_RAHMEN.model).toBe('')  // empty = harness default = Sonnet
  })

  it('has 8 capability packages', () => {
    expect(CF_CAPABILITIES).toHaveLength(8)
  })
})

describe('CF Niveau differentiation (CK-P3CF-008, CK-P3CF-010)', () => {
  it('Niveau A gets all 8 capabilities', () => {
    const rahmen = createCfRahmen(CapabilityNiveau.A)
    expect(rahmen.capabilityAnbindung).toHaveLength(8)
  })

  it('Niveau B gets 5 capabilities', () => {
    const rahmen = createCfRahmen(CapabilityNiveau.B)
    expect(rahmen.capabilityAnbindung).toHaveLength(5)
    const names = rahmen.capabilityAnbindung
    expect(names).not.toContain('model-routing-guide')
    expect(names).not.toContain('risk-review-guide')
    expect(names).not.toContain('graph-navigation')
  })

  it('Niveau C gets 1 capability (cf-core-identity)', () => {
    const rahmen = createCfRahmen(CapabilityNiveau.C)
    expect(rahmen.capabilityAnbindung).toHaveLength(1)
    expect(rahmen.capabilityAnbindung[0]).toBe('cf-core-identity')
  })

  it('Niveau A max 5 workers', () => {
    expect(getCfMaxWorkers(CapabilityNiveau.A)).toBe(5)
  })

  it('Niveau B max 2 workers', () => {
    expect(getCfMaxWorkers(CapabilityNiveau.B)).toBe(2)
  })

  it('Niveau C max 1 worker (self)', () => {
    expect(getCfMaxWorkers(CapabilityNiveau.C)).toBe(1)
  })

  it('all niveau configs validate', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      const result = validatePresetRahmen(createCfRahmen(n))
      expect(result.valid).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-preset.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-preset.ts**

```typescript
// src/main/preset/cyber-factory/cf-preset.ts
/**
 * CF Preset — lean wave build master.
 *
 * PhasenEntitaet bound to 'development' with orchestrierung=true.
 * Consumes Architect decomposition as fixed input, plans build waves,
 * orchestrates parallel worker sessions.
 *
 * CK-P3CF-001, CK-P3CF-008, CK-P3CF-010
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'

/** Eight capability packages for the CF (CK-P3CF-010). */
export const CF_CAPABILITIES = [
  'cf-core-identity',
  'welle-plan-guide',
  'worker-startup-protokoll',
  'model-routing-guide',
  'risk-review-guide',
  'welle-plan-granularisierer',
  'rueckweg-protokoll',
  'graph-navigation',
] as const

export type CfCapabilityName = (typeof CF_CAPABILITIES)[number]

const NIVEAU_B_CAPABILITIES: string[] = [
  'cf-core-identity',
  'welle-plan-guide',
  'worker-startup-protokoll',
  'welle-plan-granularisierer',
  'rueckweg-protokoll',
]

const NIVEAU_C_CAPABILITIES: string[] = [
  'cf-core-identity',
]

/** Default Rahmen at Niveau A. CK-P3CF-001 */
export const CF_RAHMEN: PresetRahmen = {
  id: 'cyber-factory',
  name: 'Cyber Factory',
  rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: ['development'],
  capabilityAnbindung: [...CF_CAPABILITIES],
  graphAnbindung: { lesen: true, schreiben: true },
  personaVorgabe: 'cipher',
  runtime: 'claude-cli-tmux',
  model: '',  // standard = empty = Sonnet-class
  capabilityNiveau: CapabilityNiveau.A,
  harnessBindung: '',
}

export function createCfRahmen(niveau: CapabilityNiveau): PresetRahmen {
  const caps = niveau === CapabilityNiveau.A
    ? [...CF_CAPABILITIES]
    : niveau === CapabilityNiveau.B
      ? NIVEAU_B_CAPABILITIES
      : NIVEAU_C_CAPABILITIES

  return {
    id: 'cyber-factory',
    name: niveau === CapabilityNiveau.C ? 'Development-Worker-Modus' : 'Cyber Factory',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['development'],
    capabilityAnbindung: caps,
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'cipher',
    runtime: 'claude-cli-tmux',
    model: '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}

export function getCfMaxWorkers(niveau: CapabilityNiveau): number {
  if (niveau === CapabilityNiveau.A) return 5
  if (niveau === CapabilityNiveau.B) return 2
  return 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-preset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-preset.ts tests/preset/cyber-factory/cf-preset.test.ts
git commit -m "feat(preset): CF preset registration with niveau differentiation (CK-P3CF-001, 008, 010)"
```

---

### Task 12: CF capability packages

**Files:**
- Create: `src/main/preset/cyber-factory/cf-capabilities.ts`
- Test: `tests/preset/cyber-factory/cf-capabilities.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-capabilities.test.ts
import { describe, it, expect } from 'vitest'
import { getCfCapabilities } from '../../../src/main/preset/cyber-factory/cf-capabilities'
import { validateCapabilityPackage, LoaderType } from '../../../src/main/preset/capability-schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'
import { lintCapabilities, warnOversizedPackages } from '../../../src/main/preset/capability-lint'

describe('CF Capabilities (CK-P3CF-010)', () => {
  it('returns 8 packages for Niveau A', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.A)
    expect(pkgs).toHaveLength(8)
  })

  it('returns 5 packages for Niveau B', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.B)
    expect(pkgs).toHaveLength(5)
    const names = pkgs.map(p => p.name)
    expect(names).not.toContain('model-routing-guide')
    expect(names).not.toContain('risk-review-guide')
    expect(names).not.toContain('graph-navigation')
  })

  it('returns 1 package for Niveau C', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.C)
    expect(pkgs).toHaveLength(1)
    expect(pkgs[0].name).toBe('cf-core-identity')
    expect(pkgs[0].loader).toBe(LoaderType.Inline)
  })

  it('all packages validate', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.A)
    for (const pkg of pkgs) {
      const result = validateCapabilityPackage(pkg)
      expect(result.valid).toBe(true)
    }
  })

  it('no lint errors at Niveau A', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.A)
    expect(lintCapabilities(pkgs)).toHaveLength(0)
  })

  it('Niveau C inline under 500 tokens', () => {
    const pkgs = getCfCapabilities(CapabilityNiveau.C)
    const contents = pkgs.map(p => ({ name: p.name, content: p.niveauCExtrakt ?? '' }))
    const warnings = warnOversizedPackages(contents, 'C')
    expect(warnings).toHaveLength(0)
  })

  it('welle-plan-granularisierer present on A and B (CK-P3CF-007)', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B]) {
      const names = getCfCapabilities(n).map(p => p.name)
      expect(names).toContain('welle-plan-granularisierer')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-capabilities.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-capabilities.ts**

Follow the same pattern as `architect-capabilities.ts`. Define all 8 packages with `LoaderType.SkillMd`, set `niveauMinimum` for A-only packages (`model-routing-guide`, `risk-review-guide`, `graph-navigation`). `cf-core-identity` gets a `niveauCExtrakt` (≤500 tokens) describing Development-Worker-Modus: structured coding agent, no orchestration, no wave planning, reads anforderungspaket and implements directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-capabilities.ts tests/preset/cyber-factory/cf-capabilities.test.ts
git commit -m "feat(preset): CF capability packages with niveau differentiation (CK-P3CF-007, CK-P3CF-010)"
```

---

### Task 13: CF wave plan logic

**Files:**
- Create: `src/main/preset/cyber-factory/cf-welle-plan.ts`
- Test: `tests/preset/cyber-factory/cf-welle-plan.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-welle-plan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../../src/main/graph/db'
import { GraphWriter } from '../../../src/main/graph/writer'
import { buildWellePlan } from '../../../src/main/preset/cyber-factory/cf-welle-plan'
import type Database from 'better-sqlite3'

describe('CF Welle Plan (CK-P3CF-002)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  function createSubsystem(name: string, path: string) {
    return writer.upsertNode({
      kind: 'phase_subsystem', title: name, path,
      frontmatter: { scope: name.toLowerCase() },
    })
  }

  function createDependency(from: string, to: string) {
    writer.linkEdge({ src: from, dst: to, type: 'haengt_ab_von' })
  }

  function createPackage(subsystemUid: string, title: string, path: string) {
    writer.upsertNode({
      kind: 'anforderungspaket', title, path,
      frontmatter: {
        subsystem: subsystemUid, req_ids: ['R-1'], code_anker: ['src/x.ts'],
        akzeptanzkriterium: 'Works', testcase_verweis: 'T-1',
      },
    })
  }

  it('builds single-wave plan for independent subsystems', () => {
    const a = createSubsystem('Auth', '/sub/auth')
    const b = createSubsystem('DB', '/sub/db')
    createPackage(a.uid, 'Auth Pkg', '/pkg/auth')
    createPackage(b.uid, 'DB Pkg', '/pkg/db')

    const plan = buildWellePlan(db, 5)
    expect(plan.wellen).toHaveLength(1)
    expect(plan.wellen[0].slots).toHaveLength(2)
  })

  it('respects dependencies — dependent subsystem in later wave', () => {
    const a = createSubsystem('Foundation', '/sub/found')
    const b = createSubsystem('Business', '/sub/biz')
    createDependency(b.uid, a.uid)  // Business depends on Foundation
    createPackage(a.uid, 'Found Pkg', '/pkg/found')
    createPackage(b.uid, 'Biz Pkg', '/pkg/biz')

    const plan = buildWellePlan(db, 5)
    expect(plan.wellen).toHaveLength(2)
    // Foundation in wave 1, Business in wave 2
    expect(plan.wellen[0].slots.some(s => s.subsystemTitle === 'Foundation')).toBe(true)
    expect(plan.wellen[1].slots.some(s => s.subsystemTitle === 'Business')).toBe(true)
  })

  it('respects max workers capacity', () => {
    const subs = Array.from({ length: 4 }, (_, i) =>
      createSubsystem(`Sub${i}`, `/sub/s${i}`)
    )
    for (const s of subs) createPackage(s.uid, `Pkg ${s.uid}`, `/pkg/${s.uid}`)

    const plan = buildWellePlan(db, 2)  // max 2 workers
    expect(plan.wellen).toHaveLength(2)
    expect(plan.wellen[0].slots).toHaveLength(2)
    expect(plan.wellen[1].slots).toHaveLength(2)
  })

  it('returns empty plan when no subsystems exist', () => {
    const plan = buildWellePlan(db, 5)
    expect(plan.wellen).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-welle-plan.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-welle-plan.ts**

```typescript
// src/main/preset/cyber-factory/cf-welle-plan.ts
/**
 * CF Wave Plan — topological sort of subsystems into build waves.
 *
 * Consumes Architect decomposition (subsystem nodes + haengt_ab_von edges +
 * anforderungspaket nodes) as fixed input. CK-P3CF-002
 */

import { graphQuery } from '../../graph/query'
import type Database from 'better-sqlite3'

export interface WelleSlot {
  subsystemUid: string
  subsystemTitle: string
  anforderungspaketUid: string | null
}

export interface Welle {
  index: number
  slots: WelleSlot[]
}

export interface WellePlan {
  wellen: Welle[]
}

export function buildWellePlan(db: Database.Database, maxWorkers: number): WellePlan {
  // 1. Get all subsystems
  const subsResult = graphQuery(db, { template: 'subsystem_list' })
  if (subsResult.count === 0) return { wellen: [] }

  // 2. Get dependencies (topological order)
  const depsResult = graphQuery(db, { template: 'subsystem_dependencies' })

  // Build adjacency: who depends on whom
  const dependsOn = new Map<string, Set<string>>()
  const allUids = new Set<string>()

  for (const row of subsResult.rows) {
    const uid = row.uid as string
    allUids.add(uid)
    dependsOn.set(uid, new Set())
  }

  for (const row of depsResult.rows) {
    const src = row.uid as string
    const dep = row.dependency_uid as string
    if (dep && dependsOn.has(src)) {
      dependsOn.get(src)!.add(dep)
    }
  }

  // 3. Get anforderungspakete per subsystem
  const pkgResult = graphQuery(db, { template: 'anforderungspakete' })
  const pkgBySubsystem = new Map<string, string>()
  for (const row of pkgResult.rows) {
    const fm = typeof row.frontmatter === 'string' ? JSON.parse(row.frontmatter) : row.frontmatter
    if (fm.subsystem) {
      pkgBySubsystem.set(fm.subsystem, row.uid as string)
    }
  }

  // Title lookup
  const titleMap = new Map<string, string>()
  for (const row of subsResult.rows) {
    titleMap.set(row.uid as string, row.title as string)
  }

  // 4. Topological sort into layers (Kahn's algorithm)
  const inDegree = new Map<string, number>()
  for (const uid of allUids) inDegree.set(uid, 0)
  for (const [uid, deps] of dependsOn) {
    inDegree.set(uid, deps.size)
  }

  const layers: string[][] = []
  const remaining = new Set(allUids)

  while (remaining.size > 0) {
    const layer: string[] = []
    for (const uid of remaining) {
      if (inDegree.get(uid) === 0) layer.push(uid)
    }
    if (layer.length === 0) break  // cycle — break to avoid infinite loop

    for (const uid of layer) remaining.delete(uid)
    // Decrease in-degree of dependents
    for (const uid of remaining) {
      const deps = dependsOn.get(uid)!
      for (const resolved of layer) {
        if (deps.has(resolved)) {
          deps.delete(resolved)
          inDegree.set(uid, (inDegree.get(uid) ?? 1) - 1)
        }
      }
    }
    layers.push(layer)
  }

  // 5. Split layers by maxWorkers
  const wellen: Welle[] = []
  let welleIndex = 0
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i += maxWorkers) {
      const chunk = layer.slice(i, i + maxWorkers)
      wellen.push({
        index: welleIndex++,
        slots: chunk.map(uid => ({
          subsystemUid: uid,
          subsystemTitle: titleMap.get(uid) ?? uid,
          anforderungspaketUid: pkgBySubsystem.get(uid) ?? null,
        })),
      })
    }
  }

  return { wellen }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-welle-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-welle-plan.ts tests/preset/cyber-factory/cf-welle-plan.test.ts
git commit -m "feat(preset): CF wave plan with topological sort and worker capacity (CK-P3CF-002)"
```

---

### Task 14: CF model routing

**Files:**
- Create: `src/main/preset/cyber-factory/cf-model-routing.ts`
- Test: `tests/preset/cyber-factory/cf-model-routing.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-model-routing.test.ts
import { describe, it, expect } from 'vitest'
import { routeModel } from '../../../src/main/preset/cyber-factory/cf-model-routing'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('CF Model Routing (CK-P3CF-004)', () => {
  it('Niveau A: trivial → light', () => {
    expect(routeModel('trivial', CapabilityNiveau.A)).toBe('light')
  })

  it('Niveau A: business_logic → standard', () => {
    expect(routeModel('business_logic', CapabilityNiveau.A)).toBe('standard')
  })

  it('Niveau A: architecture → heavy', () => {
    expect(routeModel('architecture', CapabilityNiveau.A)).toBe('heavy')
  })

  it('Niveau A: unknown defaults to standard', () => {
    expect(routeModel('unknown', CapabilityNiveau.A)).toBe('standard')
  })

  it('Niveau B: always standard regardless of complexity', () => {
    expect(routeModel('trivial', CapabilityNiveau.B)).toBe('standard')
    expect(routeModel('business_logic', CapabilityNiveau.B)).toBe('standard')
    expect(routeModel('architecture', CapabilityNiveau.B)).toBe('standard')
  })

  it('Niveau C: always standard', () => {
    expect(routeModel('trivial', CapabilityNiveau.C)).toBe('standard')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-model-routing.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-model-routing.ts**

```typescript
// src/main/preset/cyber-factory/cf-model-routing.ts
/**
 * CF Model Routing — route worker sessions to model tiers.
 * CK-P3CF-004
 */

import { CapabilityNiveau } from '../niveau'

export type ModelTier = 'light' | 'standard' | 'heavy'
export type SubsystemKomplexitaet = 'trivial' | 'business_logic' | 'architecture'

const NIVEAU_A_ROUTING: Record<string, ModelTier> = {
  trivial: 'light',
  business_logic: 'standard',
  architecture: 'heavy',
}

export function routeModel(komplexitaet: string, niveau: CapabilityNiveau): ModelTier {
  if (niveau !== CapabilityNiveau.A) return 'standard'
  return NIVEAU_A_ROUTING[komplexitaet] ?? 'standard'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-model-routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-model-routing.ts tests/preset/cyber-factory/cf-model-routing.test.ts
git commit -m "feat(preset): CF model routing light/standard/heavy per complexity (CK-P3CF-004)"
```

---

### Task 15: CF risk review

**Files:**
- Create: `src/main/preset/cyber-factory/cf-risk-review.ts`
- Test: `tests/preset/cyber-factory/cf-risk-review.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-risk-review.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../../src/main/graph/db'
import { GraphWriter } from '../../../src/main/graph/writer'
import { createRiskReview } from '../../../src/main/preset/cyber-factory/cf-risk-review'
import { graphQuery } from '../../../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('CF Risk Review (CK-P3CF-005)', () => {
  let db: Database.Database
  let writer: GraphWriter
  let phaseUid: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
    const phase = writer.upsertNode({
      kind: 'phase', title: 'Development', path: '/phases/dev',
      frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
    })
    phaseUid = phase.uid
  })

  afterEach(() => { db?.open && db.close() })

  it('creates gate_befund with gate_typ risk-review', () => {
    const result = createRiskReview(writer, {
      phaseUid,
      risiko: 'Token leak via logs',
      wahrscheinlichkeit: 'niedrig',
      impact: 'hoch',
      massnahme: 'Scrub tokens from log output',
      befundStatement: 'Low probability high impact token leak risk',
    })
    expect(result.uid).toHaveLength(26)

    const reviews = graphQuery(db, { template: 'risk_reviews' })
    expect(reviews.count).toBe(1)
  })

  it('rejects befund_statement over 200 tokens', () => {
    const longStatement = 'word '.repeat(250)
    expect(() => createRiskReview(writer, {
      phaseUid,
      risiko: 'X',
      wahrscheinlichkeit: 'niedrig',
      impact: 'niedrig',
      massnahme: 'Y',
      befundStatement: longStatement,
    })).toThrow(/200/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-risk-review.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-risk-review.ts**

```typescript
// src/main/preset/cyber-factory/cf-risk-review.ts
/**
 * CF Risk Review — create gate_befund nodes with gate_typ 'risk-review'.
 * CK-P3CF-005
 */

import { estimateTokenCount } from '../capability-schema'
import type { GraphWriter } from '../../graph/writer'

export interface RiskReviewInput {
  phaseUid: string
  risiko: string
  wahrscheinlichkeit: 'hoch' | 'mittel' | 'niedrig'
  impact: 'hoch' | 'mittel' | 'niedrig'
  massnahme: string
  befundStatement: string
}

export function createRiskReview(
  writer: GraphWriter,
  input: RiskReviewInput,
): { uid: string } {
  const tokens = estimateTokenCount(input.befundStatement)
  if (tokens > 200) {
    throw new Error(`befund_statement exceeds 200 token limit (estimated: ${tokens})`)
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-')
  const result = writer.upsertNode({
    kind: 'gate_befund',
    title: `Risk Review: ${input.risiko.slice(0, 60)}`,
    path: `/risk-reviews/${timestamp}.md`,
    frontmatter: {
      phase_uid: input.phaseUid,
      strukturell: 'gruen',
      gate_typ: 'risk-review',
      risiko: input.risiko,
      wahrscheinlichkeit: input.wahrscheinlichkeit,
      impact: input.impact,
      massnahme: input.massnahme,
      befund_statement: input.befundStatement,
    },
  })

  return { uid: result.uid }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-risk-review.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-risk-review.ts tests/preset/cyber-factory/cf-risk-review.test.ts
git commit -m "feat(preset): CF risk review with token-limited befund statement (CK-P3CF-005)"
```

---

### Task 16: CF Rueckweg protocol

**Files:**
- Create: `src/main/preset/cyber-factory/cf-rueckweg.ts`
- Test: `tests/preset/cyber-factory/cf-rueckweg.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-rueckweg.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../../src/main/graph/db'
import { GraphWriter } from '../../../src/main/graph/writer'
import { reportArchitekturBruch } from '../../../src/main/preset/cyber-factory/cf-rueckweg'
import { graphQuery } from '../../../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('CF Rueckweg Protocol (CK-P3CF-006)', () => {
  let db: Database.Database
  let writer: GraphWriter
  let phaseUid: string
  let subsystemUid: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
    const phase = writer.upsertNode({
      kind: 'phase', title: 'Development', path: '/phases/dev',
      frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
    })
    phaseUid = phase.uid
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    subsystemUid = sub.uid
  })

  afterEach(() => { db?.open && db.close() })

  it('creates gate_befund with gate_typ architektur-bruch', () => {
    const result = reportArchitekturBruch(writer, {
      phaseUid,
      subsystem: subsystemUid,
      bruchpunkt: 'Auth-DB interface incompatible',
      schnittstelle: 'Auth<->DB contract',
      bauImplikation: 'Cannot proceed with auth subsystem',
    })
    expect(result.befundUid).toHaveLength(26)
    expect(result.rueckwegDokUid).toHaveLength(26)
  })

  it('creates uebergabedokument with dokumentTyp rueckweg-befund', () => {
    const result = reportArchitekturBruch(writer, {
      phaseUid,
      subsystem: subsystemUid,
      bruchpunkt: 'Interface break',
      schnittstelle: 'A<->B',
      bauImplikation: 'Blocked',
    })

    // Verify the uebergabedokument exists
    const docs = graphQuery(db, { template: 'vault_index' })
    const rueckweg = docs.rows.find((r: any) => r.uid === result.rueckwegDokUid)
    expect(rueckweg).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-rueckweg.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-rueckweg.ts**

```typescript
// src/main/preset/cyber-factory/cf-rueckweg.ts
/**
 * CF Rueckweg Protocol — escalation when architecture doesn't hold.
 *
 * "Die Zerlegung ist Input, nicht Hypothese."
 * CK-P3CF-006
 */

import type { GraphWriter } from '../../graph/writer'

export interface ArchitekturBruchInput {
  phaseUid: string
  subsystem: string
  bruchpunkt: string
  schnittstelle: string
  bauImplikation: string
}

export function reportArchitekturBruch(
  writer: GraphWriter,
  input: ArchitekturBruchInput,
): { befundUid: string; rueckwegDokUid: string } {
  const timestamp = new Date().toISOString().replace(/:/g, '-')

  // 1. gate_befund with gate_typ architektur-bruch
  const befund = writer.upsertNode({
    kind: 'gate_befund',
    title: `Architektur-Bruch: ${input.bruchpunkt.slice(0, 60)}`,
    path: `/rueckweg/befund-${timestamp}.md`,
    frontmatter: {
      phase_uid: input.phaseUid,
      strukturell: 'rot',
      gate_typ: 'architektur-bruch',
      subsystem: input.subsystem,
      bruchpunkt: input.bruchpunkt,
      schnittstelle: input.schnittstelle,
      bau_implikation: input.bauImplikation,
    },
  })

  // 2. uebergabedokument for SE information
  const dok = writer.upsertNode({
    kind: 'uebergabedokument',
    title: `Rückweg-Befund: ${input.bruchpunkt.slice(0, 40)}`,
    path: `/rueckweg/dok-${timestamp}.md`,
    body: [
      `# Rückweg-Befund`,
      '',
      `**Subsystem:** ${input.subsystem}`,
      `**Bruchpunkt:** ${input.bruchpunkt}`,
      `**Schnittstelle:** ${input.schnittstelle}`,
      `**Bau-Implikation:** ${input.bauImplikation}`,
      '',
      'CF wartet auf SE-Entscheidung. Kein Umbau auf eigene Faust.',
    ].join('\n'),
    frontmatter: {
      dokumentTyp: 'rueckweg-befund',
    },
  })

  return { befundUid: befund.uid, rueckwegDokUid: dok.uid }
}
```

Note: `dokumentTyp: 'rueckweg-befund'` must be added to the `DOKUMENT_TYPEN` array in `node-types.ts`. Add it there.

- [ ] **Step 4: Add 'rueckweg-befund' to DOKUMENT_TYPEN in node-types.ts**

In `src/main/graph/node-types.ts`, add `'rueckweg-befund'` to the `DOKUMENT_TYPEN` array and also add `'architect-handoff'` (needed for Task 10's übergabe spec).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-rueckweg.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-rueckweg.ts src/main/graph/node-types.ts tests/preset/cyber-factory/cf-rueckweg.test.ts
git commit -m "feat(preset): CF Rueckweg protocol with befund + SE uebergabedokument (CK-P3CF-006)"
```

---

### Task 17: CF body markdown

**Files:**
- Create: `src/main/preset/cyber-factory/cf-body.md`
- Test: `tests/preset/cyber-factory/cf-body.test.ts`

- [ ] **Step 1: Write tests that verify body structure**

```typescript
// tests/preset/cyber-factory/cf-body.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/cyber-factory/cf-body.md')

describe('CF Body (CK-P3CF-001, CK-P3CF-011)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains Negative Grenzen section', () => {
    expect(body).toContain('## Negative Grenzen')
  })

  it('mentions keine Architektur-Entscheidungen', () => {
    expect(body).toMatch(/keine.*Architektur/i)
  })

  it('mentions kein Bugfixing', () => {
    expect(body).toMatch(/kein.*Bugfixing/i)
  })

  it('mentions kein direkter Handoff an SE', () => {
    expect(body).toMatch(/kein.*direkter.*Handoff/i)
  })

  it('mentions Development-Worker-Modus for Niveau C (CK-P3CF-008)', () => {
    expect(body).toContain('Development-Worker-Modus')
  })

  it('contains Zerlegung ist Input reference', () => {
    expect(body).toContain('Zerlegung ist Input')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-body.test.ts`
Expected: FAIL — file not found

- [ ] **Step 3: Create cf-body.md**

```markdown
# Cyber Factory

Du bist die Cyber Factory — der schlanke Wellen-Bau-Master. Du nimmst die Architekten-Zerlegung
als festen Input, planst Bau-Wellen, orchestrierst parallele Worker-Sessions und lieferst
wellen-weise implementierungsfertige Subsysteme.

Die Zerlegung ist Input, nicht Hypothese. Du diskutierst sie nicht, du baust darauf.

## Kernaufgaben

1. **Welle-Plan**: Anforderungspakete in Bau-Wellen aufteilen (Abhaengigkeits-Kanten, Parallelisierbarkeit, Worker-Kapazitaet)
2. **Worker-Orchestrierung**: Sessions starten, Instruktionen senden, Monitoring (Schenkel-1-Protokoll)
3. **Model-Routing**: light/standard/heavy per Subsystem-Komplexitaet (Niveau A)
4. **Risk-Reviews**: Nach jeder Welle gate_befund-Knoten mit Risiko-Bewertung
5. **Rueckweg**: Bei Architektur-Bruch → Befund schreiben, Subsystem blocken, SE informieren, warten
6. **Coaching**: Schnittstellen-Fragen als frage_knoten in den Graph schreiben, Antworten an Worker weiterleiten

## Arbeitsablauf

1. Anforderungspakete lesen (anforderungspakete-Query)
2. Abhaengigkeits-Kanten lesen (subsystem_dependencies-Query)
3. Welle-Plan erstellen (topologische Sortierung + Worker-Kapazitaet)
4. Pro Welle: Worker starten, Instruktionen senden, Monitoring-Loop
5. Bei Schnittstellen-Frage: frage_knoten schreiben, offene_fragen pollen
6. Nach jeder Welle: Risk-Review erstellen
7. Bei Architektur-Bruch: Rueckweg-Protokoll ausfuehren
8. Am Ende: Architect uebergibt an SE (nicht die CF!)

## Negative Grenzen

1. **Keine Architektur-Entscheidungen.** Schnittstellen-Vertraege, Subsystem-Grenzen, ADRs
   sind Architect-Territorium. Frage-Knoten stellen: ja. Vertraege aendern: nein.
2. **Kein Bugfixing.** Das ist Fixing-Phase-Territorium.
3. **Kein direkter Handoff an SE.** Der Architect uebergibt am Phasen-Ende, nicht die CF.

## Niveau-Hinweise

- **Niveau A**: Volles Capability-Set, max 5 parallele Worker, Model-Routing aktiv
- **Niveau B**: 5 Kern-Capabilities, max 2 parallele Worker, Standard-Model fuer alle
- **Niveau C**: Development-Worker-Modus. Kein Multi-Session, kein Orchestrator, kein Welle-Plan.
  Du bist selbst der einzige Worker. Lies das Anforderungspaket und implementiere direkt.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-body.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-body.md tests/preset/cyber-factory/cf-body.test.ts
git commit -m "feat(preset): CF body with negative boundaries and niveau hints (CK-P3CF-001, 008, 011)"
```

---

### Task 18: CF worker orchestration (Schenkel-1 protocol)

**Files:**
- Create: `src/main/preset/cyber-factory/cf-worker-orchestration.ts`
- Test: `tests/preset/cyber-factory/cf-worker-orchestration.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/cyber-factory/cf-worker-orchestration.test.ts
import { describe, it, expect } from 'vitest'
import {
  WorkerLifecycle,
  STARTUP_WAIT_MS,
  TASK_PARSE_WAIT_MS,
  MONITORING_INTERVAL_MS,
  CONTEXT_ROTATION_THRESHOLD,
  MAX_STARTUP_RETRIES,
} from '../../../src/main/preset/cyber-factory/cf-worker-orchestration'

describe('CF Worker Orchestration — Schenkel-1 Protocol (CK-P3CF-003)', () => {
  it('STARTUP_WAIT_MS is 8000-10000ms range', () => {
    expect(STARTUP_WAIT_MS).toBeGreaterThanOrEqual(8000)
    expect(STARTUP_WAIT_MS).toBeLessThanOrEqual(10000)
  })

  it('TASK_PARSE_WAIT_MS is 15000ms', () => {
    expect(TASK_PARSE_WAIT_MS).toBe(15000)
  })

  it('MONITORING_INTERVAL_MS is 120000ms (2min)', () => {
    expect(MONITORING_INTERVAL_MS).toBe(120000)
  })

  it('CONTEXT_ROTATION_THRESHOLD is 0.8', () => {
    expect(CONTEXT_ROTATION_THRESHOLD).toBe(0.8)
  })

  it('MAX_STARTUP_RETRIES is 3', () => {
    expect(MAX_STARTUP_RETRIES).toBe(3)
  })

  it('WorkerLifecycle has correct step order', () => {
    expect(WorkerLifecycle).toEqual([
      'create_session',
      'wait_startup',
      'check_prompt',
      'send_instruction',
      'wait_parse',
      'verify_working',
      'monitoring',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-worker-orchestration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cf-worker-orchestration.ts**

```typescript
// src/main/preset/cyber-factory/cf-worker-orchestration.ts
/**
 * CF Worker Orchestration — Schenkel-1 Protocol.
 *
 * Defines the worker session lifecycle constants and types.
 * Actual tmux/session operations are handled by the runtime adapter.
 *
 * CK-P3CF-003
 */

/** Wait time after mux_create_session before checking prompt. */
export const STARTUP_WAIT_MS = 10000

/** Wait time after sending instruction before verifying work started. */
export const TASK_PARSE_WAIT_MS = 15000

/** Monitoring loop interval. */
export const MONITORING_INTERVAL_MS = 120000

/** Context usage threshold for proactive rotation. */
export const CONTEXT_ROTATION_THRESHOLD = 0.8

/** Max retries for startup prompt check. */
export const MAX_STARTUP_RETRIES = 3

/** Ordered lifecycle steps for a worker session. */
export const WorkerLifecycle = [
  'create_session',
  'wait_startup',
  'check_prompt',
  'send_instruction',
  'wait_parse',
  'verify_working',
  'monitoring',
] as const

export type WorkerStep = (typeof WorkerLifecycle)[number]

export interface WorkerStatus {
  sessionId: string
  step: WorkerStep
  contextUsage: number
  startedAt: Date
  lastCheck: Date | null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-worker-orchestration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/cyber-factory/cf-worker-orchestration.ts tests/preset/cyber-factory/cf-worker-orchestration.test.ts
git commit -m "feat(preset): CF Schenkel-1 worker orchestration protocol constants (CK-P3CF-003)"
```

---

### Task 19: CF boundary check tests + persona-defaults update

**Files:**
- Modify: `src/main/preset/shared/persona-defaults.json`
- Test: `tests/preset/cyber-factory/cf-boundary.test.ts`

- [ ] **Step 1: Write CF boundary tests**

```typescript
// tests/preset/cyber-factory/cf-boundary.test.ts
import { describe, it, expect } from 'vitest'
import { checkCfBoundary } from '../../../src/main/preset/capability-lint'

describe('CF Boundary Check (CK-P3CF-011)', () => {
  it('returns warning when CF writes schnittstellen_vertrag', () => {
    const results = checkCfBoundary(['schnittstellen_vertrag'])
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('warning')
  })

  it('returns warning when CF modifies adr', () => {
    const results = checkCfBoundary(['adr'])
    expect(results).toHaveLength(1)
  })

  it('no warning for frage_knoten (allowed)', () => {
    const results = checkCfBoundary(['frage_knoten'])
    expect(results).toHaveLength(0)
  })

  it('no warning for gate_befund (allowed — risk reviews)', () => {
    const results = checkCfBoundary(['gate_befund'])
    expect(results).toHaveLength(0)
  })

  it('no warning for anforderungspaket reads', () => {
    const results = checkCfBoundary(['anforderungspaket'])
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (already implemented in Task 9)**

Run: `cd <repo-root> && npx vitest run tests/preset/cyber-factory/cf-boundary.test.ts`
Expected: PASS (checkCfBoundary was implemented in Task 9)

- [ ] **Step 3: Update persona-defaults.json**

Read and modify `src/main/preset/shared/persona-defaults.json` to add `"cyber-factory": "cipher"` entry (if not already present). The file should have entries for: systems-engineer, architect, workshop, debugger, testing-assistant, and now cyber-factory.

- [ ] **Step 4: Run full test suite**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd <repo-root>
git add src/main/preset/shared/persona-defaults.json tests/preset/cyber-factory/cf-boundary.test.ts
git commit -m "feat(preset): CF boundary checks + persona-defaults for cyber-factory"
```

---

### Task 20: Final integration test + barrel exports

**Files:**
- Modify: `src/main/preset/index.ts` (add exports if needed)
- Test: `tests/phase4-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/phase4-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import { deriveProfile } from '../src/main/graph/access-profile'
import { ARCHITECT_RAHMEN, createArchitectRahmen } from '../src/main/preset/architect/architect-preset'
import { CF_RAHMEN, createCfRahmen } from '../src/main/preset/cyber-factory/cf-preset'
import { getArchitectCapabilities } from '../src/main/preset/architect/architect-capabilities'
import { getCfCapabilities } from '../src/main/preset/cyber-factory/cf-capabilities'
import { buildWellePlan } from '../src/main/preset/cyber-factory/cf-welle-plan'
import { routeModel } from '../src/main/preset/cyber-factory/cf-model-routing'
import { createRiskReview } from '../src/main/preset/cyber-factory/cf-risk-review'
import { reportArchitekturBruch } from '../src/main/preset/cyber-factory/cf-rueckweg'
import { assembleEntityClaudeMd } from '../src/main/session/assemble-entity'
import { validatePresetRahmen } from '../src/main/preset/schema'
import { CapabilityNiveau } from '../src/main/preset/niveau'
import type Database from 'better-sqlite3'

describe('Phase 4 Integration', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('Architect gets read:wide write:full via graphAnbindung override', () => {
    const profile = deriveProfile(ARCHITECT_RAHMEN)
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })

  it('CF gets read:wide write:full via graphAnbindung override', () => {
    const profile = deriveProfile(CF_RAHMEN)
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
  })

  it('full Architect-CF workflow: decompose → plan → build → review', () => {
    // Phase
    const phase = writer.upsertNode({
      kind: 'phase', title: 'Development', path: '/phases/dev',
      frontmatter: { name: 'development', position: 3, phase_status: 'aktiv' },
    })

    // Architect: create subsystems
    const subA = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'authentication', komplexitaet: 'business_logic' },
    })
    const subB = writer.upsertNode({
      kind: 'phase_subsystem', title: 'API', path: '/sub/api',
      frontmatter: { scope: 'api', komplexitaet: 'trivial' },
    })
    writer.linkEdge({ src: subB.uid, dst: subA.uid, type: 'haengt_ab_von' })

    // Architect: create ADR
    writer.upsertNode({
      kind: 'adr', title: 'REST API', path: '/adrs/rest.md',
      frontmatter: {
        title: 'REST', context: 'c', options: 'o', decision: 'd',
        consequences: 'co', version: 1,
        tiefen: { summary: 's', context: 'c', alternatives: 'a', consequences: 'co' },
      },
    })

    // Architect: create packages
    writer.upsertNode({
      kind: 'anforderungspaket', title: 'Auth Pkg', path: '/pkg/auth',
      frontmatter: {
        subsystem: subA.uid, req_ids: ['R-1'], code_anker: ['src/auth.ts'],
        akzeptanzkriterium: 'Login works', testcase_verweis: 'T-1',
      },
    })
    writer.upsertNode({
      kind: 'anforderungspaket', title: 'API Pkg', path: '/pkg/api',
      frontmatter: {
        subsystem: subB.uid, req_ids: ['R-2'], code_anker: ['src/api.ts'],
        akzeptanzkriterium: 'Endpoints respond', testcase_verweis: 'T-2',
      },
    })

    // CF: build wave plan
    const plan = buildWellePlan(db, 5)
    expect(plan.wellen.length).toBeGreaterThanOrEqual(2)

    // CF: model routing
    expect(routeModel('business_logic', CapabilityNiveau.A)).toBe('standard')
    expect(routeModel('trivial', CapabilityNiveau.A)).toBe('light')

    // CF: risk review after wave
    const review = createRiskReview(writer, {
      phaseUid: phase.uid,
      risiko: 'Test coverage gap',
      wahrscheinlichkeit: 'mittel',
      impact: 'mittel',
      massnahme: 'Add integration tests',
      befundStatement: 'Medium risk: test coverage gap in auth module',
    })
    expect(review.uid).toHaveLength(26)

    // Verify queries work end-to-end
    expect(graphQuery(db, { template: 'adr_list' }).count).toBe(1)
    expect(graphQuery(db, { template: 'anforderungspakete' }).count).toBe(2)
    expect(graphQuery(db, { template: 'risk_reviews' }).count).toBe(1)
  })

  it('Coaching loop: CF question → Architect answer', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })

    // CF writes question
    const frage = writer.upsertNode({
      kind: 'frage_knoten', title: 'Error format?', path: '/coaching/q1.md',
      frontmatter: { subsystem: sub.uid, frage: 'JSON or plain text errors?', worker_id: 'w1', status: 'offen' },
    })

    // Verify open question visible
    const open = graphQuery(db, { template: 'offene_fragen' })
    expect(open.count).toBe(1)

    // Architect answers
    const antwort = writer.upsertNode({
      kind: 'antwort_knoten', title: 'Error answer', path: '/coaching/a1.md',
      frontmatter: { frage_uid: frage.uid, antwort: 'JSON with error code', architect_session: 'arch-1' },
    })
    writer.linkEdge({ src: antwort.uid, dst: frage.uid })

    // Update frage status
    writer.upsertNode({
      kind: 'frage_knoten', title: 'Error format?', path: '/coaching/q1.md',
      frontmatter: { subsystem: sub.uid, frage: 'JSON or plain text errors?', worker_id: 'w1', status: 'beantwortet' },
    })

    // Verify coaching history
    const history = graphQuery(db, { template: 'coaching_historie', params: { subsystem: sub.uid } })
    expect(history.count).toBeGreaterThanOrEqual(1)

    // Verify no more open questions
    const stillOpen = graphQuery(db, { template: 'offene_fragen' })
    expect(stillOpen.count).toBe(0)
  })

  it('all preset configs valid across all niveaus', () => {
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      expect(validatePresetRahmen(createArchitectRahmen(n)).valid).toBe(true)
      expect(validatePresetRahmen(createCfRahmen(n)).valid).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `cd <repo-root> && npx vitest run tests/phase4-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Run FULL test suite**

Run: `cd <repo-root> && npx vitest run`
Expected: All PASS (existing 1164 + ~150 new tests)

- [ ] **Step 4: Commit**

```bash
cd <repo-root>
git add tests/phase4-integration.test.ts
git commit -m "test: Phase 4 integration tests — full Architect-CF workflow + coaching loop"
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `npx vitest run` — all tests green
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] REQ coverage: 13 Architect REQs (P3A without 010) + 12 CF REQs = 25 total
- [ ] New NodeKinds: 5 (adr, schnittstellen_vertrag, anforderungspaket, frage_knoten, antwort_knoten)
- [ ] New EdgeKinds: 3 (schnittstellen_vertrag_fuer, adr_fuer, beantwortet)
- [ ] New Query Templates: 8
- [ ] New DokumentTypen: 2 (rueckweg-befund, architect-handoff)
- [ ] Architect preset: 3 niveaus (A/B/C), 7 capabilities, boundary check
- [ ] CF preset: 3 niveaus (A/B/C), 8 capabilities, wave plan, model routing, risk review, rueckweg
- [ ] deriveProfile override works for both Architect and CF
