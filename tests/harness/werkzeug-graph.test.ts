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
      expect(r.inhalt).toHaveLength(1)
      expect(r.inhalt[0].art).toBe('text')
      const text = r.inhalt[0].art === 'text' ? r.inhalt[0].text : ''

      // Das entscheidende Kriterium: es MUSS gueltiges JSON sein. Der alte Fehler war,
      // dass hier der serialisierte String mitten im Wert abgeschnitten wurde.
      const parsed = JSON.parse(text) as { gekuerzt: boolean; werkzeug: string; hinweis: string }

      expect(parsed.gekuerzt).toBe(true)
      expect(parsed.werkzeug).toBe('graph_suchen')
      expect(parsed.hinweis.toLowerCase()).toContain('ersetzt')
      expect(text.length).toBeLessThan(1000) // Ersatzobjekt ist klein, nicht die Rohdaten
    }
  })
})

// ============================================================================
// Fix-Runde 3: Fehlerbehandlung, Optionalfelder, Rumpf-Schranke
// ============================================================================

describe('Fix-Runde 3: Fehlerbehandlung und Validierung', () => {
  let db: Database.Database
  let ktx: WerkzeugKontext

  afterEach(() => { if (db?.open) db.close() })

  describe('Finding 1: Datenbankfehler duerfen keine Tabellennamen enthaellen', () => {
    it('meldet Fehler ohne Tabellenname wenn DB beschaedigt ist', async () => {
      db = openGraphDb({ path: ':memory:' })
      ktx = {
        wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
        graphDb: db,
      }

      // Destruktor: Tabelle löschen, um "no such table: node" zu erzeugen
      db.prepare('DROP TABLE node').run()

      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 'n1' }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        // Meldung darf keinen Tabellennamen enthalten (z.B. "node", "edge")
        expect(r.meldung).not.toMatch(/\btable\b.*\bnode\b/i)
        expect(r.meldung).not.toMatch(/\btable\b.*\bedge\b/i)
        // Sollte auf Deutsch sein und Werkzeugnamen enthalten
        expect(r.meldung).toContain('graph_knoten_holen')
      }
    })
  })

  describe('Finding 2: params bei graph_abfragen muss typsicher sein', () => {
    it('lehnt params vom falschen Typ (String) ab', async () => {
      db = openGraphDb({ path: ':memory:' })
      ktx = {
        wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
        graphDb: db,
      }

      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_abfragen')!
      const r = await w.ausfuehren({ template: 'herkunfts_kette', params: 'irgendeinstring' }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('params')
    })

    it('lehnt params vom falschen Typ (Array) ab', async () => {
      db = openGraphDb({ path: ':memory:' })
      ktx = {
        wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
        graphDb: db,
      }

      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_abfragen')!
      const r = await w.ausfuehren({ template: 'herkunfts_kette', params: ['array', 'statt', 'object'] }, ktx)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung.toLowerCase()).toContain('params')
    })
  })

  describe('Finding 3: Rumpf wird gekürzt bevor serialisiert', () => {
    it('kuerzt großen Rumpf nicht zu seiner vollstaendigen Groesse — und bleibt gueltiges JSON', async () => {
      db = openGraphDb({ path: ':memory:' })
      ktx = {
        wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
        graphDb: db,
      }

      // Knoten mit sehr großem Rumpf (120 KB, MAX_BODY_SIZE = 100 KB)
      // Der Rumpf sollte auf 100 KB gekürzt werden, nicht vollständig zurückgegeben
      const bigBody = 'x'.repeat(120000)
      db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
        VALUES (?, 'artefakt', ?, ?, 'aktiv', '{}', ?, ?, '2026-01-01')
      `).run('large', '/large.md', 'Large Document', bigBody, 'h1')

      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 'large' }, ktx)
      expect(r.ok).toBe(true)

      if (r.ok) {
        expect(r.inhalt).toHaveLength(1)
        const text = r.inhalt[0].art === 'text' ? r.inhalt[0].text : ''

        // Das entscheidende Kriterium: JSON.parse darf nicht werfen.
        const parsed = JSON.parse(text) as { body?: string; uid?: string }

        expect(parsed.uid).toBe('large')
        expect(parsed.body).toBeDefined()
        // Der Rumpf ist gekuerzt (nicht die vollen 120000 Zeichen), aber die grosszuegige
        // Body-Schranke laesst ihn ueberwiegend stehen.
        expect(parsed.body!.length).toBeLessThan(120000)
        expect(parsed.body!.length).toBeGreaterThan(100000)
        expect(parsed.body).toContain('[Rumpf gekürzt')
      }
    })

    it('reproduziert den urspruenglichen Fehlerfall: 40 KB Rumpf bleibt gueltiges JSON', async () => {
      // Der Bericht (Fund 1) nennt genau diesen Fall: ein Rumpf mitten im typischen Bereich
      // dieses Repos (25-180 KB Dokumente), weit unter der 100-KB-Body-Schranke, aber weit
      // ueber der alten 8192-Zeichen-Schranke auf dem serialisierten String. Vor dem Fix
      // schlug JSON.parse hier mit "Unterminated string in JSON at position 8192" fehl.
      db = openGraphDb({ path: ':memory:' })
      ktx = {
        wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
        graphDb: db,
      }

      const body40k = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(700) // ~40.7 KB
      db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
        VALUES (?, 'artefakt', ?, ?, 'aktiv', '{}', ?, ?, '2026-01-01')
      `).run('mid', '/mid.md', 'Mittelgrosses Dokument', body40k, 'h2')

      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 'mid' }, ktx)
      expect(r.ok).toBe(true)

      if (r.ok) {
        const text = r.inhalt[0].art === 'text' ? r.inhalt[0].text : ''
        expect(() => JSON.parse(text)).not.toThrow()
        const parsed = JSON.parse(text) as { body?: string }
        // Unter der Body-Schranke (100 KB): unveraendert, kein Kuerzungsmarker.
        expect(parsed.body).toBe(body40k)
        expect(parsed.body).not.toContain('[Rumpf gekürzt')
      }
    })

    it('faellt auf das Ersatzobjekt zurueck, wenn selbst der gekuerzte Rumpf plus Metadaten die Gesamtschranke reissen', async () => {
      // Selbstpruefung der Gesamtschranke fuer graph_knoten_holen: eine grosse frontmatter
      // zusaetzlich zu einem randvollen (aber schon body-gekuerzten) Rumpf muss den letzten
      // Riegel (MAX_NODE_JSON_SIZE) ausloesen — und darf auch dann nicht mitten im JSON enden.
      db = openGraphDb({ path: ':memory:' })
      ktx = {
        wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
        graphDb: db,
      }

      const bigBody = 'x'.repeat(120000) // wird auf 100 KB + Marker gekuerzt
      const bigFrontmatter = JSON.stringify({ blob: 'y'.repeat(20000) }) // 20 KB Metadaten
      db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
        VALUES (?, 'artefakt', ?, ?, 'aktiv', ?, ?, ?, '2026-01-01')
      `).run('huge-meta', '/huge-meta.md', 'Riesige Metadaten', bigFrontmatter, bigBody, 'h3')

      const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_knoten_holen')!
      const r = await w.ausfuehren({ uid: 'huge-meta' }, ktx)
      expect(r.ok).toBe(true)

      if (r.ok) {
        const text = r.inhalt[0].art === 'text' ? r.inhalt[0].text : ''
        const parsed = JSON.parse(text) as { gekuerzt?: boolean; werkzeug?: string }
        expect(parsed.gekuerzt).toBe(true)
        expect(parsed.werkzeug).toBe('graph_knoten_holen')
      }
    })
  })
})

// ============================================================================
// Fund 1 (Fix-Runde 4): alle vier Werkzeuge liefern IMMER gueltiges JSON, auch wenn eine
// lange Trefferliste die Gesamtschranke reisst — nicht nur graph_knoten_holen.
// ============================================================================

describe('Fund 1 (Fix-Runde 4): Groessenschranke bei allen vier Werkzeugen', () => {
  let db: Database.Database
  let ktx: WerkzeugKontext

  afterEach(() => { if (db?.open) db.close() })

  it('graph_ausweiten: viele Nachbarn reissen die Schranke, Ergebnis bleibt gueltiges JSON', async () => {
    db = openGraphDb({ path: ':memory:' })
    ktx = {
      wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
      graphDb: db,
    }

    db.prepare(`
      INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
      VALUES ('hub', 'artefakt', '/hub.md', 'Zentrum', 'aktiv', '{}', 'Body', 'h0', '2026-01-01')
    `).run()
    for (let i = 0; i < 300; i++) {
      const titel = `Nachbar Nummer ${i} mit einem etwas laengeren Titel zum Auffuellen`
      db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
        VALUES (?, 'artefakt', ?, ?, 'aktiv', '{}', 'Body', ?, '2026-01-01')
      `).run(`nb${i}`, `/nb${i}.md`, titel, `hn${i}`)
      db.prepare(`
        INSERT INTO edge (src, dst, type, source, erstellt)
        VALUES ('hub', ?, 'setzt_um', 'frontmatter', '2026-01-01')
      `).run(`nb${i}`)
    }

    const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_ausweiten')!
    const r = await w.ausfuehren({ uid: 'hub', depth: 1 }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = r.inhalt[0].art === 'text' ? r.inhalt[0].text : ''
      expect(() => JSON.parse(text)).not.toThrow()
      const parsed = JSON.parse(text) as { gekuerzt?: boolean; werkzeug?: string }
      expect(parsed.gekuerzt).toBe(true)
      expect(parsed.werkzeug).toBe('graph_ausweiten')
    }
  })

  it('graph_abfragen: viele Zeilen reissen die Schranke, Ergebnis bleibt gueltiges JSON', async () => {
    db = openGraphDb({ path: ':memory:' })
    ktx = {
      wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
      graphDb: db,
    }

    for (let i = 0; i < 100; i++) {
      const titel = `Anforderung ${i}: ` + 'ein langer Titel zum Auffuellen der Zeile '.repeat(4)
      db.prepare(`
        INSERT INTO node (uid, kind, path, title, status, frontmatter, body, content_hash, erstellt)
        VALUES (?, 'anforderung', ?, ?, 'aktiv', '{}', 'Body', ?, '2026-01-01')
      `).run(`req${i}`, `/req${i}.md`, titel, `hr${i}`)
    }

    const w = GRAPH_WERKZEUGE.find(w => w.name === 'graph_abfragen')!
    const r = await w.ausfuehren({ template: 'nodes_by_kind', params: { kind: 'anforderung', limit: 100 } }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = r.inhalt[0].art === 'text' ? r.inhalt[0].text : ''
      expect(() => JSON.parse(text)).not.toThrow()
      const parsed = JSON.parse(text) as { gekuerzt?: boolean; werkzeug?: string }
      expect(parsed.gekuerzt).toBe(true)
      expect(parsed.werkzeug).toBe('graph_abfragen')
    }
  })
})
