import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GRAPH_WERKZEUGE } from '../../src/main/harness/werkzeug-graph'
import { TOOL_DEFINITIONS } from '../../src/main/graph/mcp-server'
import type { WerkzeugKontext } from '../../src/main/harness/werkzeuge'

const KTX_OHNE_DB: WerkzeugKontext = {
  wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
  graphDb: null,
}

describe('Graph-Werkzeuge', () => {
  it('bietet genau die vier lesenden Operationen', () => {
    expect(GRAPH_WERKZEUGE.map(w => w.name).sort())
      .toEqual(['graph_abfragen', 'graph_ausweiten', 'graph_knoten_holen', 'graph_suchen'])
  })

  it('bietet keine schreibende Operation an', () => {
    const namen = GRAPH_WERKZEUGE.map(w => w.name).join(' ')
    expect(namen).not.toContain('upsert')
    expect(namen).not.toContain('link')
    expect(namen).not.toContain('maintain')
  })

  it('meldet eine fehlende Graphdatenbank, statt einen leeren Treffer vorzutaeuschen', async () => {
    for (const w of GRAPH_WERKZEUGE) {
      const r = await w.ausfuehren({ query: 'x', uid: 'y', template: 'z' }, KTX_OHNE_DB)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung).toContain('Knowledge-Graph')
    }
  })
})

/**
 * M8 section 4.1's construction: one source, two renderings. The MCP server and the harness
 * tools must offer the same four read operations — if one grows a fifth, this fails.
 */
describe('Waechter: eine Quelle, zwei Renderungen', () => {
  it('deckt dieselben vier Lese-Operationen ab wie der MCP-Server', () => {
    const LESEND = ['graph_search', 'graph_get_node', 'graph_expand', 'graph_query']
    const imServer = TOOL_DEFINITIONS.map(t => t.name).filter(n => LESEND.includes(n)).sort()
    expect(imServer).toEqual([...LESEND].sort())
    expect(GRAPH_WERKZEUGE.length).toBe(imServer.length)
  })
})

// ============================================================================
// Tests gegen echte Graphdatenbank — Erfolgspfade und Randfälle
// ============================================================================

describe('Graph-Werkzeuge gegen echte DB', () => {
  let db: Database.Database
  let ktx: WerkzeugKontext

  afterEach(() => { if (db?.open) db.close() })

  // Setup für jeden Test
  function setupDb() {
    db = openGraphDb({ path: ':memory:' })
    ktx = {
      wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
      graphDb: db,
    }
    // Knoten für Tests einfügen
    db.prepare(`
      INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
      VALUES ('n1', 'anforderung', '/n1.md', 'Anforderung eins', 'aktiv', '{}', 'Body A', 'h1', '2026-01-01')
    `).run()
    db.prepare(`
      INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
      VALUES ('n2', 'entscheidung', '/n2.md', 'Entscheidung zwei', 'aktiv', '{}', 'Body B', 'h2', '2026-01-02')
    `).run()
    db.prepare(`
      INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
      VALUES ('n3', 'artefakt', '/n3.md', 'Artefakt Anfang', 'aktiv', '{"tags":["test"]}', 'Body C', 'h3', '2026-01-03')
    `).run()
    // Edge für Expand-Tests
    db.prepare(`
      INSERT INTO edge (src, dst, type, source, erstellt)
      VALUES ('n1', 'n2', 'begruendet', 'frontmatter', '2026-01-01')
    `).run()
    // FTS indexieren
    db.prepare(`INSERT INTO node_fts (uid, title, body) VALUES ('n1', 'Anforderung eins', 'Body A')`).run()
    db.prepare(`INSERT INTO node_fts (uid, title, body) VALUES ('n2', 'Entscheidung zwei', 'Body B')`).run()
    db.prepare(`INSERT INTO node_fts (uid, title, body) VALUES ('n3', 'Artefakt Anfang', 'Body C')`).run()
  }

  describe('graph_suchen (erfolgreich)', () => {
    it('findet Knoten nach Suchbegriff', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_suchen')!
      const r = await w.ausfuehren({ query: 'Anforderung' }, ktx)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const txt = JSON.stringify(r.inhalt)
        expect(txt).toContain('n1')
        expect(txt).toContain('Anforderung eins')
      }
    })

    it('respektiert limit Parameter', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_suchen')!
      const r = await w.ausfuehren({ query: 'Artefakt Entscheidung Anforderung', limit: 1 }, ktx)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const txt = JSON.stringify(r.inhalt)
        // Mit limit: 1 sollten nicht alle drei Treffer drin sein
        const matches = (txt.match(/uid/g) || []).length
        expect(matches).toBeLessThanOrEqual(2)
      }
    })
  })

  describe('graph_suchen (Randfälle)', () => {
    it('lehnt query vom falschen Typ ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_suchen')!
      const r = await w.ausfuehren({ query: 123 }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('query')
    })

    it('lehnt negatives limit ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_suchen')!
      const r = await w.ausfuehren({ query: 'Test', limit: -10 }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('limit')
    })

    it('lehnt zu großes limit ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_suchen')!
      const r = await w.ausfuehren({ query: 'Test', limit: 100000 }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('limit')
    })
  })

  describe('graph_knoten_holen (erfolgreich)', () => {
    it('laedt einen existierenden Knoten vollstaendig', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 'n1' }, ktx)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const txt = JSON.stringify(r.inhalt)
        expect(txt).toContain('Anforderung eins')
        expect(txt).toContain('Body A')
      }
    })

    it('meldet gefunden: false fuer nicht existierenden Knoten', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 'nicht_existiert' }, ktx)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const txt = JSON.stringify(r.inhalt)
        expect(txt).toContain('gefunden')
        expect(txt).toContain('false')
      }
    })
  })

  describe('graph_knoten_holen (Randfälle)', () => {
    it('lehnt uid vom falschen Typ ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 456 }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('uid')
    })
  })

  describe('graph_ausweiten (erfolgreich)', () => {
    it('weitet Nachbarschaft aus', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_ausweiten')!
      const r = await w.ausfuehren({ uid: 'n1' }, ktx)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const txt = JSON.stringify(r.inhalt)
        expect(txt).toContain('n1')
      }
    })
  })

  describe('graph_ausweiten (Randfälle)', () => {
    it('lehnt uid vom falschen Typ ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_ausweiten')!
      const r = await w.ausfuehren({ uid: null }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('uid')
    })

    it('lehnt ungültige depth ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_ausweiten')!
      const r = await w.ausfuehren({ uid: 'n1', depth: 'nicht-numerisch' }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('depth')
    })
  })

  describe('graph_abfragen (erfolgreich)', () => {
    it('führt eine bekannte Vorlage aus', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_abfragen')!
      const r = await w.ausfuehren({ template: 'herkunfts_kette', params: { uid: 'n1' } }, ktx)
      expect(r.ok).toBe(true)
    })
  })

  describe('graph_abfragen (Randfälle)', () => {
    it('lehnt template vom falschen Typ ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_abfragen')!
      const r = await w.ausfuehren({ template: ['array'] }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('template')
    })

    it('lehnt unbekannte Vorlage mit deutscher Meldung ab', async () => {
      setupDb()
      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_abfragen')!
      const r = await w.ausfuehren({ template: 'vorlage_existiert_nicht' }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        // Darf kein englischer Wortschwall sein
        expect(r.meldung).not.toMatch(/SELECT|SQL|sqlite/i)
        expect(r.meldung.toLowerCase()).toContain('vorlage')
      }
    })
  })
})

