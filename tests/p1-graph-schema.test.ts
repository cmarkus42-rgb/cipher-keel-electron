/**
 * P1 Graph-Schema tests.
 * CK-P1-001: Uebergabedokument-Typen
 * CK-P1-012: REQ-ID-Schema
 * CK-P1-013: M1-Kanten-Set
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter, SchemaError } from '../src/main/graph/writer'
import { graphQuery, graphSandboxedQuery } from '../src/main/graph/query'
import {
  DOKUMENT_TYPEN,
  isValidDokumentTyp,
  type DokumentTyp
} from '../src/main/graph/node-types'
import {
  EDGE_TYPES,
  isValidEdgeType,
  validateUebergabedokumentEdge
} from '../src/main/graph/edge-types'
import {
  validateReqId,
  parseReqId,
  checkDuplicates,
  REQ_ID_PREFIXES
} from '../src/main/p1/req-id-schema'

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db?.open && db.close()
})

// ---------------------------------------------------------------------------
// CK-P1-001: Sieben Uebergabedokument-Typen
// ---------------------------------------------------------------------------

describe('DOKUMENT_TYPEN (CK-P1-001)', () => {
  it('contains exactly 9 valid values', () => {
    expect(DOKUMENT_TYPEN).toHaveLength(9)
    const expected: DokumentTyp[] = [
      'anforderungen', 'spec', 'architektur-paket',
      'build-paket', 'test-findings', 'fix-report', 'audit-summary',
      'rueckweg-befund', 'architect-handoff',
    ]
    for (const typ of expected) {
      expect(DOKUMENT_TYPEN).toContain(typ)
    }
  })
})

describe('isValidDokumentTyp (CK-P1-001)', () => {
  it('accepts all 7 valid values', () => {
    for (const typ of DOKUMENT_TYPEN) {
      expect(isValidDokumentTyp(typ)).toBe(true)
    }
  })

  it('rejects invalid values', () => {
    expect(isValidDokumentTyp('anforderung')).toBe(false)   // singular form
    expect(isValidDokumentTyp('bericht')).toBe(false)
    expect(isValidDokumentTyp('')).toBe(false)
  })
})

describe('graph_write: alle 7 Dokumenttypen anlegen (CK-P1-001)', () => {
  for (const typ of [
    'anforderungen', 'spec', 'architektur-paket',
    'build-paket', 'test-findings', 'fix-report', 'audit-summary'
  ] as DokumentTyp[]) {
    it(`anlegen und zuruecklesen: ${typ}`, () => {
      const r = writer.upsertNode({
        kind: 'uebergabedokument',
        title: `Testdokument ${typ}`,
        path: `/vault/${typ}.md`,
        frontmatter: { dokumentTyp: typ }
      })
      expect(r.created).toBe(true)

      const result = graphQuery(db, {
        template: 'nodes_by_kind',
        params: { kind: 'uebergabedokument' }
      })
      const found = result.rows.find(row => row.uid === r.uid)
      expect(found).toBeDefined()
      const fm = JSON.parse(found!.frontmatter as string)
      expect(fm.dokumentTyp).toBe(typ)
    })
  }
})

describe('Schema-Validation: ungueltige dokumentTyp abgelehnt (CK-P1-001)', () => {
  it('rejects node with unknown dokumentTyp', () => {
    expect(() => writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Ungueltig',
      path: '/vault/ungueltig.md',
      frontmatter: { dokumentTyp: 'protokoll' }
    })).toThrow(SchemaError)
  })

  it('rejects node without dokumentTyp field', () => {
    expect(() => writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Kein Typ',
      path: '/vault/keintyp.md',
      frontmatter: {}
    })).toThrow(SchemaError)
  })

  it('error message mentions dokumentTyp', () => {
    try {
      writer.upsertNode({
        kind: 'uebergabedokument',
        title: 'X',
        frontmatter: { dokumentTyp: 'ungueltig' }
      })
      expect.fail('Should have thrown')
    } catch (e: any) {
      expect(e.message).toContain('dokumentTyp')
    }
  })
})

// ---------------------------------------------------------------------------
// CK-P1-013: M1-Kanten-Set
// ---------------------------------------------------------------------------

describe('EDGE_TYPES: neue Kanten-Typen (CK-P1-013)', () => {
  const newEdgeTypes = ['phaseninput_fuer', 'behebt', 'referenziert', 'prueft']

  it('enthaelt alle 4 neuen Kanten-Typen', () => {
    for (const et of newEdgeTypes) {
      expect(EDGE_TYPES).toContain(et)
      expect(isValidEdgeType(et)).toBe(true)
    }
  })

  it('enthaelt weiterhin alle bisherigen Kanten-Typen', () => {
    const existing = ['verweist_auf', 'verfeinert', 'begruendet', 'setzt_um',
      'verifiziert', 'erzeugt_von', 'abgeloest_durch', 'naechste_phase',
      'traegt_phase', 'hat_github_repo']
    for (const et of existing) {
      expect(EDGE_TYPES).toContain(et)
    }
  })
})

describe('validateUebergabedokumentEdge (CK-P1-013)', () => {
  it('erlaubt spec verfeinert anforderungen', () => {
    expect(validateUebergabedokumentEdge('verfeinert', 'spec', 'anforderungen')).toBeNull()
  })

  it('erlaubt architektur-paket setzt_um spec', () => {
    expect(validateUebergabedokumentEdge('setzt_um', 'architektur-paket', 'spec')).toBeNull()
  })

  it('erlaubt build-paket setzt_um architektur-paket', () => {
    expect(validateUebergabedokumentEdge('setzt_um', 'build-paket', 'architektur-paket')).toBeNull()
  })

  it('erlaubt test-findings verifiziert build-paket', () => {
    expect(validateUebergabedokumentEdge('verifiziert', 'test-findings', 'build-paket')).toBeNull()
  })

  it('erlaubt fix-report behebt test-findings', () => {
    expect(validateUebergabedokumentEdge('behebt', 'fix-report', 'test-findings')).toBeNull()
  })

  it('erlaubt audit-summary prueft fix-report', () => {
    expect(validateUebergabedokumentEdge('prueft', 'audit-summary', 'fix-report')).toBeNull()
  })

  it('lehnt anforderungen behebt spec ab', () => {
    expect(validateUebergabedokumentEdge('behebt', 'anforderungen', 'spec')).not.toBeNull()
  })

  it('lehnt spec prueft anforderungen ab', () => {
    expect(validateUebergabedokumentEdge('prueft', 'spec', 'anforderungen')).not.toBeNull()
  })

  it('lehnt anforderungen verifiziert spec ab', () => {
    expect(validateUebergabedokumentEdge('verifiziert', 'anforderungen', 'spec')).not.toBeNull()
  })
})

describe('Ketten-Traversal: anforderungen → ... → audit-summary (CK-P1-013)', () => {
  it('traversal ueber phaseninput_fuer-Ketten liefert alle 7 Dokumente', () => {
    // Alle 7 Knoten anlegen
    const typen: DokumentTyp[] = [
      'anforderungen', 'spec', 'architektur-paket',
      'build-paket', 'test-findings', 'fix-report', 'audit-summary'
    ]
    const uids: Record<string, string> = {}
    for (const typ of typen) {
      const r = writer.upsertNode({
        kind: 'uebergabedokument',
        title: `Doc ${typ}`,
        path: `/vault/${typ}.md`,
        frontmatter: { dokumentTyp: typ }
      })
      uids[typ] = r.uid
    }

    // Kette per phaseninput_fuer verbinden
    const kette: [DokumentTyp, DokumentTyp][] = [
      ['anforderungen', 'spec'],
      ['spec', 'architektur-paket'],
      ['architektur-paket', 'build-paket'],
      ['build-paket', 'test-findings'],
      ['test-findings', 'fix-report'],
      ['fix-report', 'audit-summary']
    ]
    for (const [src, dst] of kette) {
      writer.linkEdge({
        src: uids[src],
        dst: uids[dst],
        type: 'phaseninput_fuer',
        source: 'inferred'
      })
    }

    // Traversal via recursive CTE ueber phaseninput_fuer-Kanten
    // SAFE: uid is generated by writer.upsertNode (ULID), not user input — no injection risk.
    const result = graphSandboxedQuery(db, `
      WITH RECURSIVE kette(uid, depth) AS (
        SELECT uid, 0 FROM node WHERE uid = '${uids['anforderungen']}'
        UNION ALL
        SELECT e.dst, k.depth + 1
        FROM kette k
        JOIN edge e ON e.src = k.uid AND e.type = 'phaseninput_fuer'
        WHERE k.depth < 10
      )
      SELECT DISTINCT uid FROM kette
    `)

    // Alle 7 Dokumente muessen erreichbar sein
    const reachedUids = result.rows.map(r => r.uid)
    for (const typ of typen) {
      expect(reachedUids).toContain(uids[typ])
    }
  })

  it('semantische Kanten setzbar: spec verfeinert anforderungen', () => {
    const anfUID = writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Anforderungen',
      path: '/vault/anforderungen.md',
      frontmatter: { dokumentTyp: 'anforderungen' }
    }).uid

    const specUID = writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Spec',
      path: '/vault/spec.md',
      frontmatter: { dokumentTyp: 'spec' }
    }).uid

    const edge = writer.linkEdge({
      src: specUID,
      dst: anfUID,
      type: 'verfeinert',
      source: 'frontmatter'
    })
    expect(edge.type).toBe('verfeinert')
    expect(edge.created).toBe(true)
  })

  it('behebt-Kante: fix-report → test-findings', () => {
    const tfUID = writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Test Findings',
      path: '/vault/test-findings.md',
      frontmatter: { dokumentTyp: 'test-findings' }
    }).uid

    const frUID = writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Fix Report',
      path: '/vault/fix-report.md',
      frontmatter: { dokumentTyp: 'fix-report' }
    }).uid

    const edge = writer.linkEdge({
      src: frUID,
      dst: tfUID,
      type: 'behebt',
      source: 'frontmatter'
    })
    expect(edge.type).toBe('behebt')
    expect(edge.created).toBe(true)
  })

  it('prueft-Kante: audit-summary → fix-report', () => {
    const frUID = writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Fix Report',
      path: '/vault/fix-report2.md',
      frontmatter: { dokumentTyp: 'fix-report' }
    }).uid

    const asUID = writer.upsertNode({
      kind: 'uebergabedokument',
      title: 'Audit Summary',
      path: '/vault/audit-summary.md',
      frontmatter: { dokumentTyp: 'audit-summary' }
    }).uid

    const edge = writer.linkEdge({
      src: asUID,
      dst: frUID,
      type: 'prueft',
      source: 'frontmatter'
    })
    expect(edge.type).toBe('prueft')
    expect(edge.created).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CK-P1-012: REQ-ID-Schema
// ---------------------------------------------------------------------------

describe('REQ_ID_PREFIXES (CK-P1-012)', () => {
  it('definiert genau 9 Praefixe', () => {
    expect(Object.keys(REQ_ID_PREFIXES)).toHaveLength(9)
  })

  it('enthaelt alle vorgesehenen Praefixe', () => {
    const expected = ['SA', 'REQ', 'NFR', 'BUG', 'MFR', 'NRF', 'C', 'M', 'N']
    for (const p of expected) {
      expect(REQ_ID_PREFIXES).toHaveProperty(p)
    }
  })

  it('jeder Praefix hat eine Vergabe-Phase', () => {
    for (const [, value] of Object.entries(REQ_ID_PREFIXES)) {
      expect(value).toHaveProperty('phase')
      expect((value as any).phase).toBeTruthy()
    }
  })
})

describe('validateReqId (CK-P1-012)', () => {
  const validIds = ['SA-001', 'REQ-042', 'NFR-100', 'BUG-007', 'MFR-001',
    'NRF-999', 'C-001', 'M-123', 'N-456']

  it.each(validIds)('akzeptiert gueltige ID: %s', (id) => {
    expect(validateReqId(id)).toBe(true)
  })

  const invalidIds = [
    'sa-001',       // Kleinschreibung
    'SA001',        // kein Bindestrich
    'SA-01',        // nur 2 Stellen
    'SA-0001',      // 4 Stellen
    'XX-001',       // unbekannter Praefix
    'SA-abc',       // keine Zahl
    '',             // leer
    'REQ-000',      // 000 ungueltig (aufsteigend ab 001)
    'SA - 001'      // Leerzeichen
  ]

  it.each(invalidIds)('lehnt ungueltige ID ab: %s', (id) => {
    expect(validateReqId(id)).toBe(false)
  })
})

describe('parseReqId (CK-P1-012)', () => {
  it('parst SA-001 korrekt', () => {
    const result = parseReqId('SA-001')
    expect(result.prefix).toBe('SA')
    expect(result.number).toBe(1)
    expect(result.phase).toBeTruthy()
    expect(result.phase.toLowerCase()).toContain('ideation')
  })

  it('parst REQ-042 korrekt', () => {
    const result = parseReqId('REQ-042')
    expect(result.prefix).toBe('REQ')
    expect(result.number).toBe(42)
    expect(result.phase.toLowerCase()).toContain('requirement')
  })

  it('parst BUG-007 korrekt', () => {
    const result = parseReqId('BUG-007')
    expect(result.prefix).toBe('BUG')
    expect(result.number).toBe(7)
    expect(result.phase.toLowerCase()).toContain('testing')
  })

  it('parst C-001 korrekt (Audit kritisch)', () => {
    const result = parseReqId('C-001')
    expect(result.prefix).toBe('C')
    expect(result.number).toBe(1)
    expect(result.phase.toLowerCase()).toContain('audit')
  })

  it('wirft Fehler bei ungueltigem Format', () => {
    expect(() => parseReqId('XX-001')).toThrow()
    expect(() => parseReqId('SA-01')).toThrow()
  })
})

describe('checkDuplicates (CK-P1-012)', () => {
  it('gibt leeres Array zurueck wenn keine Duplikate', () => {
    expect(checkDuplicates(['SA-001', 'SA-002', 'REQ-001'])).toEqual([])
  })

  it('gibt Duplikate zurueck', () => {
    const dupes = checkDuplicates(['SA-001', 'REQ-001', 'SA-001'])
    expect(dupes).toContain('SA-001')
  })

  it('erkennt mehrfache Duplikate', () => {
    const dupes = checkDuplicates(['BUG-001', 'BUG-001', 'REQ-001', 'REQ-001'])
    expect(dupes).toContain('BUG-001')
    expect(dupes).toContain('REQ-001')
  })

  it('kein false positive bei verschiedenen Praefixen', () => {
    // SA-001 und REQ-001 sind unterschiedliche IDs
    expect(checkDuplicates(['SA-001', 'REQ-001'])).toEqual([])
  })
})
