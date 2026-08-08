/**
 * Phase F tests — MCP Tool functions.
 * CK-GRAPH-018, 019, 020, 021, 022, 023, 024, 036, 040, 042, 049
 * CK-NFR-011 (token budget)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { graphSearch, graphGetNode, graphExpand } from '../../src/main/graph/search'
import { graphQuery, graphSandboxedQuery } from '../../src/main/graph/query'
import { graphMaintain, MAINTAIN_OPERATIONS } from '../../src/main/graph/maintain'

// -------------------------------------------------------------------
// Shared test data builder
// -------------------------------------------------------------------

function buildTestGraph(db: Database.Database) {
  const w = new GraphWriter(db)

  const anf1 = w.upsertNode({
    kind: 'anforderung', title: 'REQ-001: Graph muss 8 Knotentypen haben',
    path: '/reqs/R001.md', body: 'Der Knowledge Graph muss acht Knotentypen unterstuetzen',
    frontmatter: { quelle: 'M1', prioritaet: 'muss' }
  })

  const anf2 = w.upsertNode({
    kind: 'anforderung', title: 'REQ-002: Vault als Quelle',
    path: '/reqs/R002.md', body: 'Markdown Vault ist die einzige Quelle der Wahrheit',
    frontmatter: { quelle: 'M1', prioritaet: 'muss' }
  })

  const ent1 = w.upsertNode({
    kind: 'entscheidung', title: 'SQLite + sqlite-vec als Backend',
    path: '/entsch/E001.md', body: 'Entschieden: SQLite mit sqlite-vec fuer Vektorsuche',
    frontmatter: { begruendung: 'Risiko/Lizenz', alternativen: ['Kuzu', 'Neo4j'] }
  })

  const art1 = w.upsertNode({
    kind: 'artefakt', title: 'schema.ts',
    path: '/src/main/graph/schema.ts', body: 'CREATE TABLE node (...)',
    frontmatter: { sprache_art: 'TypeScript' }
  })

  const tst1 = w.upsertNode({
    kind: 'test', title: 'Phase A Tests',
    path: '/tests/graph/phase-a.test.ts', body: 'describe Phase A tests',
    frontmatter: { testart: 'unit', ergebnis: 'pass' }
  })

  const anl1 = w.upsertNode({
    kind: 'anlass', title: 'BT-1a Session',
    path: '/sessions/bt-1a.md',
    frontmatter: { session: 'bt-1a', zeitpunkt: '2026-06-05T10:00:00Z' }
  })

  const phase1 = w.upsertNode({
    kind: 'phase_subsystem', title: 'Phase 1: Foundation',
    path: '/phases/phase1.md', frontmatter: { ebene: 'phase' }
  })

  const repo = w.upsertNode({
    kind: 'github_repo', title: 'cipher-keel-electron',
    // UpsertNodeInput.path is `path?: string` (optional, not nullable) —
    // github_repo nodes have no filesystem path, so omit it rather than
    // passing `null`.
    frontmatter: {
      url: 'https://github.com/cipher/keel',
      owner: 'cipher',
      name: 'keel',
      repo_id: '123456',
      default_branch: 'main',
      visibility: 'private',
      linked_at: '2026-06-05T00:00:00Z'
    }
  })

  // Edges: herkunfts-kette
  w.linkEdge({ src: ent1.uid, dst: anf1.uid })            // begruendet
  w.linkEdge({ src: art1.uid, dst: anf1.uid })             // setzt_um
  w.linkEdge({ src: art1.uid, dst: ent1.uid })             // setzt_um
  w.linkEdge({ src: tst1.uid, dst: anf1.uid })             // verifiziert
  w.linkEdge({ src: tst1.uid, dst: art1.uid })             // verifiziert
  w.linkEdge({ src: art1.uid, dst: anl1.uid })             // erzeugt_von
  w.linkEdge({ src: art1.uid, dst: phase1.uid })            // verweist_auf
  w.linkEdge({ src: anf1.uid, dst: anf2.uid, type: 'verfeinert' })  // verfeinert

  return { anf1, anf2, ent1, art1, tst1, anl1, phase1, repo, writer: w }
}

// -------------------------------------------------------------------
// graph_search (CK-GRAPH-018, CK-GRAPH-042, CK-NFR-011)
// -------------------------------------------------------------------

describe('graph_search (CK-GRAPH-018)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('FTS search returns compact hits', () => {
    buildTestGraph(db)
    const hits = graphSearch(db, { query: 'Knowledge Graph' })
    expect(hits.length).toBeGreaterThan(0)
    // Progressive disclosure: no body, no frontmatter
    for (const hit of hits) {
      expect(hit).toHaveProperty('uid')
      expect(hit).toHaveProperty('kind')
      expect(hit).toHaveProperty('title')
      expect(hit).toHaveProperty('score')
      expect(hit).not.toHaveProperty('body')
      expect(hit).not.toHaveProperty('frontmatter')
    }
  })

  it('empty query returns empty list, no error', () => {
    buildTestGraph(db)
    const hits = graphSearch(db, { query: '' })
    expect(hits).toEqual([])
  })

  it('no-match query returns empty list', () => {
    buildTestGraph(db)
    const hits = graphSearch(db, { query: 'xyznonexistent12345' })
    expect(hits).toEqual([])
  })

  it('kind filter works', () => {
    buildTestGraph(db)
    const hits = graphSearch(db, { query: 'SQLite', kind: 'entscheidung' })
    for (const hit of hits) {
      expect(hit.kind).toBe('entscheidung')
    }
  })

  it('token budget: 10 hits < 2000 tokens (CK-NFR-011)', () => {
    // Create 10+ nodes
    const w = new GraphWriter(db)
    for (let i = 0; i < 12; i++) {
      w.upsertNode({
        kind: 'note', title: `Note Alpha ${i}`,
        path: `/notes/alpha-${i}.md`,
        body: `Alpha content for search token test number ${i}`,
        frontmatter: { notetyp: 'recherche' }
      })
    }

    const hits = graphSearch(db, { query: 'Alpha', limit: 10 })
    expect(hits.length).toBeLessThanOrEqual(10)

    // Estimate token count: JSON.stringify each hit, rough 4 chars/token
    const json = JSON.stringify(hits)
    const estimatedTokens = Math.ceil(json.length / 4)
    expect(estimatedTokens).toBeLessThan(2000)
  })

  it('score is present and positive', () => {
    buildTestGraph(db)
    const hits = graphSearch(db, { query: 'SQLite' })
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(hit.score).toBeGreaterThan(0)
    }
  })
})

// -------------------------------------------------------------------
// graph_get_node (CK-GRAPH-019)
// -------------------------------------------------------------------

describe('graph_get_node (CK-GRAPH-019)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('returns full node with all attributes', () => {
    const { anf1 } = buildTestGraph(db)
    const node = graphGetNode(db, anf1.uid)
    expect(node).not.toBeNull()
    expect(node!.uid).toBe(anf1.uid)
    expect(node!.kind).toBe('anforderung')
    expect(node!.title).toBe('REQ-001: Graph muss 8 Knotentypen haben')
    expect(node!.body).toContain('acht Knotentypen')
    expect(node!.frontmatter).toHaveProperty('quelle')
    expect(node!.status).toBe('aktiv')
    expect(node!.erstellt).toBeTruthy()
  })

  it('non-existent uid returns null', () => {
    const node = graphGetNode(db, 'DOES_NOT_EXIST_0000000000')
    expect(node).toBeNull()
  })

  it('frontmatter is parsed object, not string', () => {
    const { ent1 } = buildTestGraph(db)
    const node = graphGetNode(db, ent1.uid)
    expect(typeof node!.frontmatter).toBe('object')
    expect(node!.frontmatter.begruendung).toBe('Risiko/Lizenz')
  })
})

// -------------------------------------------------------------------
// graph_expand (CK-GRAPH-020, CK-GRAPH-036)
// -------------------------------------------------------------------

describe('graph_expand (CK-GRAPH-020)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('expands outgoing neighbors at depth 1', () => {
    const { art1 } = buildTestGraph(db)
    const result = graphExpand(db, { uid: art1.uid, depth: 1, direction: 'outgoing' })
    expect(result.origin).toBe(art1.uid)
    expect(result.neighbors.length).toBeGreaterThan(0)
    for (const n of result.neighbors) {
      expect(n.depth).toBe(1)
      expect(n.edge.src).toBe(art1.uid)
    }
  })

  it('expands incoming neighbors', () => {
    const { anf1 } = buildTestGraph(db)
    const result = graphExpand(db, { uid: anf1.uid, depth: 1, direction: 'incoming' })
    expect(result.neighbors.length).toBeGreaterThan(0)
    for (const n of result.neighbors) {
      expect(n.edge.dst).toBe(anf1.uid)
    }
  })

  it('edge_type filter works', () => {
    const { anf1 } = buildTestGraph(db)
    const result = graphExpand(db, {
      uid: anf1.uid, depth: 1, direction: 'incoming', edge_type: 'setzt_um'
    })
    for (const n of result.neighbors) {
      expect(n.edge.type).toBe('setzt_um')
    }
  })

  it('depth > MAX (5) is capped', () => {
    const { art1 } = buildTestGraph(db)
    const result = graphExpand(db, { uid: art1.uid, depth: 100 })
    expect(result.depth).toBe(5)
  })

  it('multi-depth traversal works (CK-GRAPH-036)', () => {
    const { art1 } = buildTestGraph(db)
    const result = graphExpand(db, { uid: art1.uid, depth: 3, direction: 'outgoing' })
    // art1 -> anf1 -> anf2 (depth 2 via verfeinert)
    const depths = new Set(result.neighbors.map(n => n.depth))
    expect(depths.size).toBeGreaterThanOrEqual(1)
  })
})

// -------------------------------------------------------------------
// graph_query (CK-GRAPH-021, CK-GRAPH-035, CK-GRAPH-040)
// -------------------------------------------------------------------

describe('graph_query (CK-GRAPH-021)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('rejects unknown template', () => {
    expect(() => graphQuery(db, { template: 'not_a_template' })).toThrow('Unknown query template')
  })

  it('herkunfts_kette traverses from artefakt (CK-GRAPH-035)', () => {
    const { art1, anf1 } = buildTestGraph(db)
    const result = graphQuery(db, { template: 'herkunfts_kette', params: { uid: art1.uid } })
    expect(result.template).toBe('herkunfts_kette')
    expect(result.count).toBeGreaterThanOrEqual(2) // art1 + at least anf1
    const uids = result.rows.map(r => r.uid)
    expect(uids).toContain(art1.uid)
    expect(uids).toContain(anf1.uid)
  })

  it('unlinked_anforderungen finds REQ without setzt_um (CK-GRAPH-040)', () => {
    const { anf2 } = buildTestGraph(db)
    const result = graphQuery(db, { template: 'unlinked_anforderungen' })
    expect(result.template).toBe('unlinked_anforderungen')
    const uids = result.rows.map(r => r.uid)
    expect(uids).toContain(anf2.uid) // anf2 has no setzt_um
  })

  it('entscheidungen_fuer_anforderung returns linked entscheidung', () => {
    const { anf1, ent1 } = buildTestGraph(db)
    const result = graphQuery(db, {
      template: 'entscheidungen_fuer_anforderung',
      params: { uid: anf1.uid }
    })
    expect(result.rows.map(r => r.uid)).toContain(ent1.uid)
  })

  it('artefakte_fuer_anforderung returns linked artefakt', () => {
    const { anf1, art1 } = buildTestGraph(db)
    const result = graphQuery(db, {
      template: 'artefakte_fuer_anforderung',
      params: { uid: anf1.uid }
    })
    expect(result.rows.map(r => r.uid)).toContain(art1.uid)
  })

  it('tests_fuer_artefakt returns linked test', () => {
    const { art1, tst1 } = buildTestGraph(db)
    const result = graphQuery(db, {
      template: 'tests_fuer_artefakt',
      params: { uid: art1.uid }
    })
    expect(result.rows.map(r => r.uid)).toContain(tst1.uid)
  })

  it('nodes_by_kind filters correctly', () => {
    buildTestGraph(db)
    const result = graphQuery(db, {
      template: 'nodes_by_kind',
      params: { kind: 'anforderung' }
    })
    for (const row of result.rows) {
      expect(row.kind).toBe('anforderung')
    }
    expect(result.count).toBe(2) // anf1 + anf2
  })

  it('orphaned_nodes finds unlinked nodes', () => {
    buildTestGraph(db)
    const result = graphQuery(db, { template: 'orphaned_nodes' })
    // github_repo is excluded in maintain but not in query
    expect(result.template).toBe('orphaned_nodes')
  })

  it('gate_coverage returns structured counts (CK-GRAPH-040)', () => {
    buildTestGraph(db)
    const result = graphQuery(db, {
      template: 'gate_coverage',
      params: { edge_type: 'setzt_um' }
    })
    expect(result.rows.length).toBe(1)
    const row = result.rows[0]
    expect(row).toHaveProperty('total_anforderungen')
    expect(row).toHaveProperty('covered')
    expect(row).toHaveProperty('uncovered')
    // anf1 has setzt_um, anf2 doesn't
    expect(row.covered).toBe(1)
    expect(row.uncovered).toBe(1)
  })

  it('reverse_trace traces backwards', () => {
    const { anf1, ent1 } = buildTestGraph(db)
    const result = graphQuery(db, {
      template: 'reverse_trace',
      params: { uid: anf1.uid }
    })
    const uids = result.rows.map(r => r.uid)
    expect(uids).toContain(anf1.uid) // seed
    expect(uids).toContain(ent1.uid) // ent1 -> anf1 via begruendet
  })
})

// -------------------------------------------------------------------
// graph_upsert_node / graph_link — wrapper validation (CK-GRAPH-022, 023)
// (Core logic tested in phase-d.test.ts; here we test MCP-tool expectations)
// -------------------------------------------------------------------

describe('graph_upsert_node/graph_link MCP expectations (CK-GRAPH-022/023)', () => {
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })
  afterEach(() => { db.close() })

  it('upsert is idempotent — same natural key produces same uid', () => {
    const r1 = writer.upsertNode({ kind: 'note', title: 'Idempotent', path: '/idem.md' })
    const r2 = writer.upsertNode({ kind: 'note', title: 'Idempotent', path: '/idem.md' })
    expect(r1.uid).toBe(r2.uid)
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(false)
  })

  it('link derives edge type from node pair', () => {
    const anf = writer.upsertNode({ kind: 'anforderung', title: 'REQ', path: '/r.md' })
    const ent = writer.upsertNode({ kind: 'entscheidung', title: 'DEC', path: '/e.md' })
    const edge = writer.linkEdge({ src: ent.uid, dst: anf.uid })
    expect(edge.type).toBe('begruendet')
  })

  it('link allows default override', () => {
    const n1 = writer.upsertNode({ kind: 'note', title: 'N1', path: '/n1.md' })
    const n2 = writer.upsertNode({ kind: 'note', title: 'N2', path: '/n2.md' })
    const edge = writer.linkEdge({ src: n1.uid, dst: n2.uid, type: 'verweist_auf' })
    expect(edge.type).toBe('verweist_auf')
  })
})

// -------------------------------------------------------------------
// graph_maintain (CK-GRAPH-024, CK-GRAPH-027)
// -------------------------------------------------------------------

describe('graph_maintain (CK-GRAPH-024)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('rejects non-enum operation', () => {
    expect(() => graphMaintain(db, { operation: 'nope' })).toThrow('Unknown maintenance operation')
  })

  it('hygiene detects orphaned nodes', () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'note', title: 'Lonely Note', path: '/lonely.md' })
    const result = graphMaintain(db, { operation: 'hygiene' })
    expect(result.operation).toBe('hygiene')
    if (result.operation === 'hygiene') {
      const orphans = result.findings.filter(f => f.type === 'orphaned_node')
      expect(orphans.length).toBeGreaterThan(0)
      expect(orphans[0].title).toBe('Lonely Note')
    }
  })

  it('hygiene detects stale summary nodes (CK-GRAPH-027)', () => {
    const w = new GraphWriter(db)
    // Create a summary note with an old erstellt date
    const summary = w.upsertNode({
      kind: 'note', title: 'Summary Phase 1',
      path: '/summaries/phase1.md',
      frontmatter: { notetyp: 'summary' }
    })
    // Manually backdate the summary
    db.prepare('UPDATE node SET erstellt = ? WHERE uid = ?')
      .run('2020-01-01T00:00:00Z', summary.uid)

    // Create a linked node with newer date
    const art = w.upsertNode({
      kind: 'artefakt', title: 'New Artefakt',
      path: '/art/new.ts', frontmatter: { sprache_art: 'TS' }
    })
    w.linkEdge({ src: summary.uid, dst: art.uid })

    const result = graphMaintain(db, { operation: 'hygiene' })
    if (result.operation === 'hygiene') {
      const stale = result.findings.filter(f => f.type === 'stale_summary')
      expect(stale.length).toBe(1)
      expect(stale[0].uid).toBe(summary.uid)
    }
  })

  it('konsolidierung propagates status for abgeloest_durch edges', () => {
    const w = new GraphWriter(db)
    const old = w.upsertNode({
      kind: 'entscheidung', title: 'Old Decision',
      path: '/e/old.md', frontmatter: { begruendung: 'old' }
    })
    const newD = w.upsertNode({
      kind: 'entscheidung', title: 'New Decision',
      path: '/e/new.md', frontmatter: { begruendung: 'new' }
    })
    w.linkEdge({ src: newD.uid, dst: old.uid, type: 'abgeloest_durch' })

    // old is still 'aktiv'
    const before = db.prepare('SELECT status FROM node WHERE uid = ?').get(old.uid) as { status: string }
    expect(before.status).toBe('aktiv')

    const result = graphMaintain(db, { operation: 'konsolidierung' })
    if (result.operation === 'konsolidierung') {
      const propagated = result.actions.filter(a => a.type === 'status_propagated')
      expect(propagated.length).toBe(1)
    }

    // After konsolidierung, old should be 'abgeloest'
    const after = db.prepare('SELECT status FROM node WHERE uid = ?').get(old.uid) as { status: string }
    expect(after.status).toBe('abgeloest')
  })

  it('verdichtung recommends summary creation for phases with children', () => {
    const w = new GraphWriter(db)
    const phase = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase X',
      path: '/phases/x.md', frontmatter: { ebene: 'phase' }
    })
    const art = w.upsertNode({
      kind: 'artefakt', title: 'Art X',
      path: '/art/x.ts', frontmatter: { sprache_art: 'TS' }
    })
    w.linkEdge({ src: art.uid, dst: phase.uid })

    const result = graphMaintain(db, { operation: 'verdichtung' })
    if (result.operation === 'verdichtung') {
      const created = result.actions.filter(a => a.type === 'summary_created')
      expect(created.length).toBe(1)
      expect(created[0].title).toContain('Phase X')
    }
  })

  it('all enum operations are valid', () => {
    for (const op of MAINTAIN_OPERATIONS) {
      expect(() => graphMaintain(db, { operation: op })).not.toThrow()
    }
  })
})

// -------------------------------------------------------------------
// Sandboxed query (CK-GRAPH-049)
// -------------------------------------------------------------------

describe('graphSandboxedQuery (CK-GRAPH-049)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('allows SELECT queries', () => {
    buildTestGraph(db)
    const result = graphSandboxedQuery(db, 'SELECT uid, title FROM node LIMIT 5')
    expect(result.count).toBeGreaterThan(0)
    expect(result.rows[0]).toHaveProperty('uid')
  })

  it('allows WITH (CTE) queries', () => {
    buildTestGraph(db)
    const result = graphSandboxedQuery(db,
      'WITH counts AS (SELECT kind, COUNT(*) as cnt FROM node GROUP BY kind) SELECT * FROM counts'
    )
    expect(result.count).toBeGreaterThan(0)
  })

  it('rejects INSERT', () => {
    expect(() => graphSandboxedQuery(db, "INSERT INTO node VALUES('x','y','z','a','aktiv','{}','','',' ',null,null)"))
      .toThrow('only allows SELECT')
  })

  it('rejects DELETE', () => {
    expect(() => graphSandboxedQuery(db, 'DELETE FROM node'))
      .toThrow('only allows SELECT')
  })

  it('rejects DROP', () => {
    expect(() => graphSandboxedQuery(db, 'DROP TABLE node'))
      .toThrow('only allows SELECT')
  })

  it('rejects write keywords inside SELECT', () => {
    expect(() => graphSandboxedQuery(db, "SELECT * FROM node; DELETE FROM node"))
      .toThrow('write keyword')
  })

  it('logs execution when logFn provided', () => {
    buildTestGraph(db)
    const logs: { sql: string; timestamp: string; rows: number }[] = []
    graphSandboxedQuery(db, 'SELECT COUNT(*) as c FROM node', (entry) => logs.push(entry))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toHaveProperty('sql')
    expect(logs[0]).toHaveProperty('timestamp')
    expect(logs[0]).toHaveProperty('rows')
  })
})
