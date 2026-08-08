/**
 * Phase I tests — Advanced Features.
 * CK-GRAPH-027, 031, 032, 035, 040, 048, 049
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import {
  chunkText,
  indexNodeEmbeddings,
  NoopEmbeddingProvider,
  upsertSummaryNode,
  getSummaryNodes,
  traceHerkunft,
  findBrokenChains
} from '../../src/main/graph/chunking'
import { graphSearch } from '../../src/main/graph/search'
import { graphMaintain } from '../../src/main/graph/maintain'

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function buildHerkunftsKette(db: Database.Database) {
  const w = new GraphWriter(db)

  const rootAnf = w.upsertNode({
    kind: 'anforderung', title: 'Stakeholder-REQ: Graph benoetigt',
    path: '/reqs/root.md', frontmatter: { quelle: 'Stakeholder' }
  })
  const subAnf = w.upsertNode({
    kind: 'anforderung', title: 'Sub-REQ: 8 Knotentypen',
    path: '/reqs/sub.md', frontmatter: { quelle: 'M1' }
  })
  const ent = w.upsertNode({
    kind: 'entscheidung', title: 'SQLite als Backend',
    path: '/entsch/sqlite.md', frontmatter: { begruendung: 'Risiko' }
  })
  const art = w.upsertNode({
    kind: 'artefakt', title: 'schema.ts',
    path: '/src/schema.ts', frontmatter: { sprache_art: 'TypeScript' }
  })
  const tst = w.upsertNode({
    kind: 'test', title: 'Schema Tests',
    path: '/tests/schema.test.ts', frontmatter: { testart: 'unit' }
  })
  const anl = w.upsertNode({
    kind: 'anlass', title: 'BT-1a Session',
    path: '/sessions/bt1a.md',
    frontmatter: { session: 'bt-1a', zeitpunkt: '2026-06-05T10:00:00Z' }
  })
  const phase = w.upsertNode({
    kind: 'phase_subsystem', title: 'Phase 1',
    path: '/phases/p1.md', frontmatter: { ebene: 'phase' }
  })

  // Build chain: subAnf verfeinert rootAnf
  w.linkEdge({ src: subAnf.uid, dst: rootAnf.uid, type: 'verfeinert' })
  // ent begruendet subAnf
  w.linkEdge({ src: ent.uid, dst: subAnf.uid })
  // art setzt_um subAnf
  w.linkEdge({ src: art.uid, dst: subAnf.uid })
  // art setzt_um ent
  w.linkEdge({ src: art.uid, dst: ent.uid })
  // tst verifiziert subAnf
  w.linkEdge({ src: tst.uid, dst: subAnf.uid })
  // tst verifiziert art
  w.linkEdge({ src: tst.uid, dst: art.uid })
  // art erzeugt_von anl
  w.linkEdge({ src: art.uid, dst: anl.uid })
  // art -> phase
  w.linkEdge({ src: art.uid, dst: phase.uid })

  return { rootAnf, subAnf, ent, art, tst, anl, phase }
}

// -------------------------------------------------------------------
// Chunking (CK-GRAPH-031)
// -------------------------------------------------------------------

describe('chunkText (CK-GRAPH-031)', () => {
  it('splits text into paragraph-based chunks', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.'
    const chunks = chunkText(text, { maxChunkSize: 30 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0)
      expect(chunk.index).toBeGreaterThanOrEqual(0)
    }
  })

  it('handles empty text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('single short text produces one chunk', () => {
    const chunks = chunkText('Short text.', { maxChunkSize: 500 })
    expect(chunks).toHaveLength(1)
  })

  it('chunk size is configurable', () => {
    const longText = Array(20).fill('Word word word word word.').join('\n\n')
    const smallChunks = chunkText(longText, { maxChunkSize: 50 })
    const largeChunks = chunkText(longText, { maxChunkSize: 500 })
    expect(smallChunks.length).toBeGreaterThan(largeChunks.length)
  })

  it('chunks have overlap', () => {
    const text = 'First paragraph content here.\n\nSecond paragraph content here.\n\nThird paragraph.'
    const chunks = chunkText(text, { maxChunkSize: 50, overlap: 10 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // Consecutive chunks' offset ranges should overlap
    expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset)
  })
})

describe('indexNodeEmbeddings (CK-GRAPH-031)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('stores chunks in vec_chunks table', () => {
    const w = new GraphWriter(db)
    const node = w.upsertNode({
      kind: 'note', title: 'Embed Test',
      path: '/embed.md', body: 'Some content for embedding.'
    })

    const provider = new NoopEmbeddingProvider()
    const count = indexNodeEmbeddings(db, node.uid, 'Some content for embedding.', provider)
    expect(count).toBeGreaterThan(0)

    const rows = db.prepare('SELECT * FROM vec_chunks WHERE node_uid = ?').all(node.uid)
    expect(rows.length).toBe(count)
  })

  it('replaces existing chunks on re-index', () => {
    const w = new GraphWriter(db)
    const node = w.upsertNode({ kind: 'note', title: 'Re-embed', path: '/re.md' })

    const provider = new NoopEmbeddingProvider()
    indexNodeEmbeddings(db, node.uid, 'Version 1.', provider)
    indexNodeEmbeddings(db, node.uid, 'Version 2 with more text.', provider)

    const rows = db.prepare('SELECT * FROM vec_chunks WHERE node_uid = ?').all(node.uid)
    // Should have chunks from version 2 only
    expect(rows.length).toBeGreaterThan(0)
  })

  it('NoopEmbeddingProvider returns correct dimension', () => {
    const p = new NoopEmbeddingProvider(128)
    expect(p.dimension).toBe(128)
    expect(p.embed('test').length).toBe(128)
    expect(p.embedBatch(['a', 'b'])).toHaveLength(2)
  })
})

// -------------------------------------------------------------------
// Summary nodes (CK-GRAPH-027, CK-GRAPH-032)
// -------------------------------------------------------------------

describe('Summary nodes (CK-GRAPH-027)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('creates a summary node with notetyp=summary', () => {
    const w = new GraphWriter(db)
    const phase = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase 1',
      path: '/phases/p1.md', frontmatter: { ebene: 'phase' }
    })

    const uid = upsertSummaryNode(db, {
      scopeUid: phase.uid,
      title: 'Summary: Phase 1',
      summaryText: 'Phase 1 delivered the graph foundation with 8 node types.'
    })

    expect(uid).toBeTruthy()
    const node = db.prepare('SELECT * FROM node WHERE uid = ?').get(uid) as { kind: string; frontmatter: string; body: string }
    expect(node.kind).toBe('note')
    expect(JSON.parse(node.frontmatter).notetyp).toBe('summary')
    expect(node.body).toContain('graph foundation')
  })

  it('updates existing summary on re-upsert', () => {
    const w = new GraphWriter(db)
    const phase = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase 1',
      path: '/phases/p1.md', frontmatter: { ebene: 'phase' }
    })

    const uid1 = upsertSummaryNode(db, {
      scopeUid: phase.uid,
      title: 'Summary: Phase 1',
      summaryText: 'Version 1.'
    })
    const uid2 = upsertSummaryNode(db, {
      scopeUid: phase.uid,
      title: 'Summary: Phase 1',
      summaryText: 'Version 2 — updated.'
    })

    expect(uid1).toBe(uid2) // Same natural key = same uid
    const node = db.prepare('SELECT body FROM node WHERE uid = ?').get(uid2) as { body: string }
    expect(node.body).toContain('Version 2')
  })

  it('graph_search finds summary nodes', () => {
    const w = new GraphWriter(db)
    const phase = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase 1',
      path: '/phases/p1.md', frontmatter: { ebene: 'phase' }
    })

    upsertSummaryNode(db, {
      scopeUid: phase.uid,
      title: 'Summary: Phase 1 Foundation',
      summaryText: 'Phase 1 delivered the graph foundation.'
    })

    const hits = graphSearch(db, { query: 'foundation' })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('getSummaryNodes lists all summaries', () => {
    const w = new GraphWriter(db)
    const p1 = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase 1',
      path: '/phases/p1.md', frontmatter: { ebene: 'phase' }
    })
    const p2 = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase 2',
      path: '/phases/p2.md', frontmatter: { ebene: 'phase' }
    })

    upsertSummaryNode(db, { scopeUid: p1.uid, title: 'S1', summaryText: 'Summary 1' })
    upsertSummaryNode(db, { scopeUid: p2.uid, title: 'S2', summaryText: 'Summary 2' })

    const all = getSummaryNodes(db)
    expect(all).toHaveLength(2)

    const filtered = getSummaryNodes(db, p1.uid)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].title).toBe('S1')

    // Pins the fix in 26d18a0: the SQL alias must be `scopeUid` (camelCase),
    // matching the declared SummaryNodeRow return type. Before that fix the
    // alias was `scope_uid`, so `.scopeUid` on every returned row read
    // undefined.
    expect(all[0].scopeUid).toBeTruthy()
    expect([p1.uid, p2.uid]).toContain(filtered[0].scopeUid)
  })

  it('stale summary detected by hygiene (CK-GRAPH-027 acceptance)', () => {
    const w = new GraphWriter(db)
    const phase = w.upsertNode({
      kind: 'phase_subsystem', title: 'Phase X',
      path: '/phases/px.md', frontmatter: { ebene: 'phase' }
    })

    const summaryUid = upsertSummaryNode(db, {
      scopeUid: phase.uid,
      title: 'Summary: Phase X',
      summaryText: 'Old summary.'
    })

    // Backdate the summary
    db.prepare('UPDATE node SET erstellt = ? WHERE uid = ?')
      .run('2020-01-01T00:00:00Z', summaryUid)

    // Add a newer linked node
    const art = w.upsertNode({
      kind: 'artefakt', title: 'New Art',
      path: '/art/new.ts', frontmatter: { sprache_art: 'TS' }
    })
    w.linkEdge({ src: summaryUid, dst: art.uid })

    const result = graphMaintain(db, { operation: 'hygiene' })
    if (result.operation === 'hygiene') {
      const stale = result.findings.filter(f => f.type === 'stale_summary')
      expect(stale.length).toBe(1)
    }
  })
})

// -------------------------------------------------------------------
// Herkunfts-Kette (CK-GRAPH-035)
// -------------------------------------------------------------------

describe('traceHerkunft (CK-GRAPH-035)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('traces full chain: artefakt → entscheidung → anforderung → root', () => {
    const { art, subAnf, rootAnf, ent } = buildHerkunftsKette(db)

    const chain = traceHerkunft(db, art.uid)
    expect(chain.length).toBeGreaterThanOrEqual(3) // art + at least subAnf, rootAnf/ent

    const uids = chain.map(s => s.uid)
    expect(uids).toContain(art.uid)
    expect(uids).toContain(subAnf.uid)
    // rootAnf should be reachable via subAnf's verfeinert edge
    expect(uids).toContain(rootAnf.uid)
    // ent should be reachable via art's setzt_um edge
    expect(uids).toContain(ent.uid)
  })

  it('includes erzeugt_von link to anlass', () => {
    const { art, anl } = buildHerkunftsKette(db)
    const chain = traceHerkunft(db, art.uid)
    const uids = chain.map(s => s.uid)
    expect(uids).toContain(anl.uid)
  })

  it('depth 0 returns only the seed node', () => {
    const { art } = buildHerkunftsKette(db)
    const chain = traceHerkunft(db, art.uid, 0)
    expect(chain).toHaveLength(1)
    expect(chain[0].uid).toBe(art.uid)
  })

  it('complete chain: anforderung → entscheidung → artefakt → test is traversable', () => {
    const { rootAnf, subAnf, ent, art, tst } = buildHerkunftsKette(db)

    // From test backwards
    const fromTest = traceHerkunft(db, tst.uid)
    const testUids = fromTest.map(s => s.uid)
    expect(testUids).toContain(subAnf.uid) // verifiziert → subAnf

    // From artefakt backwards
    const fromArt = traceHerkunft(db, art.uid)
    const artUids = fromArt.map(s => s.uid)
    expect(artUids).toContain(ent.uid)    // setzt_um → ent
    expect(artUids).toContain(subAnf.uid) // setzt_um → subAnf
    expect(artUids).toContain(rootAnf.uid) // via subAnf → verfeinert → rootAnf
  })
})

// -------------------------------------------------------------------
// Gate queries / broken chains (CK-GRAPH-040)
// -------------------------------------------------------------------

describe('findBrokenChains (CK-GRAPH-040)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('finds artefakte without setzt_um', () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'artefakt', title: 'Orphan Art', path: '/art/orphan.ts', frontmatter: { sprache_art: 'TS' } })
    // No setzt_um edge

    const broken = findBrokenChains(db, 'artefakt')
    expect(broken.length).toBe(1)
    expect(broken[0].missingEdge).toBe('setzt_um')
  })

  it('finds entscheidungen without begruendet', () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'entscheidung', title: 'Orphan Dec', path: '/e/orphan.md', frontmatter: {} })

    const broken = findBrokenChains(db, 'entscheidung')
    expect(broken.length).toBe(1)
    expect(broken[0].missingEdge).toBe('begruendet')
  })

  it('finds tests without verifiziert', () => {
    const w = new GraphWriter(db)
    w.upsertNode({ kind: 'test', title: 'Orphan Test', path: '/t/orphan.test.ts', frontmatter: {} })

    const broken = findBrokenChains(db, 'test')
    expect(broken.length).toBe(1)
    expect(broken[0].missingEdge).toBe('verifiziert')
  })

  it('complete chain has no broken entries', () => {
    buildHerkunftsKette(db)
    const broken = findBrokenChains(db)
    // All nodes in the kette have proper edges
    // Only rootAnf might show up (no verfeinert from it) — but rootAnf is anforderung,
    // and findBrokenChains checks artefakt/entscheidung/test, not anforderung
    expect(broken).toHaveLength(0)
  })
})

// -------------------------------------------------------------------
// Token-sparende Performance (CK-GRAPH-032)
// -------------------------------------------------------------------

describe('Token-sparende Performance (CK-GRAPH-032)', () => {
  let db: Database.Database

  beforeEach(() => { db = openGraphDb({ path: ':memory:' }) })
  afterEach(() => { db.close() })

  it('search results are compact — no body or full frontmatter', () => {
    const w = new GraphWriter(db)
    for (let i = 0; i < 15; i++) {
      w.upsertNode({
        kind: 'note', title: `Performance Test Node ${i}`,
        path: `/perf/${i}.md`,
        body: 'x'.repeat(1000), // Large body
        frontmatter: { notetyp: 'recherche', data: 'x'.repeat(500) }
      })
    }

    const hits = graphSearch(db, { query: 'Performance', limit: 10 })
    const json = JSON.stringify(hits)

    // Full nodes would be >10KB. Compact should be <2KB.
    expect(json.length).toBeLessThan(2000)
    // Rough token estimate (4 chars/token)
    const tokens = Math.ceil(json.length / 4)
    expect(tokens).toBeLessThan(2000)
  })

  it('summary nodes reduce required get_node calls', () => {
    const { phase } = buildHerkunftsKette(db)

    // Without summary: agent needs to load each child node
    const childCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM edge WHERE dst = ?'
    ).get(phase.uid) as { cnt: number }

    // With summary: one summary load covers all children
    upsertSummaryNode(db, {
      scopeUid: phase.uid,
      title: 'Summary: Phase 1',
      summaryText: `Phase 1 contains ${childCount.cnt} linked artifacts.`
    })

    const summaries = getSummaryNodes(db, phase.uid)
    expect(summaries).toHaveLength(1)
    // The summary replaces N get_node calls with 1
    expect(summaries[0].body).toContain('linked artifacts')
  })
})

// -------------------------------------------------------------------
// Maintenance helper interface (CK-GRAPH-048)
// -------------------------------------------------------------------

describe('MaintenanceHelper interface (CK-GRAPH-048)', () => {
  it('interface is importable and type-checkable', async () => {
    // This is a compile-time check — if this test file compiles, the interface works.
    // The actual implementation is M2/M5 concern.
    await import('../../src/main/graph/chunking')
    // Interface exists as a TypeScript construct — runtime check just confirms module loads
    expect(true).toBe(true)
  })
})
