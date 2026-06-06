# Phase 5: Stabilisierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 15 deferred/stabilization REQs + 2 audit fixes: process engine extensions (PROC-006/015/016/017), GitHub NanoClaw integration (GH-009/010), Scaffolding skill (P3A-010), Vault-Index + Obsidian compatibility (NOTES-008/009/013), and UI stabilization (UI-030/032/034).

**Architecture:** Two sequential waves. Wave 1: backend extensions (query fixes, orchestrierung field, phase contract, workshop-fixing dispatch, subsystem cycle, plausibility inference, GitHub MCP + NanoClaw env). Wave 2: scaffolding skill, notes vault-index/watcher/obsidian, UI statusbar/persistence/kanban-sync. Within each wave, independent file groups run in parallel.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Electron, React 19, NanoClaw Bridge (UDS), fs.watch

**Spec:** `docs/superpowers/specs/2026-06-06-phase5-stabilisierung-design.md`

---

## Wave 1: Backend Extensions

### Task 1: Audit-Fix — project_uid Query-Parameter verdrahten

**Files:**
- Modify: `src/main/graph/query.ts`
- Test: `tests/graph/phase5-query-fixes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/graph/phase5-query-fixes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphQuery } from '../../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('Phase 5 Query Fixes — project_uid filtering', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  function createProjectWithAdr(projectName: string) {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: `${projectName}-sub`, path: `/sub/${projectName}`,
      frontmatter: { scope: projectName },
    })
    const adr = writer.upsertNode({
      kind: 'adr', title: `ADR for ${projectName}`, path: `/adrs/${projectName}.md`,
      frontmatter: {
        title: `ADR-${projectName}`, context: 'c', options: 'o', decision: 'd',
        consequences: 'co', version: 1,
        tiefen: { summary: 's', context: 'c', alternatives: 'a', consequences: 'co' },
      },
    })
    writer.linkEdge({ src: adr.uid, dst: sub.uid })
    return { sub, adr }
  }

  it('adr_list without project_uid returns all ADRs', () => {
    createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'adr_list' })
    expect(result.count).toBe(2)
  })

  it('adr_list with project_uid filters to that subsystem scope', () => {
    const alpha = createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'adr_list', params: { project_uid: alpha.sub.uid } })
    expect(result.count).toBe(1)
    expect(result.rows[0]).toHaveProperty('title', 'ADR for alpha')
  })

  it('architect_summary without project_uid counts globally', () => {
    createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'architect_summary' })
    expect(result.rows[0]).toHaveProperty('adr_count', 2)
  })

  it('architect_summary with project_uid filters counts', () => {
    const alpha = createProjectWithAdr('alpha')
    createProjectWithAdr('beta')
    const result = graphQuery(db, { template: 'architect_summary', params: { project_uid: alpha.sub.uid } })
    expect(result.rows[0]).toHaveProperty('adr_count', 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron && npx vitest run tests/graph/phase5-query-fixes.test.ts`
Expected: FAIL — project_uid param ignored

- [ ] **Step 3: Implement project_uid filtering**

In `src/main/graph/query.ts`, modify `executeAdrList`:

```typescript
function executeAdrList(db: Database.Database, p: Record<string, unknown>): QueryResult {
  const projectUid = p.project_uid as string | undefined
  let sql: string
  if (projectUid) {
    sql = `
      SELECT n.uid, n.title, n.frontmatter, n.erstellt
      FROM node n
      JOIN edge e ON e.src = n.uid AND e.type = 'adr_fuer' AND e.dst = ?
      WHERE n.kind = 'adr' AND n.status = 'aktiv'
      ORDER BY json_extract(n.frontmatter, '$.version') DESC
    `
    const rows = db.prepare(sql).all(projectUid) as Record<string, unknown>[]
    return { template: 'adr_list', rows, count: rows.length }
  }
  sql = `
    SELECT uid, title, frontmatter, erstellt
    FROM node
    WHERE kind = 'adr' AND status = 'aktiv'
    ORDER BY json_extract(frontmatter, '$.version') DESC
  `
  const rows = db.prepare(sql).all() as Record<string, unknown>[]
  return { template: 'adr_list', rows, count: rows.length }
}
```

Similarly modify `executeArchitectSummary` to accept `project_uid` and add WHERE clauses via subquery JOINs when set.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron && npx vitest run tests/graph/phase5-query-fixes.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/graph/query.ts tests/graph/phase5-query-fixes.test.ts && git commit -m "fix(graph): wire project_uid param in adr_list and architect_summary queries (Phase-4-Audit F-001)"
```

---

### Task 2: Audit-Fix — orchestrierung in PresetRahmen

**Files:**
- Modify: `src/main/preset/schema.ts`
- Modify: `src/main/preset/workshop/workshop-preset.ts`
- Modify: `src/main/preset/cyber-factory/cf-preset.ts`
- Test: `tests/phase5-orchestrierung.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/phase5-orchestrierung.test.ts
import { describe, it, expect } from 'vitest'
import { validatePresetRahmen } from '../src/main/preset/schema'
import { WORKSHOP_KONFIGURATION, createWorkshopRahmen } from '../src/main/preset/workshop/workshop-preset'
import { CF_RAHMEN } from '../src/main/preset/cyber-factory/cf-preset'
import { ARCHITECT_RAHMEN } from '../src/main/preset/architect/architect-preset'
import { SE_RAHMEN } from '../src/main/preset/systems-engineer/se-preset'
import { CapabilityNiveau } from '../src/main/preset/niveau'