// ============================================================================
// JSON-Größenschranke: Ergebnis wird gekürzt wenn es 8 KB überschreitet
// ============================================================================

describe('JSON-Groessenschranke (8 KB)', () => {
  let db: Database.Database
  let ktx: WerkzeugKontext

  afterEach(() => { if (db?.open) db.close() })

  it('kuerzt Ergebnisse die 8 KB ueberschreiten', async () => {
    // Erstelle viele große Knoten, damit die Suche ein großes Ergebnis liefert
    db = openGraphDb({ path: ':memory:' })
    ktx = {
      wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
      graphDb: db,
    }

    // Einfügen von 100 großen Knoten mit "test" im Titel
    // Jeder Knoten: uid (5 chars) + title + body = ~1KB pro Knoten serialisiert
    for (let i = 0; i < 100; i++) {
      const bigBody = 'Lorem ipsum dolor sit amet. '.repeat(30) // ~840 Zeichen pro Knoten
      db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
        VALUES (?, 'test', ?, ?, 'aktiv', '{}', ?, ?, '2026-01-01')
      `).run(`n${i}`, `/n${i}.md`, `test article ${i}`, bigBody, `h${i}`)
    }

    // FTS indexieren
    for (let i = 0; i < 100; i++) {
      const bigBody = 'Lorem ipsum dolor sit amet. '.repeat(30)
      db.prepare(`
        INSERT INTO node_fts (uid, title, body) VALUES (?, ?, ?)
      `).run(`n${i}`, `test article ${i}`, bigBody)
    }

    const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_suchen')!
    const r = await w.ausfuehren({ query: 'test', limit: 100 }, ktx)
    expect(r.ok).toBe(true)

    if (r.ok) {
      // Der Text sollte gekürzt sein
      const textBlocks = r.inhalt.filter(i => i.art === 'text')
      const textContent = textBlocks
        .map(i => {
          if (i.art === 'text') return i.text
          return ''
        })
        .join('')
      expect(textContent.length).toBeLessThanOrEqual(8192 + 200) // 8KB + Hinweis-Overhead

      // Der Hinweis sollte da sein UND sagen, dass es nicht JSON-lesbar mehr ist
      const hinweis = textBlocks.find(i => i.art === 'text' && i.text.includes('gekürzt'))
      expect(hinweis).toBeDefined()
      if (hinweis?.art === 'text') {
        expect(hinweis.text).toContain('nicht mehr als JSON lesbar')
      }
    }
  })
})
