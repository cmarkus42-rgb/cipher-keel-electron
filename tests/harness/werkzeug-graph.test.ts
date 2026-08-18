import { describe, it, expect } from 'vitest'
import { GRAPH_WERKZEUGE } from '../../src/main/harness/werkzeug-graph'
import { TOOL_DEFINITIONS } from '../../src/main/graph/mcp-server'

const KTX_OHNE_DB = {
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