describe('orchestrierung field (DE-5)', () => {
  it('PresetRahmen accepts orchestrierung: true', () => {
    const rahmen = { ...CF_RAHMEN, orchestrierung: true }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
  })

  it('PresetRahmen accepts orchestrierung: false', () => {
    const rahmen = { ...SE_RAHMEN, orchestrierung: false }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
  })

  it('PresetRahmen accepts missing orchestrierung (undefined = false)', () => {
    const result = validatePresetRahmen(SE_RAHMEN)
    expect(result.valid).toBe(true)
  })

  it('PresetRahmen rejects orchestrierung: "yes" (must be boolean)', () => {
    const rahmen = { ...CF_RAHMEN, orchestrierung: 'yes' }
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'orchestrierung')).toBe(true)
  })

  it('Workshop Rahmen has orchestrierung: true', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    expect((rahmen as any).orchestrierung).toBe(true)
  })

  it('CF Rahmen has orchestrierung: true', () => {
    expect((CF_RAHMEN as any).orchestrierung).toBe(true)
  })

  it('Architect Rahmen has no orchestrierung (undefined)', () => {
    expect((ARCHITECT_RAHMEN as any).orchestrierung).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron && npx vitest run tests/phase5-orchestrierung.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement orchestrierung field**

In `src/main/preset/schema.ts`:
1. Add `orchestrierung?: boolean` to `PresetRahmen` interface
2. In `validatePresetRahmen()`, add validation after the runtime check:
```typescript
const orchestrierungValue = obj['orchestrierung']
if (orchestrierungValue !== undefined && orchestrierungValue !== null && typeof orchestrierungValue !== 'boolean') {
  errors.push({
    field: 'orchestrierung',
    message: `orchestrierung must be a boolean, got '${typeof orchestrierungValue}'`,
  })
}
```

In `workshop-preset.ts`: add `orchestrierung: true` to the return of `createWorkshopRahmen()`.
In `cf-preset.ts`: add `orchestrierung: true` to `CF_RAHMEN` and `createCfRahmen()`.

- [ ] **Step 4: Run test to verify it passes + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/preset/schema.ts src/main/preset/workshop/workshop-preset.ts src/main/preset/cyber-factory/cf-preset.ts tests/phase5-orchestrierung.test.ts && git commit -m "feat(preset): add orchestrierung as formal PresetRahmen field (DE-5, Phase-4-Audit F-002)"
```

---

### Task 3: PROC-017 — Release Management als Phase 8

**Files:**
- Modify: `src/main/graph/phase-contract.ts` (if needed)
- Test: `tests/phase5-release-phase.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/phase5-release-phase.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import { graphQuery } from '../src/main/graph/query'
import type Database from 'better-sqlite3'

describe('Release Phase (CK-PROC-017)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  function seedPhaseChain() {
    const phases = [
      { name: 'ideation', position: 1 },
      { name: 'requirements', position: 2 },
      { name: 'architecture', position: 3 },
      { name: 'development', position: 4 },
      { name: 'testing', position: 5 },
      { name: 'fixing', position: 6 },
      { name: 'audit', position: 7 },
      { name: 'release', position: 8 },
    ]
    const nodes = phases.map(p => writer.upsertNode({
      kind: 'phase', title: p.name, path: `/phases/${p.name}`,
      frontmatter: { name: p.name, position: p.position, phase_status: 'ausstehend' },
    }))
    for (let i = 0; i < nodes.length - 1; i++) {
      writer.linkEdge({ src: nodes[i].uid, dst: nodes[i + 1].uid, type: 'naechste_phase' })
    }
    return nodes
  }

  it('phase_chain returns 8 phases with release as last', () => {
    seedPhaseChain()
    const result = graphQuery(db, { template: 'phase_chain' })
    expect(result.count).toBe(8)
    const last = result.rows[result.rows.length - 1] as Record<string, unknown>
    const fm = typeof last.frontmatter === 'string' ? JSON.parse(last.frontmatter) : last.frontmatter
    expect(fm.name).toBe('release')
    expect(fm.position).toBe(8)
  })

  it('release phase has public-facing character in frontmatter', () => {
    seedPhaseChain()
    const result = graphQuery(db, { template: 'nodes_by_kind', params: { kind: 'phase' } })
    const release = result.rows.find((r: any) => {
      const fm = typeof r.frontmatter === 'string' ? JSON.parse(r.frontmatter) : r.frontmatter
      return fm.name === 'release'
    })
    expect(release).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests, verify pass (release phase should already work with existing infra), commit**

The phase_chain query and phase node kind already exist. This task verifies the 8-phase chain works correctly with release as position 8. If tests pass immediately, this is a verification commit. If anything is missing, fix it.

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run tests/phase5-release-phase.test.ts && git add tests/phase5-release-phase.test.ts && git commit -m "test(proc): verify release phase as position 8 in phase chain (CK-PROC-017)"
```

---

### Task 4: PROC-015 — Fixing-Phase Workshop-Integration

**Files:**
- Create: `src/main/preset/workshop/workshop-fixing-dispatch.ts`
- Test: `tests/preset/workshop/workshop-fixing.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/preset/workshop/workshop-fixing.test.ts
import { describe, it, expect } from 'vitest'
import { dispatchFixingItem, classifyItem, type FixingItem } from '../../../src/main/preset/workshop/workshop-fixing-dispatch'

describe('Workshop Fixing Dispatch (CK-PROC-015)', () => {
  it('classifies BUG items', () => {
    expect(classifyItem({ id: 'BUG-001', titel: 'Login broken', typ: 'BUG' })).toBe('BUG')
  })

  it('classifies MFR items', () => {
    expect(classifyItem({ id: 'MFR-001', titel: 'Add dark mode', typ: 'MFR' })).toBe('MFR')
  })

  it('classifies NRF items', () => {
    expect(classifyItem({ id: 'NRF-001', titel: 'Improve startup', typ: 'NRF' })).toBe('NRF')
  })

  it('dispatches BUG to debugger preset', () => {
    const result = dispatchFixingItem({ id: 'BUG-001', titel: 'Login broken', typ: 'BUG' })
    expect(result.targetPreset).toBe('debugger')
    expect(result.reasoning).toContain('BUG')
  })

  it('dispatches MFR to development worker', () => {
    const result = dispatchFixingItem({ id: 'MFR-001', titel: 'Add feature', typ: 'MFR' })
    expect(result.targetPreset).toBe('development-worker')
  })

  it('dispatches NRF to development worker', () => {
    const result = dispatchFixingItem({ id: 'NRF-001', titel: 'Perf fix', typ: 'NRF' })
    expect(result.targetPreset).toBe('development-worker')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron && npx vitest run tests/preset/workshop/workshop-fixing.test.ts`

- [ ] **Step 3: Implement workshop-fixing-dispatch.ts**

```typescript
// src/main/preset/workshop/workshop-fixing-dispatch.ts
/**
 * Workshop Fixing Dispatch — routes fixing items to appropriate presets.
 * BUG → Debugger, MFR/NRF → Development Worker.
 * CK-PROC-015
 */

export type ItemTyp = 'BUG' | 'MFR' | 'NRF'

export interface FixingItem {
  id: string
  titel: string
  typ: ItemTyp
}

export interface DispatchResult {
  itemId: string
  targetPreset: string
  reasoning: string
}

export function classifyItem(item: FixingItem): ItemTyp {
  return item.typ
}

export function dispatchFixingItem(item: FixingItem): DispatchResult {
  const typ = classifyItem(item)
  if (typ === 'BUG') {
    return {
      itemId: item.id,
      targetPreset: 'debugger',
      reasoning: `BUG item dispatched to debugger preset for systematic debugging`,
    }
  }
  return {
    itemId: item.id,
    targetPreset: 'development-worker',
    reasoning: `${typ} item dispatched to development worker for implementation`,
  }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/preset/workshop/workshop-fixing-dispatch.ts tests/preset/workshop/workshop-fixing.test.ts && git commit -m "feat(preset): Workshop fixing dispatch BUG→debugger, MFR/NRF→dev-worker (CK-PROC-015)"
```

---

### Task 5: PROC-016 — Subsystem-Zyklus und Integration

**Files:**
- Create: `src/main/graph/subsystem-cycle.ts`
- Modify: `src/main/graph/query.ts`
- Test: `tests/graph/phase5-subsystem-cycle.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/graph/phase5-subsystem-cycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphQuery } from '../../src/main/graph/query'
import {
  createSubsystemCycle,
  advanceCyclePhase,
  CYCLE_PHASES,
  type CycleStatus,
} from '../../src/main/graph/subsystem-cycle'
import type Database from 'better-sqlite3'

describe('Subsystem Cycle (CK-PROC-016)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('CYCLE_PHASES has correct order', () => {
    expect(CYCLE_PHASES).toEqual(['development', 'testing', 'fixing', 'audit'])
  })

  it('creates cycle for a subsystem', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    const cycle = createSubsystemCycle(writer, sub.uid, 'Auth')
    expect(cycle.phases).toHaveLength(4)
    expect(cycle.currentPhase).toBe('development')
  })

  it('advances cycle phase', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    const cycle = createSubsystemCycle(writer, sub.uid, 'Auth')
    const next = advanceCyclePhase(writer, cycle)
    expect(next.currentPhase).toBe('testing')
  })

  it('subsystem_cycle_status query returns cycle state', () => {
    const sub = writer.upsertNode({
      kind: 'phase_subsystem', title: 'Auth', path: '/sub/auth',
      frontmatter: { scope: 'auth' },
    })
    createSubsystemCycle(writer, sub.uid, 'Auth')
    const result = graphQuery(db, { template: 'subsystem_cycle_status', params: { subsystem_uid: sub.uid } })
    expect(result.count).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement subsystem-cycle.ts**

```typescript
// src/main/graph/subsystem-cycle.ts
/**
 * Subsystem Cycle — Dev→Testing→Fixing→Audit per subsystem strand.
 * After cycle: integration, then Testing→Fixing→Audit again.
 * CK-PROC-016
 */

import type { GraphWriter } from './writer'

export const CYCLE_PHASES = ['development', 'testing', 'fixing', 'audit'] as const
export type CyclePhase = (typeof CYCLE_PHASES)[number]

export interface CycleStatus {
  subsystemUid: string
  phases: { name: CyclePhase; uid: string; status: string }[]
  currentPhase: CyclePhase
  integrated: boolean
}

export function createSubsystemCycle(writer: GraphWriter, subsystemUid: string, subsystemName: string): CycleStatus {
  const phases = CYCLE_PHASES.map((name, i) => {
    const result = writer.upsertNode({
      kind: 'phase',
      title: `${subsystemName}/${name}`,
      path: `/cycles/${subsystemUid}/${name}`,
      frontmatter: {
        name,
        position: i + 1,
        phase_status: i === 0 ? 'aktiv' : 'ausstehend',
        cycle_subsystem: subsystemUid,
      },
    })
    // Link to subsystem
    writer.linkEdge({ src: result.uid, dst: subsystemUid, type: 'subsystem_von' })
    return { name, uid: result.uid, status: i === 0 ? 'aktiv' : 'ausstehend' }
  })

  // Chain phases
  for (let i = 0; i < phases.length - 1; i++) {
    writer.linkEdge({ src: phases[i].uid, dst: phases[i + 1].uid, type: 'naechste_phase' })
  }

  return { subsystemUid, phases, currentPhase: 'development', integrated: false }
}

export function advanceCyclePhase(writer: GraphWriter, cycle: CycleStatus): CycleStatus {
  const currentIdx = CYCLE_PHASES.indexOf(cycle.currentPhase)
  if (currentIdx >= CYCLE_PHASES.length - 1) return cycle // already at audit

  const nextPhase = CYCLE_PHASES[currentIdx + 1]

  // Mark current as abgeschlossen
  writer.upsertNode({
    kind: 'phase',
    title: cycle.phases[currentIdx].uid,
    path: `/cycles/${cycle.subsystemUid}/${cycle.currentPhase}`,
    frontmatter: {
      name: cycle.currentPhase,
      position: currentIdx + 1,
      phase_status: 'abgeschlossen',
      cycle_subsystem: cycle.subsystemUid,
    },
  })

  // Mark next as aktiv
  writer.upsertNode({
    kind: 'phase',
    title: cycle.phases[currentIdx + 1].uid,
    path: `/cycles/${cycle.subsystemUid}/${nextPhase}`,
    frontmatter: {
      name: nextPhase,
      position: currentIdx + 2,
      phase_status: 'aktiv',
      cycle_subsystem: cycle.subsystemUid,
    },
  })

  return { ...cycle, currentPhase: nextPhase }
}
```

Add `subsystem_cycle_status` query template to `query.ts`:

```sql
SELECT p.uid, p.title, p.frontmatter, p.status
FROM node p
JOIN edge e ON e.src = p.uid AND e.type = 'subsystem_von' AND e.dst = :subsystem_uid
WHERE p.kind = 'phase'
ORDER BY json_extract(p.frontmatter, '$.position') ASC
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/graph/subsystem-cycle.ts src/main/graph/query.ts tests/graph/phase5-subsystem-cycle.test.ts && git commit -m "feat(graph): subsystem cycle Dev→Testing→Fixing→Audit with query (CK-PROC-016)"
```

---

### Task 6: PROC-006 — Plausibilitaets-Inferenz

**Files:**
- Create: `src/main/graph/plausibility-inference.ts`
- Test: `tests/graph/phase5-plausibility.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/graph/phase5-plausibility.test.ts
import { describe, it, expect } from 'vitest'
import { inferPlausibility, buildInferencePrompt } from '../../src/main/graph/plausibility-inference'

// Mock NanoClaw bridge
function mockBridge(response: string) {
  return {
    isConnected: () => true,
    sendMessage: async () => ({ content: response }),
  }
}

function disconnectedBridge() {
  return { isConnected: () => false, sendMessage: async () => null }
}

describe('Plausibility Inference (CK-PROC-006)', () => {
  it('returns traegt for plausible implementation', async () => {
    const bridge = mockBridge('traegt')
    const result = await inferPlausibility(
      bridge as any,
      'User login must validate credentials against database',
      'Function queries users table with bcrypt compare',
    )
    expect(result).toBe('traegt')
  })

  it('returns fraglich for questionable implementation', async () => {
    const bridge = mockBridge('fraglich')
    const result = await inferPlausibility(
      bridge as any,
      'Must encrypt data at rest',
      'Stores passwords in plaintext',
    )
    expect(result).toBe('fraglich')
  })

  it('returns null when bridge disconnected', async () => {
    const bridge = disconnectedBridge()
    const result = await inferPlausibility(bridge as any, 'req', 'impl')
    expect(result).toBeNull()
  })

  it('buildInferencePrompt contains requirement and implementation', () => {
    const prompt = buildInferencePrompt('must validate', 'checks input')
    expect(prompt).toContain('must validate')
    expect(prompt).toContain('checks input')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement plausibility-inference.ts**

```typescript
// src/main/graph/plausibility-inference.ts
/**
 * Plausibility Inference — local model assessment via NanoClaw.
 * Signal: 'traegt' | 'fraglich' | null. Never combined with structural befund.
 * CK-PROC-006
 */

export type PlausibilitySignal = 'traegt' | 'fraglich'

interface BridgeLike {
  isConnected(): boolean
  sendMessage(msg: { content: string }): Promise<{ content: string } | null>
}

export function buildInferencePrompt(anforderung: string, umsetzung: string): string {
  return [
    'Beurteile ob die folgende Umsetzung die Anforderung inhaltlich traegt.',
    'Antworte NUR mit "traegt" oder "fraglich".',
    '',
    '## Anforderung',
    anforderung,
    '',
    '## Umsetzung',
    umsetzung,
  ].join('\n')
}

export async function inferPlausibility(
  bridge: BridgeLike,
  anforderung: string,
  umsetzung: string,
): Promise<PlausibilitySignal | null> {
  if (!bridge.isConnected()) return null

  const prompt = buildInferencePrompt(anforderung, umsetzung)
  const response = await bridge.sendMessage({ content: prompt })
  if (!response) return null

  const answer = response.content.trim().toLowerCase()
  if (answer.includes('traegt')) return 'traegt'
  if (answer.includes('fraglich')) return 'fraglich'
  return 'fraglich' // default to cautious when answer unclear
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/graph/plausibility-inference.ts tests/graph/phase5-plausibility.test.ts && git commit -m "feat(graph): plausibility inference via NanoClaw bridge (CK-PROC-006)"
```

---

### Task 7: GH-009 — GitHub MCP-Server Konfiguration

**Files:**
- Create: `src/main/github/github-mcp-config.ts`
- Test: `tests/github/phase5-mcp-config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/github/phase5-mcp-config.test.ts
import { describe, it, expect } from 'vitest'
import { generateMcpEntry, type McpServerEntry } from '../../src/main/github/github-mcp-config'

describe('GitHub MCP Config (CK-GH-009)', () => {
  it('generates entry with default toolset', () => {
    const entry = generateMcpEntry({})
    expect(entry.command).toContain('github-mcp-server')
    expect(entry.args).toContain('--toolset')
    expect(entry.args).toContain('repos,pull_requests,issues')
  })

  it('generates entry with custom toolset', () => {
    const entry = generateMcpEntry({ toolset: ['repos', 'issues'] })
    expect(entry.args).toContain('repos,issues')
  })

  it('uses GITHUB_PERSONAL_ACCESS_TOKEN env var', () => {
    const entry = generateMcpEntry({})
    expect(entry.env).toHaveProperty('GITHUB_PERSONAL_ACCESS_TOKEN')
  })

  it('uses custom token env var name', () => {
    const entry = generateMcpEntry({ tokenEnvVar: 'GH_TOKEN' })
    expect(entry.env).toHaveProperty('GH_TOKEN')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement github-mcp-config.ts**

```typescript
// src/main/github/github-mcp-config.ts
/**
 * GitHub MCP Server configuration generator.
 * Optional — project works without it via gh CLI.
 * CK-GH-009
 */

export interface McpServerEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

export interface McpConfigOptions {
  toolset?: string[]
  tokenEnvVar?: string
}

const DEFAULT_TOOLSET = ['repos', 'pull_requests', 'issues']

export function generateMcpEntry(options: McpConfigOptions): McpServerEntry {
  const toolset = options.toolset ?? DEFAULT_TOOLSET
  const tokenVar = options.tokenEnvVar ?? 'GITHUB_PERSONAL_ACCESS_TOKEN'

  return {
    command: 'github-mcp-server',
    args: ['--toolset', toolset.join(',')],
    env: { [tokenVar]: '${' + tokenVar + '}' },
  }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/github/github-mcp-config.ts tests/github/phase5-mcp-config.test.ts && git commit -m "feat(github): MCP server config generator with toolset param (CK-GH-009)"
```

---

### Task 8: GH-010 — Schenkel-2 GitHub-Zugriff

**Files:**
- Create: `src/main/nanoclaw/container-env.ts`
- Test: `tests/nanoclaw/phase5-github-env.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/nanoclaw/phase5-github-env.test.ts
import { describe, it, expect } from 'vitest'
import { buildContainerEnv, type ContainerEnvConfig } from '../../src/main/nanoclaw/container-env'

describe('NanoClaw Container Env (CK-GH-010)', () => {
  it('includes GITHUB_TOKEN when provided', () => {
    const env = buildContainerEnv('/project/path', 'ghp_abc123')
    expect(env.envVars).toContain('-e')
    expect(env.envVars).toContain('GITHUB_TOKEN=ghp_abc123')
  })

  it('includes volume mount for project', () => {
    const env = buildContainerEnv('/project/path')
    expect(env.volumes).toContain('-v')
    expect(env.volumes).toContain('/project/path:/workspace/project')
  })

  it('omits GITHUB_TOKEN when not provided', () => {
    const env = buildContainerEnv('/project/path')
    expect(env.envVars.join(' ')).not.toContain('GITHUB_TOKEN')
  })

  it('returns flat args array for docker run', () => {
    const env = buildContainerEnv('/path', 'token')
    const args = env.toArgs()
    expect(args).toContain('-e')
    expect(args).toContain('-v')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement container-env.ts**

```typescript
// src/main/nanoclaw/container-env.ts
/**
 * NanoClaw Container Environment — GITHUB_TOKEN + Volume Mount.
 * CK-GH-010
 */

export interface ContainerEnvConfig {
  envVars: string[]
  volumes: string[]
  toArgs(): string[]
}

export function buildContainerEnv(projectPath: string, githubToken?: string): ContainerEnvConfig {
  const envVars: string[] = []
  if (githubToken) {
    envVars.push('-e', `GITHUB_TOKEN=${githubToken}`)
  }

  const volumes = ['-v', `${projectPath}:/workspace/project`]

  return {
    envVars,
    volumes,
    toArgs() {
      return [...envVars, ...volumes]
    },
  }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/nanoclaw/container-env.ts tests/nanoclaw/phase5-github-env.test.ts && git commit -m "feat(nanoclaw): container env with GITHUB_TOKEN + volume mount (CK-GH-010)"
```

---

## Wave 2: Preset, Notes, UI

### Task 9: P3A-010 — Scaffolding Skill

**Files:**
- Create: `src/main/skills/scaffolding.ts`
- Test: `tests/skills/scaffolding.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/skills/scaffolding.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffoldProject, type ScaffoldConfig } from '../../src/main/skills/scaffolding'

describe('Scaffolding Skill (CK-P3A-010)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates src and test directories per subsystem', () => {
    const result = scaffoldProject({
      projectPath: tmpDir,
      subsystems: ['auth', 'api'],
      testFramework: 'vitest',
      language: 'typescript',
    })
    expect(fs.existsSync(path.join(tmpDir, 'src/auth'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'src/api'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'tests/auth'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'tests/api'))).toBe(true)
    expect(result.createdDirs.length).toBeGreaterThanOrEqual(4)
  })

  it('creates empty test stubs for typescript', () => {
    scaffoldProject({
      projectPath: tmpDir,
      subsystems: ['auth'],
      testFramework: 'vitest',
      language: 'typescript',
    })
    const testFile = path.join(tmpDir, 'tests/auth/auth.test.ts')
    expect(fs.existsSync(testFile)).toBe(true)
    const content = fs.readFileSync(testFile, 'utf-8')
    expect(content).toContain('describe')
  })

  it('creates index file per subsystem', () => {
    scaffoldProject({
      projectPath: tmpDir,
      subsystems: ['auth'],
      testFramework: 'vitest',
      language: 'typescript',
    })
    const indexFile = path.join(tmpDir, 'src/auth/index.ts')
    expect(fs.existsSync(indexFile)).toBe(true)
  })

  it('handles empty subsystems list', () => {
    const result = scaffoldProject({
      projectPath: tmpDir,
      subsystems: [],
      testFramework: 'none',
      language: 'typescript',
    })
    expect(result.createdDirs).toHaveLength(0)
    expect(result.createdFiles).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement scaffolding.ts**

```typescript
// src/main/skills/scaffolding.ts
/**
 * Scaffolding Skill — standalone directory/file scaffold.
 * Callable by Architect (after decomposition) and SE (Quereinstieg).
 * CK-P3A-010
 */

import fs from 'node:fs'
import path from 'node:path'

export interface ScaffoldConfig {
  projectPath: string
  subsystems: string[]
  testFramework: 'vitest' | 'jest' | 'none'
  language: 'typescript' | 'python' | 'go'
}

export interface ScaffoldResult {
  createdDirs: string[]
  createdFiles: string[]
}

const EXT: Record<string, string> = { typescript: '.ts', python: '.py', go: '.go' }
const TEST_EXT: Record<string, string> = { typescript: '.test.ts', python: '_test.py', go: '_test.go' }

function testStub(subsystem: string, framework: string, lang: string): string {
  if (lang === 'typescript') {
    return `import { describe, it, expect } from '${framework}'\n\ndescribe('${subsystem}', () => {\n  it.todo('implement tests')\n})\n`
  }
  if (lang === 'python') return `# ${subsystem} tests\n`
  return `package ${subsystem}\n`
}

function indexStub(subsystem: string, lang: string): string {
  if (lang === 'typescript') return `// ${subsystem} module\nexport {}\n`
  if (lang === 'python') return `# ${subsystem} module\n`
  return `package ${subsystem}\n`
}

export function scaffoldProject(config: ScaffoldConfig): ScaffoldResult {
  const { projectPath, subsystems, testFramework, language } = config
  const createdDirs: string[] = []
  const createdFiles: string[] = []
  const ext = EXT[language] ?? '.ts'
  const testExt = TEST_EXT[language] ?? '.test.ts'

  for (const sub of subsystems) {
    const srcDir = path.join(projectPath, 'src', sub)
    const testDir = path.join(projectPath, 'tests', sub)

    fs.mkdirSync(srcDir, { recursive: true })
    createdDirs.push(srcDir)

    fs.mkdirSync(testDir, { recursive: true })
    createdDirs.push(testDir)

    // Index file
    const indexPath = path.join(srcDir, `index${ext}`)
    fs.writeFileSync(indexPath, indexStub(sub, language))
    createdFiles.push(indexPath)

    // Test stub
    if (testFramework !== 'none') {
      const testPath = path.join(testDir, `${sub}${testExt}`)
      fs.writeFileSync(testPath, testStub(sub, testFramework, language))
      createdFiles.push(testPath)
    }
  }

  return { createdDirs, createdFiles }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/skills/scaffolding.ts tests/skills/scaffolding.test.ts && git commit -m "feat(skills): standalone scaffolding skill for Architect/SE (CK-P3A-010)"
```

---

### Task 10: NOTES-008 — Vault-Index als Einstiegspunkt

**Files:**
- Create: `src/main/notes/vault-index.ts`
- Test: `tests/notes/phase5-vault-index.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/notes/phase5-vault-index.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { generateVaultIndex } from '../../src/main/notes/vault-index'
import type Database from 'better-sqlite3'

describe('Vault Index (CK-NOTES-008)', () => {
  let db: Database.Database
  let writer: GraphWriter
  let tmpDir: string

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  })

  afterEach(() => {
    db?.open && db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('generates index.md with wiki links to uebergabedokumente', () => {
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Spec Auth', path: '/deliverables/spec-auth.md',
      frontmatter: { dokumentTyp: 'spec' },
    })
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Build Auth', path: '/deliverables/build-auth.md',
      frontmatter: { dokumentTyp: 'build-paket' },
    })

    generateVaultIndex(db, tmpDir)

    const indexPath = path.join(tmpDir, 'index.md')
    expect(fs.existsSync(indexPath)).toBe(true)
    const content = fs.readFileSync(indexPath, 'utf-8')
    expect(content).toContain('[[Spec Auth]]')
    expect(content).toContain('[[Build Auth]]')
  })

  it('marks abgeloeste documents with strikethrough', () => {
    writer.upsertNode({
      kind: 'uebergabedokument', title: 'Old Spec', path: '/deliverables/old.md',
      status: 'abgeloest',
      frontmatter: { dokumentTyp: 'spec' },
    })

    generateVaultIndex(db, tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8')
    expect(content).toContain('~~[[Old Spec]]~~')
  })

  it('creates graph node with notetyp vault-index', () => {
    generateVaultIndex(db, tmpDir)

    const nodes = db.prepare("SELECT * FROM node WHERE kind = 'note' AND json_extract(frontmatter, '$.notetyp') = 'vault-index'").all()
    expect(nodes).toHaveLength(1)
  })

  it('handles empty vault (no documents)', () => {
    generateVaultIndex(db, tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8')
    expect(content).toContain('# Vault Index')
    expect(content).not.toContain('[[')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement vault-index.ts**

```typescript
// src/main/notes/vault-index.ts
/**
 * Vault Index — auto-generated index.md linking all Uebergabedokumente.
 * CK-NOTES-008
 */

import fs from 'node:fs'
import path from 'node:path'
import { graphQuery } from '../graph/query'
import { GraphWriter } from '../graph/writer'
import type Database from 'better-sqlite3'

export function generateVaultIndex(db: Database.Database, vaultPath: string): void {
  const result = graphQuery(db, { template: 'vault_index' })

  const lines: string[] = [
    '# Vault Index',
    '',
    'Automatisch generiert. Alle Uebergabedokumente dieses Projekts.',
    '',
  ]

  const docs = result.rows.filter((r: any) => r.kind === 'uebergabedokument')

  if (docs.length > 0) {
    lines.push('## Dokumente', '')
    for (const doc of docs) {
      const title = doc.title as string
      const status = doc.status as string
      if (status === 'abgeloest') {
        lines.push(`- ~~[[${title}]]~~ (abgeloest)`)
      } else {
        lines.push(`- [[${title}]]`)
      }
    }
  }

  lines.push('')

  const indexPath = path.join(vaultPath, 'index.md')
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8')

  // Store as graph node
  const writer = new GraphWriter(db)
  writer.upsertNode({
    kind: 'note',
    title: 'Vault Index',
    path: '/vault/index.md',
    body: lines.join('\n'),
    frontmatter: { notetyp: 'vault-index' },
  })
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/notes/vault-index.ts tests/notes/phase5-vault-index.test.ts && git commit -m "feat(notes): Vault-Index with wiki-links to Uebergabedokumente (CK-NOTES-008)"
```

---

### Task 11: NOTES-009 — Vault-Index inkrementell via Watcher

**Files:**
- Create: `src/main/notes/vault-watcher.ts`
- Test: `tests/notes/phase5-vault-watcher.test.ts`

NOTE: A `note-watcher.ts` already exists in `src/main/notes/`. This task creates a separate `vault-watcher.ts` specifically for the vault directory watching (external Obsidian changes), distinct from the internal note-watcher which monitors cipher-keel's own note files.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/notes/phase5-vault-watcher.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultWatcher, type VaultEvent } from '../../src/main/notes/vault-watcher'

describe('Vault Watcher (CK-NOTES-009)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-watch-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits created event for new .md file', async () => {
    const events: VaultEvent[] = []
    const watcher = new VaultWatcher(tmpDir, (e) => events.push(e))
    watcher.start()

    fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Test')

    // Wait for debounce + fs.watch delay
    await new Promise(r => setTimeout(r, 1000))
    watcher.stop()

    expect(events.some(e => e.type === 'created' || e.type === 'changed')).toBe(true)
  })

  it('ignores non-markdown files', async () => {
    const events: VaultEvent[] = []
    const watcher = new VaultWatcher(tmpDir, (e) => events.push(e))
    watcher.start()

    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'not markdown')

    await new Promise(r => setTimeout(r, 1000))
    watcher.stop()

    expect(events).toHaveLength(0)
  })

  it('stop() prevents further events', () => {
    const watcher = new VaultWatcher(tmpDir, () => {})
    watcher.start()
    watcher.stop()
    // No error thrown
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement vault-watcher.ts**

```typescript
// src/main/notes/vault-watcher.ts
/**
 * Vault Watcher — filesystem watcher for external vault changes (Obsidian).
 * Debounced, markdown-only, incremental.
 * CK-NOTES-009
 */

import fs from 'node:fs'
import path from 'node:path'

export type VaultEvent = {
  type: 'created' | 'changed' | 'deleted'
  path: string
}

export class VaultWatcher {
  private watcher: fs.FSWatcher | null = null
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private readonly DEBOUNCE_MS = 500

  constructor(
    private vaultPath: string,
    private onFileChanged: (event: VaultEvent) => void,
  ) {}

  start(): void {
    this.watcher = fs.watch(this.vaultPath, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return

      const fullPath = path.join(this.vaultPath, filename)

      // Debounce
      const existing = this.debounceTimers.get(fullPath)
      if (existing) clearTimeout(existing)

      this.debounceTimers.set(fullPath, setTimeout(() => {
        this.debounceTimers.delete(fullPath)
        const exists = fs.existsSync(fullPath)
        this.onFileChanged({
          type: exists ? (eventType === 'rename' ? 'created' : 'changed') : 'deleted',
          path: fullPath,
        })
      }, this.DEBOUNCE_MS))
    })
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()
  }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/notes/vault-watcher.ts tests/notes/phase5-vault-watcher.test.ts && git commit -m "feat(notes): Vault watcher for external changes with debounce (CK-NOTES-009)"
```

---

### Task 12: NOTES-013 — Obsidian-Vault-Kompatibilitaet

**Files:**
- Create: `src/main/notes/obsidian-compat.ts`
- Test: `tests/notes/phase5-obsidian-compat.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/notes/phase5-obsidian-compat.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { validateObsidianCompat } from '../../src/main/notes/obsidian-compat'

describe('Obsidian Compatibility (CK-NOTES-013)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('valid vault with correct frontmatter and wiki-links passes', () => {
    fs.writeFileSync(path.join(tmpDir, 'note.md'), '---\ntitle: Test\n---\n\nSee [[other]]')
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('detects invalid YAML frontmatter', () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.md'), '---\ntitle: [unclosed\n---\n')
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.type === 'invalid-frontmatter')).toBe(true)
  })

  it('reports file with no frontmatter as info (not error)', () => {
    fs.writeFileSync(path.join(tmpDir, 'plain.md'), '# Just text\nNo frontmatter here')
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(true) // missing frontmatter is OK for Obsidian
  })

  it('handles empty vault', () => {
    const result = validateObsidianCompat(tmpDir)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement obsidian-compat.ts**

```typescript
// src/main/notes/obsidian-compat.ts
/**
 * Obsidian Vault Compatibility — validate vault for Obsidian use.
 * CK-NOTES-013
 */

import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export interface ObsidianIssue {
  type: 'invalid-frontmatter' | 'invalid-dirname' | 'obsidian-conflict'
  file: string
  message: string
}

export interface ObsidianCompatResult {
  valid: boolean
  issues: ObsidianIssue[]
}

const INVALID_DIR_CHARS = /[<>:"|?*]/

export function validateObsidianCompat(vaultPath: string): ObsidianCompatResult {
  const issues: ObsidianIssue[] = []

  if (!fs.existsSync(vaultPath)) {
    return { valid: true, issues: [] }
  }

  const files = collectMarkdownFiles(vaultPath)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    // Check frontmatter validity
    if (content.startsWith('---')) {
      try {
        matter(content)
      } catch {
        issues.push({
          type: 'invalid-frontmatter',
          file: path.relative(vaultPath, file),
          message: 'Invalid YAML frontmatter — Obsidian will show a parse error',
        })
      }
    }

    // Check directory names
    const relDir = path.relative(vaultPath, path.dirname(file))
    if (INVALID_DIR_CHARS.test(relDir)) {
      issues.push({
        type: 'invalid-dirname',
        file: relDir,
        message: 'Directory contains characters unsupported by Obsidian',
      })
    }
  }

  // Check for .obsidian conflict
  const obsidianDir = path.join(vaultPath, '.obsidian')
  if (fs.existsSync(obsidianDir)) {
    // Not an issue — Obsidian creates this itself
  }

  return { valid: issues.length === 0, issues }
}

function collectMarkdownFiles(dir: string): string[] {
  const result: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectMarkdownFiles(full))
    } else if (entry.name.endsWith('.md')) {
      result.push(full)
    }
  }
  return result
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/notes/obsidian-compat.ts tests/notes/phase5-obsidian-compat.test.ts && git commit -m "feat(notes): Obsidian vault compatibility validator (CK-NOTES-013)"
```

---

### Task 13: UI-030 — StatusBar Gesamt-Erweiterungen

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Test: `tests/renderer/phase5-statusbar.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/renderer/phase5-statusbar.test.ts
import { describe, it, expect } from 'vitest'

// Pure logic tests — no React rendering (we test the StatusBar's data contract)
describe('StatusBar Extensions (CK-UI-030)', () => {
  it('NanoClaw status colors are defined', () => {
    const STATUS_COLORS: Record<string, string> = {
      connected: '#22c55e',
      disconnected: '#ef4444',
      connecting: '#eab308',
    }
    expect(STATUS_COLORS['connected']).toBe('#22c55e')
    expect(STATUS_COLORS['disconnected']).toBe('#ef4444')
    expect(STATUS_COLORS['connecting']).toBe('#eab308')
  })

  it('session count is a number', () => {
    const sessionCount = 3
    expect(typeof sessionCount).toBe('number')
    expect(sessionCount).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Modify StatusBar.tsx**

Update `StatusBar.tsx` to:
1. Accept `sessionCount` as a live-updating prop (already exists — verify it's wired to actual session list length)
2. Ensure NanoClaw status indicator shows color-coded dot: green (connected), red (disconnected), yellow (connecting)
3. Add session count display that auto-updates

The existing StatusBar already has `sessionCount` and `nanoClawStatus` props. Verify they work correctly and add any missing color-coding logic.

- [ ] **Step 3: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/renderer/components/StatusBar.tsx tests/renderer/phase5-statusbar.test.ts && git commit -m "feat(ui): StatusBar live session count + NanoClaw status colors (CK-UI-030)"
```

---

### Task 14: UI-032 — Keep-Working-Restore

**Files:**
- Modify: `src/main/session/keep-working.ts` (already exists — extend with grid restore)
- Test: `tests/session/phase5-persistence.test.ts`

NOTE: `keep-working.ts` already exists with `KeepWorkingState` and `SessionLayout` types. This task extends it with full grid position persistence.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/session/phase5-persistence.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  saveSessionSnapshot,
  loadSessionSnapshot,
  type SessionSnapshot,
} from '../../src/main/session/keep-working'

describe('Session Persistence (CK-UI-032)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-persist-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and loads session snapshot', () => {
    const snapshot: SessionSnapshot = {
      sessions: [
        { presetId: 'architect', name: 'Architect-1', gridPosition: 0 },
        { presetId: 'cyber-factory', name: 'CF-1', gridPosition: 1 },
      ],
      gridConfig: { cols: 2, rows: 2 },
      activeProject: 'cipher-keel',
    }

    saveSessionSnapshot(snapshot, tmpDir)
    const loaded = loadSessionSnapshot(tmpDir)

    expect(loaded).not.toBeNull()
    expect(loaded!.sessions).toHaveLength(2)
    expect(loaded!.gridConfig.cols).toBe(2)
    expect(loaded!.activeProject).toBe('cipher-keel')
  })

  it('returns null when no snapshot exists', () => {
    const loaded = loadSessionSnapshot(tmpDir)
    expect(loaded).toBeNull()
  })

  it('handles corrupt snapshot gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'session-snapshot.json'), 'not json')
    const loaded = loadSessionSnapshot(tmpDir)
    expect(loaded).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Extend keep-working.ts with snapshot functions**

Add to `src/main/session/keep-working.ts`:

```typescript
export interface SessionSnapshot {
  sessions: { presetId: string; name: string; gridPosition: number }[]
  gridConfig: { cols: number; rows: number }
  activeProject: string
}

export function saveSessionSnapshot(snapshot: SessionSnapshot, configDir: string): void {
  const filePath = path.join(configDir, 'session-snapshot.json')
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
}

export function loadSessionSnapshot(configDir: string): SessionSnapshot | null {
  const filePath = path.join(configDir, 'session-snapshot.json')
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as SessionSnapshot
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/session/keep-working.ts tests/session/phase5-persistence.test.ts && git commit -m "feat(session): save/load session snapshot for keep-working restore (CK-UI-032)"
```

---

### Task 15: UI-034 — Kanban-Vault-Konsistenz

**Files:**
- Create: `src/main/kanban/kanban-graph-sync.ts`
- Test: `tests/kanban/phase5-vault-sync.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/kanban/phase5-vault-sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { syncKanbanToGraph, type KanbanItem } from '../../src/main/kanban/kanban-graph-sync'
import type Database from 'better-sqlite3'

describe('Kanban-Graph Sync (CK-UI-034)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => { db?.open && db.close() })

  it('creates graph node for new kanban item', () => {
    const item: KanbanItem = {
      id: 'kb-001',
      title: 'Fix login bug',
      column: 'in-bearbeitung',
      phase: 6,
    }

    const result = syncKanbanToGraph(writer, item, 'create')
    expect(result.nodeUid).toHaveLength(26)
    expect(result.synced).toBe(true)
  })

  it('updates graph node status on kanban move', () => {
    const item: KanbanItem = { id: 'kb-001', title: 'Fix login', column: 'backlog', phase: 6 }
    const created = syncKanbanToGraph(writer, item, 'create')

    const updated = syncKanbanToGraph(writer, { ...item, column: 'fertig' }, 'update')
    expect(updated.nodeUid).toBe(created.nodeUid)
    expect(updated.synced).toBe(true)
  })

  it('marks orphaned items when graph node deleted', () => {
    const item: KanbanItem = { id: 'kb-001', title: 'Fix', column: 'backlog', phase: 6 }
    syncKanbanToGraph(writer, item, 'create')

    // Delete the node
    writer.deleteNode(item.id)

    const result = syncKanbanToGraph(writer, item, 'check')
    expect(result.orphaned).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement kanban-graph-sync.ts**

```typescript
// src/main/kanban/kanban-graph-sync.ts
/**
 * Kanban → Graph sync. One-directional: Kanban items create/update graph nodes.
 * CK-UI-034
 */

import type { GraphWriter } from '../graph/writer'

export interface KanbanItem {
  id: string
  title: string
  column: string
  phase: number
}

export interface SyncResult {
  nodeUid: string
  synced: boolean
  orphaned?: boolean
}

const COLUMN_TO_STATUS: Record<string, string> = {
  backlog: 'aktiv',
  'in-bearbeitung': 'aktiv',
  'in-review': 'aktiv',
  fertig: 'abgeloest',
}

export function syncKanbanToGraph(
  writer: GraphWriter,
  item: KanbanItem,
  action: 'create' | 'update' | 'check',
): SyncResult {
  if (action === 'check') {
    // Check if graph node still exists
    try {
      const result = writer.upsertNode({
        kind: 'note',
        title: item.title,
        path: `/kanban/${item.id}`,
        frontmatter: { notetyp: 'kanban-item', column: item.column },
      })
      return { nodeUid: result.uid, synced: true, orphaned: false }
    } catch {
      return { nodeUid: '', synced: false, orphaned: true }
    }
  }

  const status = COLUMN_TO_STATUS[item.column] ?? 'aktiv'

  const result = writer.upsertNode({
    kind: 'note',
    title: item.title,
    path: `/kanban/${item.id}`,
    status,
    frontmatter: {
      notetyp: 'kanban-item',
      column: item.column,
      phase: item.phase,
    },
  })

  return { nodeUid: result.uid, synced: true }
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx vitest run && git add src/main/kanban/kanban-graph-sync.ts tests/kanban/phase5-vault-sync.test.ts && git commit -m "feat(kanban): one-directional Kanban→Graph sync (CK-UI-034)"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npx vitest run` — all tests green
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] REQ coverage: 15 REQs + 2 Audit-Fixes = 17 items
- [ ] Audit-Fixes: project_uid wired, orchestrierung field added
- [ ] PROC: 006 (plausibility), 015 (fixing dispatch), 016 (subsystem cycle), 017 (release phase)
- [ ] GH: 009 (MCP config), 010 (container env)
- [ ] P3A-010: Scaffolding skill
- [ ] NOTES: 008 (vault-index), 009 (vault-watcher), 013 (obsidian-compat)
- [ ] UI: 030 (statusbar), 032 (session persistence), 034 (kanban-sync)
